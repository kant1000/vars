// ============================================================
// VARS — Vendor Schedule
// Calendar/List toggle (AsyncStorage-persisted)
// Calendar: 3-state slot grid + booked-slot overlay
// List: upcoming bookings in chronological order
// Part 1: types, helpers, calendar view with booked overlay
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions, FlatList, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtDuration, fmtTime, fmtDate } from '@/lib/format';
import { CheckIcon, CloseIcon, PinIcon, LockIcon, LightningIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ─────────────────────────────────────────────────────
type BlockState = 'unavailable' | 'available' | 'auto_accept' | 'transport_buffer';

interface CalendarBlock {
  id: string;
  start_time: string;
  end_time: string;
  block_state: BlockState;
}

export interface VendorBooking {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_duration_blocks: number;
  service_price_kobo: number;
  scheduled_at: string;
  client_name: string;
  client_phone: string | null;
  phone_revealed: boolean;
  user_location_lat: number | null;
  user_location_lng: number | null;
  user_location_address: string | null;
  access_building: string | null;
  access_floor: string | null;
  access_flat: string | null;
  access_code: string | null;
  auto_accepted: boolean;
  auto_accept_grace_expires_at: string | null;
  suggested_scheduled_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const SLOT_W   = (SCREEN_W - 32 - 12) / 2;  // 2-col grid, 12px gap
const STORAGE_KEY = 'vars_vendor_schedule_view';
const ACTIVE_STATUSES: BookingStatus[] = [
  BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY,
  BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED, BOOKING_STATUS.RESCHEDULED_PENDING,
];

// Booked slots use slotBooked (thick ink border). All other states keep a
// faint border — the icon/glyph carries the meaning, not the border weight.
const STATE_STYLE = {
  default:          { border: Colors.inkFaint, bg: 'transparent' },
  unavailable:      { border: Colors.inkFaint, bg: 'transparent' },
  auto_accept:      { border: Colors.inkFaint, bg: 'transparent' },
  transport_buffer: { border: Colors.inkFaint, bg: 'rgba(0,0,0,0.04)' },
};

const STATUS_LABEL: Record<BookingStatus, { text: string; color: string }> = {
  pending:              { text: 'Pending',            color: Colors.statusPending   },
  accepted:             { text: 'Confirmed',          color: Colors.statusAccepted  },
  on_way:               { text: 'On the way',         color: Colors.statusOnWay     },
  arrived:              { text: 'Arrived',            color: Colors.statusArrived   },
  service_rendered:     { text: 'Service done',       color: Colors.primary         },
  completed:            { text: 'Completed',          color: Colors.statusCompleted },
  cancelled:            { text: 'Cancelled',          color: Colors.statusCancelled },
  expired:              { text: 'Expired',            color: Colors.statusExpired   },
  disputed:             { text: 'Under review',       color: Colors.statusDisputed  },
  rescheduled_pending:  { text: 'Reschedule pending', color: Colors.statusPending   },
};


// ── Helpers ───────────────────────────────────────────────────
function addMinutes(d: Date, m: number) { return new Date(d.getTime() + m * 60000); }

function generateSlots(day: Date): Date[] {
  const slots: Date[] = [];
  const start = new Date(day); start.setHours(8, 0, 0, 0);
  const end   = new Date(day); end.setHours(22, 0, 0, 0);
  let cur = new Date(start);
  while (cur < end) { slots.push(new Date(cur)); cur = addMinutes(cur, 30); }
  return slots;
}

function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName;
}

function nextState(current: BlockState | 'default'): BlockState | 'delete' {
  // auto_accept counts as "available" — tapping blocks the slot.
  // There is no manual auto-accept step; the ⚡ Auto-accept button
  // (header) controls zone-level auto-accept for the whole day.
  if (current === 'default' || current === 'available' || current === 'auto_accept') return 'unavailable';
  return 'delete';  // unavailable → back to default/available
}

// ── Effective-day helpers ─────────────────────────────────────
// After the last slot ends at 22:00 the working day is over; treat
// tomorrow as the effective day so the calendar auto-advances.
function getEffectiveToday(): Date {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (now.getHours() >= 22) d.setDate(d.getDate() + 1);
  return d;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── BookingBottomSheet ────────────────────────────────────────
function BookingBottomSheet({
  booking, session, onClose, onAction,
}: {
  booking: VendorBooking;
  session: any;
  onClose: () => void;
  onAction: () => void;
}) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    bottomSheetRef.current?.present();
  }, []);

  const handleClose = () => {
    bottomSheetRef.current?.dismiss();
  };

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [graceSecondsLeft, setGraceSecondsLeft] = useState<number>(0);

  // ── Reschedule state ────────────────────────────────────────
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<{ label: string; slots: { time: Date; available: boolean }[] }[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [suggestedSlot, setSuggestedSlot] = useState<Date | null>(null);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

  useEffect(() => {
    if (!booking.auto_accepted || !booking.auto_accept_grace_expires_at) return;
    const expiry = new Date(booking.auto_accept_grace_expires_at).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setGraceSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [booking.auto_accepted, booking.auto_accept_grace_expires_at]);

  const handleGraceCancel = async () => {
    setActing(true);
    setActionError(null);
    try {
      await callEdgeFn('vendor-cancel-grace', { booking_id: booking.id });
      onAction();
      handleClose();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActing(false);
    }
  };

  const loadRescheduleSlots = async () => {
    setLoadingRescheduleSlots(true);
    const { data: { session: s } } = await supabase.auth.getSession();
    const vendorId = s?.user?.id;
    if (!vendorId) { setLoadingRescheduleSlots(false); return; }

    const days = [
      new Date(new Date(booking.scheduled_at).setHours(0, 0, 0, 0)),
      (() => { const d = new Date(booking.scheduled_at); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; })(),
    ];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);
    const getDayLabel = (d: Date) => {
      if (d.getTime() === today.getTime()) return 'Today';
      if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
      return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const result: typeof rescheduleSlots = [];
    for (const day of days) {
      const dayStart = new Date(day); dayStart.setHours(8, 0, 0, 0);
      const dayEnd   = new Date(day); dayEnd.setHours(22, 0, 0, 0);

      const [{ data: calBlocks }, { data: booked }] = await Promise.all([
        supabase.from('vendor_calendar')
          .select('start_time, end_time, block_state')
          .eq('vendor_id', vendorId)
          .lt('start_time', dayEnd.toISOString())
          .gt('end_time', dayStart.toISOString()),
        supabase.from('bookings')
          .select('id, scheduled_at, service_duration_blocks')
          .eq('vendor_id', vendorId)
          .in('status', [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.RESCHEDULED_PENDING])
          .neq('id', booking.id)
          .gte('scheduled_at', dayStart.toISOString())
          .lt('scheduled_at', dayEnd.toISOString()),
      ]);

      const daySlots: { time: Date; available: boolean }[] = [];
      let cursor = new Date(dayStart);
      const now = new Date();
      const durMs = booking.service_duration_blocks * 30 * 60000;

      while (cursor < dayEnd) {
        const slotStart = new Date(cursor);
        const slotEnd   = new Date(slotStart.getTime() + durMs);
        let available   = slotStart > now && slotEnd <= dayEnd;

        if (available) {
          for (const b of calBlocks ?? []) {
            if (b.block_state !== 'unavailable' && b.block_state !== 'transport_buffer') continue;
            const bS = new Date(b.start_time), bE = new Date(b.end_time);
            if (slotStart < bE && slotEnd > bS) { available = false; break; }
          }
        }
        if (available) {
          for (const bk of booked ?? []) {
            const bS = new Date(bk.scheduled_at);
            const bE = new Date(bS.getTime() + bk.service_duration_blocks * 30 * 60000);
            if (slotStart < bE && slotEnd > bS) { available = false; break; }
          }
        }
        daySlots.push({ time: slotStart, available });
        cursor = new Date(cursor.getTime() + 30 * 60000);
      }
      result.push({ label: getDayLabel(day), slots: daySlots });
    }
    setRescheduleSlots(result);
    setLoadingRescheduleSlots(false);
  };

  const handleSuggestReschedule = async () => {
    if (!suggestedSlot) return;
    setSubmittingReschedule(true);
    setActionError(null);
    try {
      await callEdgeFn('vendor-suggest-reschedule', {
        booking_id: booking.id,
        suggested_at: suggestedSlot.toISOString(),
      });
      onAction();
      handleClose();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const sl = STATUS_LABEL[booking.status];
  const hasMap = booking.user_location_lat != null && booking.user_location_lng != null;
  const accessRevealed = booking.phone_revealed;

  const callEdgeFn = async (fn: string, body: object) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) throw new Error('Session expired. Please sign in again.');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `${fn} failed`);
  };

  const handleAction = async (action: 'accept' | 'decline' | 'on_way' | 'arrived' | 'service_rendered') => {
    if (action === 'accept') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActing(true);
    setActionError(null);
    try {
      if (action === 'accept')   await callEdgeFn('paystack-capture', { booking_id: booking.id });
      if (action === 'decline')  await callEdgeFn('vendor-cancel-booking', { booking_id: booking.id });
      if (action === 'on_way')           await callEdgeFn('vendor-update-job-status', { booking_id: booking.id, new_status: 'on_way' });
      if (action === 'arrived')          await callEdgeFn('vendor-update-job-status', { booking_id: booking.id, new_status: 'arrived' });
      if (action === 'service_rendered') await callEdgeFn('vendor-update-job-status', { booking_id: booking.id, new_status: 'service_rendered' });
      onAction();
      handleClose();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActing(false);
    }
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['65%', '92%']}
      enableDynamicSizing={false}
      onDismiss={onClose}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header row */}
            <View style={bs.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={bs.clientName}>{booking.client_name}</Text>
                <View style={[bs.statusPill, { backgroundColor: sl.color + '18' }]}>
                  <Text style={[bs.statusText, { color: sl.color }]}>{sl.text}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} style={bs.closeBtn}>
                <CloseIcon size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Map thumbnail */}
            {hasMap && (
              <MapView
                style={bs.map}
                provider={PROVIDER_DEFAULT}
                region={{
                  latitude: booking.user_location_lat!,
                  longitude: booking.user_location_lng!,
                  latitudeDelta: 0.003,
                  longitudeDelta: 0.003,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                liteMode={Platform.OS === 'android'}
              >
                <Marker coordinate={{ latitude: booking.user_location_lat!, longitude: booking.user_location_lng! }} />
              </MapView>
            )}

            {booking.user_location_address ? (
              <View style={bs.addressRow}>
                <PinIcon size={14} color={Colors.textSecondary} />
                <Text style={bs.addressText}>{booking.user_location_address}</Text>
              </View>
            ) : null}

            {/* Booking details */}
            <View style={bs.card}>
              <DetailRow label="Service"  value={booking.service_name} />
              <DetailRow label="Date"     value={fmtDate(booking.scheduled_at)} />
              <DetailRow label="Time"     value={fmtTime(booking.scheduled_at)} />
              <DetailRow label="Duration" value={fmtDuration(booking.service_duration_blocks)} />
              <View style={bs.divider} />
              <DetailRow label="Earning"  value={fmtPrice(booking.service_price_kobo)} bold />
            </View>

            {/* Access details */}
            <View style={bs.card}>
              <Text style={bs.sectionTitle}>Access details</Text>
              {accessRevealed ? (
                <>
                  {booking.client_phone && <DetailRow label="Phone" value={booking.client_phone} />}
                  {booking.access_building && <DetailRow label="Building" value={booking.access_building} />}
                  {booking.access_floor   && <DetailRow label="Floor"    value={booking.access_floor} />}
                  {booking.access_flat    && <DetailRow label="Flat"     value={booking.access_flat} />}
                  {booking.access_code    && <DetailRow label="Gate code" value={booking.access_code} />}
                  {!booking.client_phone && !booking.access_building && !booking.access_floor && !booking.access_flat && !booking.access_code && (
                    <Text style={bs.mutedText}>No access details provided.</Text>
                  )}
                </>
              ) : (
                <View style={bs.lockedRow}>
                  <LockIcon size={16} color={Colors.textMuted} />
                  <Text style={bs.lockedText}>Access details are locked to protect customer privacy. They unlock automatically 15 minutes before your arrival.</Text>
                </View>
              )}
            </View>

            {/* Auto-accept grace window banner */}
            {booking.auto_accepted && booking.status === BOOKING_STATUS.ACCEPTED && graceSecondsLeft > 0 && (
              <View style={bs.graceBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={bs.graceTitle}>Auto-accepted booking</Text>
                  <Text style={bs.graceTimer}>
                    {`${Math.floor(graceSecondsLeft / 60)}:${String(graceSecondsLeft % 60).padStart(2, '0')} to cancel penalty-free`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[bs.graceBtn, acting && bs.actionBtnDisabled]}
                  onPress={handleGraceCancel}
                  disabled={acting}
                >
                  {acting
                    ? <ScissorsLoader size="small" color="dark" />
                    : <Text style={bs.graceBtnText}>Cancel penalty-free</Text>}
                </TouchableOpacity>
              </View>
            )}

            {actionError && (
              <View style={bs.errorBox}>
                <Text style={bs.errorText}>{actionError}</Text>
              </View>
            )}

            {/* Action buttons */}
            {booking.status === BOOKING_STATUS.PENDING && !showReschedulePicker && (
              <>
                <View style={bs.actionRow}>
                  <TouchableOpacity
                    style={[bs.actionBtn, bs.actionBtnDecline, acting && bs.actionBtnDisabled]}
                    onPress={() => handleAction('decline')}
                    disabled={acting}
                  >
                    {acting ? <ScissorsLoader size="small" color="dark" /> : <Text style={bs.actionBtnDeclineText}>Decline</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[bs.actionBtn, bs.actionBtnAccept, acting && bs.actionBtnDisabled]}
                    onPress={() => handleAction('accept')}
                    disabled={acting}
                  >
                    {acting ? <ScissorsLoader size="small" color="light" /> : <Text style={bs.actionBtnAcceptText}>Accept</Text>}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[bs.rescheduleBtn, acting && bs.actionBtnDisabled]}
                  onPress={() => { setShowReschedulePicker(true); loadRescheduleSlots(); }}
                  disabled={acting}
                >
                  <Text style={bs.rescheduleBtnText}>Suggest another time</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Inline reschedule picker */}
            {booking.status === BOOKING_STATUS.PENDING && showReschedulePicker && (
              <View style={bs.rescheduleWrap}>
                <Text style={bs.rescheduleHeading}>Suggest another time</Text>
                {loadingRescheduleSlots ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <ScissorsLoader size="small" color="dark" />
                  </View>
                ) : (
                  <>
                    {rescheduleSlots.map(({ label, slots }) => (
                      <View key={label} style={{ marginBottom: 14 }}>
                        <Text style={bs.rescheduleDayLabel}>{label}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                          {slots.map((sl) => (
                            <TouchableOpacity
                              key={sl.time.toISOString()}
                              disabled={!sl.available}
                              onPress={() => setSuggestedSlot(sl.time)}
                              style={[
                                bs.rescheduleChip,
                                !sl.available && bs.rescheduleChipUnavailable,
                                suggestedSlot?.getTime() === sl.time.getTime() && bs.rescheduleChipSelected,
                              ]}
                              activeOpacity={0.8}
                            >
                              <Text style={[
                                bs.rescheduleChipText,
                                !sl.available && bs.rescheduleChipTextUnavailable,
                                suggestedSlot?.getTime() === sl.time.getTime() && bs.rescheduleChipTextSelected,
                              ]}>
                                {fmtTime(sl.time)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    ))}
                    {suggestedSlot && (
                      <TouchableOpacity
                        style={[bs.primaryBtn, submittingReschedule && bs.actionBtnDisabled]}
                        onPress={handleSuggestReschedule}
                        disabled={submittingReschedule}
                      >
                        {submittingReschedule
                          ? <ScissorsLoader size="small" color="light" />
                          : <Text style={bs.primaryBtnText}>Send — {fmtDate(suggestedSlot)} at {fmtTime(suggestedSlot)}</Text>}
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={{ marginTop: 10, alignItems: 'center' }}
                      onPress={() => { setShowReschedulePicker(false); setSuggestedSlot(null); }}
                    >
                      <Text style={{ fontSize: 14, color: Colors.textMuted, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {booking.status === BOOKING_STATUS.RESCHEDULED_PENDING && (
              <View style={bs.waitingBox}>
                <Text style={bs.waitingText}>Reschedule suggestion sent — waiting for customer response</Text>
              </View>
            )}

            {booking.status === BOOKING_STATUS.ACCEPTED && (
              <TouchableOpacity
                style={[bs.primaryBtn, acting && bs.actionBtnDisabled]}
                onPress={() => handleAction('on_way')}
                disabled={acting}
              >
                {acting ? <ScissorsLoader size="small" color="light" /> : <Text style={bs.primaryBtnText}>Mark on my way</Text>}
              </TouchableOpacity>
            )}

            {booking.status === BOOKING_STATUS.ON_WAY && (
              <TouchableOpacity
                style={[bs.primaryBtn, acting && bs.actionBtnDisabled]}
                onPress={() => handleAction('arrived')}
                disabled={acting}
              >
                {acting ? <ScissorsLoader size="small" color="light" /> : <Text style={bs.primaryBtnText}>Mark arrived</Text>}
              </TouchableOpacity>
            )}

            {booking.status === BOOKING_STATUS.ARRIVED && (
              <TouchableOpacity
                style={[bs.primaryBtn, acting && bs.actionBtnDisabled]}
                onPress={() => handleAction('service_rendered')}
                disabled={acting}
              >
                {acting ? <ScissorsLoader size="small" color="light" /> : <Text style={bs.primaryBtnText}>Mark service complete</Text>}
              </TouchableOpacity>
            )}

            {booking.status === BOOKING_STATUS.SERVICE_RENDERED && (
              <View style={bs.waitingBox}>
                <Text style={bs.waitingText}>Awaiting client confirmation to release payment</Text>
              </View>
            )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={bs.detailRow}>
      <Text style={bs.detailLabel}>{label}</Text>
      <Text style={[bs.detailValue, bold && bs.detailValueBold]}>{value}</Text>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────
function LegendDot({ borderColor, backgroundColor = 'transparent', label, glyph, glyphColor, borderWidth = 1.5 }: {
  borderColor: string; backgroundColor?: string; label: string; glyph?: string; glyphColor?: string; borderWidth?: number;
}) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { borderColor, borderWidth, backgroundColor }]}>
        {glyph ? <Text style={{ fontSize: 13, color: glyphColor ?? borderColor, lineHeight: 16 }}>{glyph}</Text> : null}
      </View>
      <Text style={s.legendLabel}>{label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const DAYS = useMemo(() => {
    const base = getEffectiveToday();
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base); d.setDate(d.getDate() + i); return d;
    });
  }, []);

  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => getEffectiveToday());
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<VendorBooking | null>(null);
  const [zoneInfo, setZoneInfo] = useState<{
    enabled: boolean;
    confirmedDate: string | null;
    paused: boolean;
    radius_km: number | null;
    zoneConfigured: boolean;
  } | null>(null);

  // Load persisted view mode
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'list' || v === 'calendar') setViewMode(v);
    });
  }, []);

  const handleViewMode = (mode: 'calendar' | 'list') => {
    setViewMode(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
  };

  // Get vendor id
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setVendorId(user.id);
    });
  }, []);

  // Zone info — re-fetched when the screen is focused (e.g. after returning
  // from zone setup) so the ⚡ indicator is always up to date.
  const loadZoneInfo = useCallback(async () => {
    if (!vendorId) return;
    const { data } = await supabase
      .from('vendors')
      .select('auto_accept_enabled, auto_accept_zone_confirmed_date, auto_accept_paused_due_to_drift, auto_accept_zone_lat, auto_accept_zone_radius_km')
      .eq('id', vendorId)
      .single();
    if (data) {
      setZoneInfo({
        enabled: data.auto_accept_enabled ?? false,
        confirmedDate: data.auto_accept_zone_confirmed_date ?? null,
        paused: data.auto_accept_paused_due_to_drift ?? false,
        radius_km: data.auto_accept_zone_radius_km ?? null,
        zoneConfigured: data.auto_accept_zone_lat != null,
      });
    }
  }, [vendorId]);

  // Re-fetch on focus (e.g. returning from zone setup) AND when vendorId first arrives
  // (vendorId is set async so useFocusEffect alone misses the initial load).
  useFocusEffect(useCallback(() => { loadZoneInfo(); }, [loadZoneInfo]));
  useEffect(() => { loadZoneInfo(); }, [loadZoneInfo]);

  const parseBooking = (b: any): VendorBooking => ({
    id: b.id,
    status: b.status as BookingStatus,
    service_name: b.service_name,
    service_duration_blocks: b.service_duration_blocks,
    service_price_kobo: b.service_price_kobo,
    scheduled_at: b.scheduled_at,
    client_name: b.profiles?.full_name ?? 'Client',
    client_phone: b.profiles?.phone_number ?? null,
    phone_revealed: b.phone_revealed ?? false,
    user_location_lat: b.user_location_lat ?? null,
    user_location_lng: b.user_location_lng ?? null,
    user_location_address: b.user_location_address ?? null,
    access_building: b.access_building ?? null,
    access_floor: b.access_floor ?? null,
    access_flat: b.access_flat ?? null,
    access_code: b.access_code ?? null,
    auto_accepted: b.auto_accepted ?? false,
    auto_accept_grace_expires_at: b.auto_accept_grace_expires_at ?? null,
    suggested_scheduled_at: b.suggested_scheduled_at ?? null,
  });

  const loadData = useCallback(async () => {
    if (!vendorId) return;
    const dayStart = new Date(selectedDay); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(selectedDay); dayEnd.setHours(23, 59, 59, 999);

    const [{ data: calData }, { data: bkData }] = await Promise.all([
      supabase
        .from('vendor_calendar')
        .select('id, start_time, end_time, block_state')
        .eq('vendor_id', vendorId)
        .lt('start_time', dayEnd.toISOString())
        .gt('end_time', dayStart.toISOString())
        .order('start_time'),

      supabase
        .from('bookings')
        .select(`
          id, status, service_name, service_duration_blocks, service_price_kobo,
          scheduled_at, suggested_scheduled_at, phone_revealed, user_location_lat, user_location_lng,
          user_location_address, access_building, access_floor, access_flat, access_code,
          auto_accepted, auto_accept_grace_expires_at,
          profiles:user_id(full_name, phone_number)
        `)
        .eq('vendor_id', vendorId)
        .in('status', ACTIVE_STATUSES)
        .gte('scheduled_at', dayStart.toISOString())
        .lt('scheduled_at', dayEnd.toISOString()),
    ]);

    setBlocks(calData ?? []);
    setBookings((bkData ?? []).map(parseBooking));
    setLoading(false);
  }, [vendorId, selectedDay]);

  useEffect(() => { if (vendorId) loadData(); }, [loadData, vendorId]);

  // ── List view data ────────────────────────────────────────────
  const [listBookings, setListBookings] = useState<VendorBooking[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);

  const loadListBookings = useCallback(async () => {
    if (!vendorId) return;
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_duration_blocks, service_price_kobo,
        scheduled_at, suggested_scheduled_at, phone_revealed, user_location_lat, user_location_lng,
        user_location_address, access_building, access_floor, access_flat, access_code,
        profiles:user_id(full_name, phone_number)
      `)
      .eq('vendor_id', vendorId)
      .in('status', ACTIVE_STATUSES)
      .order('scheduled_at', { ascending: true })
      .limit(40);
    setListBookings((data ?? []).map(parseBooking));
    setListLoading(false);
    setListRefreshing(false);
  }, [vendorId]);

  useEffect(() => {
    if (vendorId && viewMode === 'list') {
      setListLoading(true);
      loadListBookings();
    }
  }, [vendorId, viewMode, loadListBookings]);

  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`bookings:vendor:${vendorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `vendor_id=eq.${vendorId}`,
      }, () => { loadData(); loadListBookings(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [vendorId, loadData, loadListBookings]);

  // ── Live location push while on_way ───────────────────────────
  useEffect(() => {
    const isOnWay = [...bookings, ...listBookings].some((b) => b.status === BOOKING_STATUS.ON_WAY);
    if (!isOnWay || !session?.access_token) return;

    const pushLocation = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.access_token) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      fetch(`${SUPABASE_URL}/functions/v1/vendor-update-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      }).catch(console.error);
    };

    pushLocation();
    const interval = setInterval(pushLocation, 60_000);
    return () => clearInterval(interval);
  }, [bookings, listBookings, session?.access_token]);

  // ── Calendar helpers ──────────────────────────────────────────
  const getBlockForSlot = (slotTime: Date): CalendarBlock | undefined => {
    const t = slotTime.getTime();
    return blocks.find((b) => new Date(b.start_time).getTime() === t);
  };

  const getBookingForSlot = (slotTime: Date): VendorBooking | undefined => {
    return bookings.find((bk) => {
      const bkStart = new Date(bk.scheduled_at);
      const bkEnd   = addMinutes(bkStart, bk.service_duration_blocks * 30);
      return slotTime >= bkStart && slotTime < bkEnd;
    });
  };

  const handleToggle = async (slot: Date) => {
    if (!vendorId || toggling) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const slotIso = slot.toISOString();
    const existing = getBlockForSlot(slot);
    if (existing?.block_state === 'transport_buffer') return;

    const currentState = existing?.block_state ?? 'default';
    const next = nextState(currentState);
    setToggling(slotIso);

    if (next === 'delete') {
      await supabase.from('vendor_calendar').delete().eq('id', existing!.id);
    } else if (existing) {
      await supabase.from('vendor_calendar').update({ block_state: next }).eq('id', existing.id);
    } else {
      await supabase.from('vendor_calendar').insert({
        vendor_id: vendorId,
        start_time: slotIso,
        end_time: addMinutes(slot, 30).toISOString(),
        block_state: next,
      });
    }

    await loadData();
    setToggling(null);
  };

  // ── Slot count summary ────────────────────────────────────────
  // auto_accept is treated as available — only count explicit blocks + buffers as "blocked"
  const unavailCount = blocks.filter(
    (b) => b.block_state === 'unavailable' || b.block_state === 'transport_buffer',
  ).length;

  // Hooks must come before any early return (Rules of Hooks).
  const slots = generateSlots(selectedDay);
  const slotScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (viewMode !== 'calendar' || loading) return;
    const now = new Date();
    const firstFuture = slots.findIndex((slot) => slot >= now);
    if (firstFuture <= 1) return;
    const row = Math.floor(firstFuture / 2);
    const y = 4 + row * 72;
    const timer = setTimeout(() => slotScrollRef.current?.scrollTo({ y, animated: false }), 80);
    return () => clearTimeout(timer);
  }, [slots, viewMode, loading, selectedDay]);

  if (loading) {
    return <View style={s.centered}><ScissorsLoader size="small" color="dark" /></View>;
  }

  // Show ⚡ on available slots only when the vendor has confirmed their zone
  // for the selected day and auto-accept is active (not paused by drift).
  const selectedDayStr = toLocalDateStr(selectedDay);
  const autoAcceptActiveForDay = !!(
    zoneInfo?.enabled && !zoneInfo.paused &&
    zoneInfo.confirmedDate === selectedDayStr
  );

  // Zone icon colour: black when live, grey when not.
  const todayStr = toLocalDateStr(getEffectiveToday());
  const confirmedToday = zoneInfo?.confirmedDate === todayStr;
  const autoAcceptLive = !!(zoneInfo?.enabled && !zoneInfo.paused && confirmedToday);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Schedule</Text>
        <TouchableOpacity style={s.zoneBtn} onPress={() => router.push('/vendor-zone-setup' as any)}>
          <LightningIcon size={13} color={autoAcceptLive ? Colors.success : Colors.textMuted} />
          <Text style={[s.zoneBtnLabel, { color: autoAcceptLive ? Colors.ink : Colors.textMuted }]}>Auto-accept</Text>
        </TouchableOpacity>
      </View>

      {/* Calendar / List toggle */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'calendar' && s.toggleBtnActive]}
          onPress={() => handleViewMode('calendar')}
        >
          <Text style={[s.toggleBtnText, viewMode === 'calendar' && s.toggleBtnTextActive]}>Calendar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
          onPress={() => handleViewMode('list')}
        >
          <Text style={[s.toggleBtnText, viewMode === 'list' && s.toggleBtnTextActive]}>List</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'calendar' ? (
        <>
          {/* Day strip — fixed, does not scroll with the grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayStripScroll} contentContainerStyle={s.dayStrip}>
            {DAYS.map((d) => {
              const active = d.toDateString() === selectedDay.toDateString();
              return (
                <TouchableOpacity
                  key={d.toISOString()}
                  style={[s.dayChip, active && s.dayChipActive]}
                  onPress={() => setSelectedDay(d)}
                >
                  <Text style={[s.dayWeekday, active && s.dayTextActive]}>
                    {d.toLocaleDateString('en-NG', { weekday: 'short' })}
                  </Text>
                  <Text style={[s.dayNum, active && s.dayTextActive]}>{d.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Legend — fixed, one line */}
          <View style={s.legend}>
            <LegendDot borderColor={Colors.inkFaint} label="Available" glyph="✓" glyphColor={Colors.success} />
            <LegendDot borderColor={Colors.inkFaint} label="Blocked" glyph="✕" glyphColor={Colors.accentRed} />
            <LegendDot borderColor={Colors.inkFaint} label="Auto-accept" glyph="⚡" glyphColor={Colors.success} />
            <LegendDot borderColor={Colors.ink} backgroundColor={Colors.ink} label="Booked" borderWidth={2.5} />
          </View>

          {/* Slot grid — scrollable */}
          <ScrollView ref={slotScrollRef} contentContainerStyle={{ paddingBottom: 60, paddingTop: 4 }}>
          <View style={s.grid}>
            {slots.map((slot) => {
              const iso = slot.toISOString();
              const block   = getBlockForSlot(slot);
              const booking = getBookingForSlot(slot);
              const isPast  = slot < new Date();
              const isToggling = toggling === iso;

              if (booking) {
                const isFirstSlot = new Date(booking.scheduled_at).getTime() === slot.getTime();
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[s.slot, s.slotBooked, isPast && s.slotPast]}
                    onPress={() => setSelectedBooking(booking)}
                    activeOpacity={0.75}
                  >
                    {isFirstSlot ? (
                      <>
                        <Text style={s.slotBookedName} numberOfLines={1}>
                          {getFirstName(booking.client_name)}
                        </Text>
                        <Text style={s.slotBookedService} numberOfLines={1}>
                          {booking.service_name}
                        </Text>
                      </>
                    ) : (
                      <View style={s.slotContinuation} />
                    )}
                  </TouchableOpacity>
                );
              }

              const state     = block?.block_state ?? 'default';
              const styleKey  = state as keyof typeof STATE_STYLE;
              const style     = STATE_STYLE[styleKey] ?? STATE_STYLE.default;

              return (
                <TouchableOpacity
                  key={iso}
                  style={[s.slot, { borderColor: style.border, backgroundColor: style.bg }, isPast && s.slotPast]}
                  onPress={() => !isPast && handleToggle(slot)}
                  disabled={isPast || state === 'transport_buffer' || !!isToggling}
                  activeOpacity={0.7}
                >
                  {isToggling ? (
                    <ScissorsLoader size="small" color="dark" />
                  ) : (
                    <>
                      <Text style={[s.slotTime, { color: isPast ? Colors.inkMuted : Colors.ink }]}>
                        {slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </Text>
                      <View style={s.slotGlyph}>
                        {(state === 'unavailable' || state === 'transport_buffer') ? (
                          <CloseIcon size={16} color={Colors.accentRed} />
                        ) : autoAcceptActiveForDay && !isPast ? (
                          <LightningIcon size={14} color={Colors.success} />
                        ) : !isPast ? (
                          <CheckIcon size={16} color={Colors.success} />
                        ) : null}
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Count summary */}
          {(unavailCount > 0 || bookings.length > 0) && (
            <View style={s.summary}>
              <Text style={s.summaryText}>
                {bookings.length > 0 ? `📅 ${bookings.length} booking${bookings.length > 1 ? 's' : ''}` : ''}
                {bookings.length > 0 && unavailCount > 0 ? '  ·  ' : ''}
                {unavailCount > 0 ? `✕ ${unavailCount} blocked` : ''}
              </Text>
            </View>
          )}
          </ScrollView>
        </>
      ) : listLoading ? (
        <View style={s.centered}><ScissorsLoader size="small" color="dark" /></View>
      ) : (
        <FlatList
          data={listBookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={listRefreshing}
              onRefresh={() => { setListRefreshing(true); loadListBookings(); }}
              tintColor="transparent"
              colors={['transparent']}
            />
          }
          ListHeaderComponent={
            listRefreshing ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ScissorsLoader size="small" color="dark" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.listEmpty}>
              <Text style={s.listEmptyTitle}>No upcoming bookings</Text>
              <Text style={s.listEmptyBody}>Active bookings will appear here.</Text>
            </View>
          }
          renderItem={({ item: bk }) => {
            const sl = STATUS_LABEL[bk.status];
            return (
              <TouchableOpacity
                style={s.listCard}
                onPress={() => setSelectedBooking(bk)}
                activeOpacity={0.85}
              >
                <View style={s.listCardTop}>
                  <Text style={s.listClientName}>{bk.client_name}</Text>
                  <View style={[s.listStatusPill, { borderWidth: 1, borderColor: Colors.inkFaint }]}>
                    <Text style={[s.listStatusText, { color: sl.color }]}>{sl.text}</Text>
                  </View>
                </View>
                <Text style={s.listServiceName}>{bk.service_name}</Text>
                <View style={s.listCardBottom}>
                  <Text style={s.listDateTime}>{fmtDate(bk.scheduled_at)} · {fmtTime(bk.scheduled_at)}</Text>
                  <Text style={s.listPrice}>{fmtPrice(bk.service_price_kobo)}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Booking bottom sheet */}
      {selectedBooking && (
        <BookingBottomSheet
          booking={selectedBooking}
          session={session}
          onClose={() => setSelectedBooking(null)}
          onAction={() => { setSelectedBooking(null); loadData(); loadListBookings(); }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  zoneBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.ink, backgroundColor: 'transparent',
  },
  zoneBtnLabel: { fontSize: 13, fontWeight: '700', color: Colors.ink },

  toggleRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: 'transparent', borderRadius: 5,
    borderWidth: 1, borderColor: Colors.ink, padding: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 5, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.ink },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: Colors.inkMuted },
  toggleBtnTextActive: { color: Colors.white },

  dayStripScroll: { height: 68 },
  dayStrip: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  dayChip: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.inkFaint, minWidth: 44,
  },
  dayChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  dayWeekday: { fontSize: 9, color: Colors.textMuted, fontWeight: '600' },
  dayNum: { fontSize: 14, fontWeight: '800', color: Colors.text },
  dayTextActive: { color: '#FFF' },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  legendLabel: { fontSize: 12, color: Colors.textSecondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  slot: {
    width: SLOT_W, height: 60, borderRadius: 5,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  slotPast: { opacity: 0.35 },
  slotTime: { fontSize: 11, fontWeight: '600' },

  // Booked slot — solid black fill with white text
  slotBooked: {
    borderColor: Colors.ink,
    borderWidth: 2.5,
    backgroundColor: Colors.ink,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  slotBookedName: { fontSize: 10, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  slotBookedService: { fontSize: 9, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 1 },
  slotGlyph: { position: 'absolute', bottom: 7, right: 7 },
  slotContinuation: {
    width: '60%', height: 3, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  summary: { paddingHorizontal: 16, paddingTop: 12 },
  summaryText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  // List view
  listEmpty: { alignItems: 'center', paddingTop: 80 },
  listEmptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  listEmptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  listCard: {
    backgroundColor: 'transparent', borderRadius: 5,
    padding: 16, borderWidth: 1, borderColor: Colors.ink, gap: 4,
  },
  listCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  listClientName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  listStatusPill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  listStatusText: { fontSize: 11, fontWeight: '700' },
  listServiceName: { fontSize: 14, color: Colors.textSecondary },
  listCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  listDateTime: { fontSize: 12, color: Colors.textMuted },
  listPrice: { fontSize: 14, fontWeight: '700', color: Colors.text },
});

// ── Bottom sheet styles ───────────────────────────────────────
const bs = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
    maxHeight: '90%', paddingHorizontal: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 5, backgroundColor: Colors.inkFaint,
    alignSelf: 'center', marginVertical: 12,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: 16,
  },
  clientName: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  map: { width: '100%', height: 180, borderRadius: 5, marginBottom: 10, overflow: 'hidden' },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: 'transparent', borderRadius: 5,
    padding: 10, borderWidth: 1, borderColor: Colors.inkFaint,
    marginBottom: 12,
  },
  addressText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },

  card: {
    backgroundColor: 'transparent', borderRadius: 5,
    padding: 14, borderWidth: 1, borderColor: Colors.ink,
    marginBottom: 12, gap: 2,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailLabel: { fontSize: 14, color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  detailValueBold: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },

  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  lockedText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', flex: 1 },
  mutedText: { fontSize: 13, color: Colors.textMuted },

  graceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'transparent', borderRadius: 5, padding: 14,
    borderWidth: 1, borderColor: Colors.ink, marginBottom: 12,
  },
  graceTitle: { fontSize: 12, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  graceTimer: { fontSize: 13, color: Colors.inkMuted },
  graceBtn: {
    borderWidth: 1.5, borderColor: Colors.ink, borderRadius: 5,
    paddingHorizontal: 12, minHeight: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  graceBtnText: { fontSize: 13, fontWeight: '700', color: Colors.ink },

  errorBox: { backgroundColor: Colors.error + '15', borderRadius: 5, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, color: Colors.error, fontWeight: '500' },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1, height: 52, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnAccept: { backgroundColor: Colors.ink },
  actionBtnAcceptText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  actionBtnDecline: { borderWidth: 1.5, borderColor: Colors.ink },
  actionBtnDeclineText: { color: Colors.ink, fontSize: 16, fontWeight: '700' },

  primaryBtn: {
    height: 54, backgroundColor: Colors.ink,
    borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  waitingBox: {
    backgroundColor: 'transparent', borderRadius: 5,
    padding: 14, borderWidth: 1, borderColor: Colors.inkFaint,
    alignItems: 'center', marginTop: 4,
  },
  waitingText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Reschedule suggestion UI
  rescheduleBtn: {
    height: 48, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.ink, marginTop: 8,
  },
  rescheduleBtnText: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  rescheduleWrap: {
    backgroundColor: 'transparent', borderRadius: 5,
    padding: 14, borderWidth: 1, borderColor: Colors.inkFaint, marginBottom: 12,
  },
  rescheduleHeading: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 12 },
  rescheduleDayLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.inkMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  rescheduleChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.ink, alignItems: 'center',
  },
  rescheduleChipUnavailable: { borderColor: Colors.inkFaint, backgroundColor: 'transparent' },
  rescheduleChipSelected: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  rescheduleChipText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  rescheduleChipTextUnavailable: { color: Colors.inkMuted },
  rescheduleChipTextSelected: { color: '#FFF' },
});
