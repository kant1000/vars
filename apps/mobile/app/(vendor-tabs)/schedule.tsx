// ============================================================
// VARS — Vendor Schedule
// Calendar: 3-state slot grid + booked-slot overlay
// Part 1: types, helpers, calendar view with booked overlay
// ============================================================
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Dimensions, Modal, PanResponder, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Calendar as RNCalendar } from 'react-native-calendars';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVendorOnline } from '@/contexts/VendorOnlineContext';
import { VarsButton, VarsSurface, VarsToast } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { fmtPrice, fmtDuration, fmtTime, fmtDate } from '@/lib/format';
import { CheckIcon, CloseIcon, PinIcon, LockIcon, LightningIcon } from '@/components/icons';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { CalendarProps } from '@marceloterreiro/flash-calendar';
// flash-calendar is lazy-loaded so its top-level require('@shopify/flash-list') does not
// run during schedule.tsx module initialisation, which crashed the app in release builds.
const FlashCalendarLazy = React.lazy<React.ComponentType<CalendarProps>>(async () => {
  const module = require('@marceloterreiro/flash-calendar');
  return { default: module.Calendar };
});
const toDateId = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
const fromDateId = (id: string): Date => {
  const [y, mo, dy] = id.split('-').map(Number);
  return new Date(y, mo - 1, dy);
};
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ─────────────────────────────────────────────────────
type BlockState = 'unavailable' | 'available' | 'auto_accept' | 'transport_buffer';

interface UndoPayload {
  toDelete:   string[];
  toRevert:   { id: string; block_state: string }[];
  toReInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[];
}

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
  suggested_scheduled_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const SLOT_W   = (SCREEN_W - 32 - 12) / 2;  // 2-col grid, 12px gap
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


// ── Block-range constants ──────────────────────────────────────
const BR_WORK_START  = 8 * 60;   // 480 min = 08:00
const BR_WORK_END    = 22 * 60;  // 1320 min = 22:00
const BR_STEP        = 30;
const BR_MAX_DAYS    = 56;       // 8 weeks

const BR_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// JS getDay(): 0=Sun,1=Mon,...,6=Sat — Sun-first to match the calendar header
const BR_WEEKDAY_JS     = [0, 1, 2, 3, 4, 5, 6];

function brMinToStr(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m === 0 ? '00' : '30'} ${period}`;
}

function brEndOfWeek(ref: Date): Date {
  const d = new Date(ref); d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow));
  return d;
}

function brBuildDateRange(mode: 'week' | 'until', untilDate: Date | null): Date[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let end: Date;
  if (mode === 'week') {
    end = brEndOfWeek(today);
  } else if (untilDate) {
    const maxEnd = new Date(today); maxEnd.setDate(maxEnd.getDate() + BR_MAX_DAYS);
    const u = new Date(untilDate); u.setHours(0, 0, 0, 0);
    end = u > maxEnd ? maxEnd : u;
  } else {
    return [];
  }
  const dates: Date[] = [];
  const cur = new Date(today);
  while (cur <= end) { dates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

function brCountSlots(
  dates: Date[], weekdays: Set<number>, startMin: number, endMin: number,
): number {
  const now = new Date();
  let count = 0;
  for (const date of dates) {
    if (!weekdays.has(date.getDay())) continue;
    for (let m = startMin; m < endMin; m += BR_STEP) {
      const slot = new Date(date);
      slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (slot > now) count++;
    }
  }
  return count;
}

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
  const { theme } = useVarsTheme();
  const bs = useMemo(() => makeStylesBs(theme), [theme]);

  useEffect(() => {
    bottomSheetRef.current?.present();
  }, []);

  const handleClose = () => {
    bottomSheetRef.current?.dismiss();
  };

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Reschedule state ────────────────────────────────────────
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<{ label: string; slots: { time: Date; available: boolean }[] }[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [suggestedSlot, setSuggestedSlot] = useState<Date | null>(null);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

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
                <CloseIcon size={18} color={theme.color.inkMuted} />
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
              <VarsSurface theme={theme} style={bs.addressRow}>
                <PinIcon size={14} color={theme.color.inkMuted} />
                <Text style={bs.addressText}>{booking.user_location_address}</Text>
              </VarsSurface>
            ) : null}

            {/* Booking details */}
            <VarsSurface theme={theme} style={bs.card}>
              <DetailRow label="Service"  value={booking.service_name} bs={bs} />
              <DetailRow label="Date"     value={fmtDate(booking.scheduled_at)} bs={bs} />
              <DetailRow label="Time"     value={fmtTime(booking.scheduled_at)} bs={bs} />
              <DetailRow label="Duration" value={fmtDuration(booking.service_duration_blocks)} bs={bs} />
              <View style={bs.divider} />
              <DetailRow label="Earning"  value={fmtPrice(booking.service_price_kobo)} bold bs={bs} />
            </VarsSurface>

            {/* Access details */}
            <VarsSurface theme={theme} style={bs.card}>
              <Text style={bs.sectionTitle}>Access details</Text>
              {accessRevealed ? (
                <>
                  {booking.client_phone && <DetailRow label="Phone" value={booking.client_phone} bs={bs} />}
                  {booking.access_building && <DetailRow label="Building" value={booking.access_building} bs={bs} />}
                  {booking.access_floor   && <DetailRow label="Floor"    value={booking.access_floor} bs={bs} />}
                  {booking.access_flat    && <DetailRow label="Flat"     value={booking.access_flat} bs={bs} />}
                  {booking.access_code    && <DetailRow label="Gate code" value={booking.access_code} bs={bs} />}
                  {!booking.client_phone && !booking.access_building && !booking.access_floor && !booking.access_flat && !booking.access_code && (
                    <Text style={bs.mutedText}>No access details provided.</Text>
                  )}
                </>
              ) : (
                <View style={bs.lockedRow}>
                  <LockIcon size={16} color={theme.color.inkMuted} />
                  <Text style={bs.lockedText}>Access details are locked to protect customer privacy. They unlock automatically 15 minutes before your arrival.</Text>
                </View>
              )}
            </VarsSurface>

            {actionError && (
              <View style={bs.errorBox}>
                <Text style={bs.errorText}>{actionError}</Text>
              </View>
            )}

            {/* Action buttons */}
            {booking.status === BOOKING_STATUS.PENDING && !showReschedulePicker && (
              <>
                <View style={bs.actionRow}>
                  <VarsButton
                    theme={theme}
                    variant="secondary"
                    loading={acting}
                    onPress={() => handleAction('decline')}
                    label="Decline"
                    style={bs.actionBtnFlex}
                  />
                  <VarsButton
                    theme={theme}
                    loading={acting}
                    onPress={() => handleAction('accept')}
                    label="Accept"
                    style={bs.actionBtnFlex}
                  />
                </View>
                <VarsButton
                  theme={theme}
                  variant="secondary"
                  disabled={acting}
                  onPress={() => { setShowReschedulePicker(true); loadRescheduleSlots(); }}
                  label="Suggest another time"
                  style={bs.rescheduleBtn}
                />
              </>
            )}

            {/* Inline reschedule picker */}
            {booking.status === BOOKING_STATUS.PENDING && showReschedulePicker && (
              <VarsSurface theme={theme} style={bs.rescheduleWrap}>
                <Text style={bs.rescheduleHeading}>Suggest another time</Text>
                {loadingRescheduleSlots ? (
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
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
                      <VarsButton
                        theme={theme}
                        loading={submittingReschedule}
                        onPress={handleSuggestReschedule}
                        label={`Send — ${fmtDate(suggestedSlot)} at ${fmtTime(suggestedSlot)}`}
                        style={bs.primaryBtn}
                      />
                    )}
                    <TouchableOpacity
                      style={{ marginTop: 10, alignItems: 'center' }}
                      onPress={() => { setShowReschedulePicker(false); setSuggestedSlot(null); }}
                    >
                      <Text style={{ fontSize: 14, color: theme.color.inkMuted, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </VarsSurface>
            )}

            {booking.status === BOOKING_STATUS.RESCHEDULED_PENDING && (
              <VarsSurface theme={theme} style={bs.waitingBox}>
                <Text style={bs.waitingText}>Reschedule suggestion sent — waiting for customer response</Text>
              </VarsSurface>
            )}

            {booking.status === BOOKING_STATUS.ACCEPTED && (
              <VarsButton
                theme={theme}
                loading={acting}
                onPress={() => handleAction('on_way')}
                label="Mark on my way"
                style={bs.primaryBtn}
              />
            )}

            {booking.status === BOOKING_STATUS.ON_WAY && (
              <VarsButton
                theme={theme}
                loading={acting}
                onPress={() => handleAction('arrived')}
                label="Mark arrived"
                style={bs.primaryBtn}
              />
            )}

            {booking.status === BOOKING_STATUS.ARRIVED && (
              <VarsButton
                theme={theme}
                loading={acting}
                onPress={() => handleAction('service_rendered')}
                label="Mark service complete"
                style={bs.primaryBtn}
              />
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

function DetailRow({ label, value, bold, bs }: { label: string; value: string; bold?: boolean; bs: ReturnType<typeof makeStylesBs> }) {
  return (
    <View style={bs.detailRow}>
      <Text style={bs.detailLabel}>{label}</Text>
      <Text style={[bs.detailValue, bold && bs.detailValueBold]}>{value}</Text>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────
function LegendDot({ borderColor, backgroundColor = 'transparent', label, icon, borderWidth = 1.5, s }: {
  borderColor: string; backgroundColor?: string; label: string; icon?: React.ReactNode; borderWidth?: number; s: ReturnType<typeof makeStylesS>;
}) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { borderColor, borderWidth, backgroundColor }]}>
        {icon ?? null}
      </View>
      <Text style={s.legendLabel}>{label}</Text>
    </View>
  );
}

// ── BlockRangeSheet ───────────────────────────────────────────
function BlockRangeSheet({
  vendorId,
  initialDay,
  onClose,
  onSaved,
}: {
  vendorId: string;
  initialDay: Date;
  onClose: () => void;
  onSaved: (count: number, undo: UndoPayload) => void;
}) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useVarsTheme();
  const br = useMemo(() => makeStylesBr(theme), [theme]);
  useEffect(() => { sheetRef.current?.present(); }, []);
  const handleClose = () => sheetRef.current?.dismiss();

  const defaultStart = () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + (now.getMinutes() >= 30 ? 30 : 0) + 30;
    return Math.max(BR_WORK_START, Math.min(nowMin, 21 * 60));
  };

  const [action, setAction]           = useState<'block' | 'unblock'>('block');
  const [startMin, setStartMin]       = useState(() => defaultStart());
  const [endMin, setEndMin]           = useState(() => Math.min(defaultStart() + 120, BR_WORK_END));
  const [weekdays, setWeekdays]       = useState<Set<number>>(() => new Set([initialDay.getDay()]));
  const [repeatMode, setRepeatMode]   = useState<'week' | 'until'>('week');
  const [untilDate, setUntilDate]     = useState<Date | null>(null);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  useEffect(() => {
    if (endMin <= startMin) setEndMin(Math.min(startMin + BR_STEP, BR_WORK_END));
  }, [startMin]);

  const startOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = BR_WORK_START; m <= BR_WORK_END - BR_STEP; m += BR_STEP) opts.push(m);
    return opts;
  }, []);

  const endOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = startMin + BR_STEP; m <= BR_WORK_END; m += BR_STEP) opts.push(m);
    return opts;
  }, [startMin]);

  const toggleWeekday = (jsDay: number) => {
    setWeekdays(prev => {
      const next = new Set(prev);
      if (next.has(jsDay) && next.size > 1) next.delete(jsDay);
      else next.add(jsDay);
      return next;
    });
  };

  const dateRange = useMemo(
    () => brBuildDateRange(repeatMode, untilDate),
    [repeatMode, untilDate],
  );
  const slotCount = useMemo(
    () => brCountSlots(dateRange, weekdays, startMin, endMin),
    [dateRange, weekdays, startMin, endMin],
  );

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);
  const maxUntil = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + BR_MAX_DAYS); return d; }, [today]);

  const canConfirm = slotCount > 0 && !saving && (repeatMode === 'week' || untilDate != null);

  const buildTargetSlots = (): Date[] => {
    const now = new Date();
    const slots: Date[] = [];
    for (const date of dateRange) {
      if (!weekdays.has(date.getDay())) continue;
      for (let m = startMin; m < endMin; m += BR_STEP) {
        const slot = new Date(date);
        slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (slot > now) slots.push(slot);
      }
    }
    return slots;
  };

  const handleSave = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setSaveError(null);
    try {
      const targetSlots = buildTargetSlots();
      if (targetSlots.length === 0) { setSaving(false); return; }

      const rangeStart = targetSlots[0];
      const rangeEnd   = addMinutes(targetSlots[targetSlots.length - 1], BR_STEP);

      const [{ data: calRows }, { data: bkRows }] = await Promise.all([
        supabase.from('vendor_calendar')
          .select('id, start_time, end_time, block_state')
          .eq('vendor_id', vendorId)
          .gte('start_time', rangeStart.toISOString())
          .lt('start_time', rangeEnd.toISOString()),
        supabase.from('bookings')
          .select('scheduled_at, service_duration_blocks')
          .eq('vendor_id', vendorId)
          .in('status', ACTIVE_STATUSES)
          .gte('scheduled_at', rangeStart.toISOString())
          .lt('scheduled_at', rangeEnd.toISOString()),
      ]);

      const calMap = new Map((calRows ?? []).map(r => [r.start_time, r] as const));

      const slotHasBooking = (slot: Date): boolean => {
        const slotEnd = addMinutes(slot, BR_STEP);
        return (bkRows ?? []).some(bk => {
          const bkS = new Date(bk.scheduled_at);
          const bkE = addMinutes(bkS, bk.service_duration_blocks * 30);
          return slot < bkE && slotEnd > bkS;
        });
      };

      let written = 0;
      let undo: UndoPayload;

      if (action === 'block') {
        const toInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];
        const toUpdateRows: { id: string; block_state: string }[] = [];

        for (const slot of targetSlots) {
          const iso = slot.toISOString();
          if (slotHasBooking(slot)) continue;
          const row = calMap.get(iso);
          if (row?.block_state === 'transport_buffer') continue;
          if (row?.block_state === 'unavailable') continue;
          if (row) {
            toUpdateRows.push({ id: row.id, block_state: row.block_state });
          } else {
            toInsert.push({
              vendor_id: vendorId,
              start_time: iso,
              end_time: addMinutes(slot, BR_STEP).toISOString(),
              block_state: 'unavailable',
            });
          }
          written++;
        }

        let insertedIds: string[] = [];
        if (toInsert.length > 0) {
          const { data: inserted, error } = await supabase
            .from('vendor_calendar').insert(toInsert).select('id');
          if (error) throw error;
          insertedIds = (inserted ?? []).map((r: any) => r.id as string);
        }
        for (const { id } of toUpdateRows) {
          await supabase.from('vendor_calendar').update({ block_state: 'unavailable' }).eq('id', id);
        }

        undo = {
          toDelete:   insertedIds,
          toRevert:   toUpdateRows,
          toReInsert: [],
        };
      } else {
        // unblock path
        const idsToDelete: string[] = [];
        const toReInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];

        for (const slot of targetSlots) {
          const iso = slot.toISOString();
          if (slotHasBooking(slot)) continue;
          const row = calMap.get(iso);
          if (!row || row.block_state !== 'unavailable') continue;
          idsToDelete.push(row.id);
          toReInsert.push({
            vendor_id: vendorId,
            start_time: iso,
            end_time: addMinutes(slot, BR_STEP).toISOString(),
            block_state: 'unavailable',
          });
          written++;
        }

        if (idsToDelete.length > 0) {
          const { error } = await supabase.from('vendor_calendar').delete().in('id', idsToDelete);
          if (error) throw error;
        }

        undo = { toDelete: [], toRevert: [], toReInsert };
      }

      handleClose();
      onSaved(written, undo);
    } catch (err: any) {
      setSaveError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const isBlock = action === 'block';

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['75%', '95%']}
      enableDynamicSizing={false}
      onDismiss={onClose}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false} contentContainerStyle={br.scrollContent}>

        {/* Block / Unblock toggle */}
        <View style={br.actionRow}>
          {(['block', 'unblock'] as const).map(a => (
            <TouchableOpacity
              key={a}
              style={[br.actionBtn, action === a && br.actionBtnActive]}
              onPress={() => setAction(a)}
              activeOpacity={0.8}
            >
              <Text style={[br.actionBtnText, action === a && br.actionBtnTextActive]}>
                {a === 'block' ? 'Block' : 'Unblock'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={br.heading}>{isBlock ? 'Block a range' : 'Unblock a range'}</Text>

        <Text style={br.fieldLabel}>From</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={br.chipRow}>
          {startOptions.map(min => (
            <TouchableOpacity
              key={min}
              style={[br.timeChip, startMin === min && br.timeChipActive]}
              onPress={() => setStartMin(min)}
              activeOpacity={0.7}
            >
              <Text style={[br.timeChipText, startMin === min && br.timeChipTextActive]}>
                {brMinToStr(min)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[br.fieldLabel, { marginTop: 14 }]}>To</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={br.chipRow}>
          {endOptions.map(min => (
            <TouchableOpacity
              key={min}
              style={[br.timeChip, endMin === min && br.timeChipActive]}
              onPress={() => setEndMin(min)}
              activeOpacity={0.7}
            >
              <Text style={[br.timeChipText, endMin === min && br.timeChipTextActive]}>
                {brMinToStr(min)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[br.fieldLabel, { marginTop: 18 }]}>Repeat on</Text>
        <View style={br.weekdayRow}>
          {BR_WEEKDAY_LABELS.map((label, i) => {
            const jsDay = BR_WEEKDAY_JS[i];
            const active = weekdays.has(jsDay);
            return (
              <TouchableOpacity
                key={jsDay}
                style={[br.dayChip, active && br.dayChipActive]}
                onPress={() => toggleWeekday(jsDay)}
                activeOpacity={0.7}
              >
                <Text style={[br.dayChipText, active && br.dayChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[br.fieldLabel, { marginTop: 18 }]}>Repeat</Text>
        <View style={br.repeatRow}>
          {(['week', 'until'] as const).map(mode => (
            <TouchableOpacity
              key={mode}
              style={[br.repeatBtn, repeatMode === mode && br.repeatBtnActive]}
              onPress={() => setRepeatMode(mode)}
              activeOpacity={0.8}
            >
              <Text style={[br.repeatBtnText, repeatMode === mode && br.repeatBtnTextActive]}>
                {mode === 'week' ? 'Just this week' : 'Until a date'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {repeatMode === 'until' && (
          <View style={{ marginTop: 12 }}>
            <Suspense fallback={null}>
              <FlashCalendarLazy
                calendarMonthId={toDateId(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1))}
                calendarMinDateId={toDateId(tomorrow)}
                calendarMaxDateId={toDateId(maxUntil)}
                calendarActiveDateRanges={
                  untilDate ? [{ startId: toDateId(untilDate), endId: toDateId(untilDate) }] : []
                }
                onCalendarDayPress={(dateId: string) => setUntilDate(fromDateId(dateId))}
                theme={{
                  itemDay: {
                    active: () => ({
                      container: { backgroundColor: theme.color.ink },
                      content: { color: theme.color.inverseInk },
                    }),
                    today: () => ({
                      content: { color: theme.color.ink, fontWeight: '700' },
                    }),
                  },
                  rowMonth: {
                    content: { color: theme.color.ink, fontWeight: '700', fontSize: 15 },
                  },
                }}
              />
            </Suspense>
          </View>
        )}

        {slotCount > 0 && (
          <View style={br.preview}>
            <Text style={br.previewText}>
              {isBlock
                ? `This will block up to ${slotCount} slot${slotCount !== 1 ? 's' : ''}.`
                : `This will unblock up to ${slotCount} slot${slotCount !== 1 ? 's' : ''}.`}
            </Text>
          </View>
        )}

        {saveError != null && (
          <View style={br.errorBox}>
            <Text style={br.errorText}>{saveError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[br.confirmBtn, !canConfirm && br.confirmBtnDisabled]}
          onPress={handleSave}
          disabled={!canConfirm}
          activeOpacity={0.85}
        >
          {saving
            ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
            : <Text style={br.confirmBtnText}>
                {slotCount > 0
                  ? `${isBlock ? 'Block' : 'Unblock'} ${slotCount} slot${slotCount !== 1 ? 's' : ''}`
                  : isBlock ? 'Block slots' : 'Unblock slots'}
              </Text>}
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isOnline } = useVendorOnline();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStylesS(theme), [theme]);
  const cal = useMemo(() => makeStylesCal(theme), [theme]);

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => getEffectiveToday());
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<VendorBooking | null>(null);
  const [blockRangeOpen, setBlockRangeOpen] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ msg: string; undo: UndoPayload } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeStartRef = useRef<string | null>(null);

  // Calendar modal state
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [dayDots, setDayDots] = useState<Record<string, boolean>>({});
  const [blockingDay, setBlockingDay] = useState(false);
  const [blockingRange, setBlockingRange] = useState(false);
  // Recurring weekly blocks
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [savingRecurring, setSavingRecurring] = useState(false);
  const loadDataRef = useRef<() => Promise<void>>(async () => {});
  const [zoneInfo, setZoneInfo] = useState<{
    enabled: boolean;
    confirmedDate: string | null;
    paused: boolean;
    radius_km: number | null;
    zoneConfigured: boolean;
  } | null>(null);

  const showSavedInfo = useCallback((count: number, verb: string, undo: UndoPayload) => {
    setSavedInfo({ msg: `${count} slot${count !== 1 ? 's' : ''} ${verb}.`, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSavedInfo(null), 3000);
  }, []);

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
      .select('auto_accept_enabled, auto_accept_zone_confirmed_date, auto_accept_paused_due_to_drift, auto_accept_zone_lat, auto_accept_zone_radius_km, recurring_block_weekdays')
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
      const days = ((data as any).recurring_block_weekdays ?? []) as number[];
      setRecurringDays(days);
      // Apply recurring blocks inline so we use the fresh values, not stale state
      if (days.length > 0 && vendorId) applyRecurringBlocksDirect(vendorId, days);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  // Re-fetch on focus (e.g. returning from zone setup) AND when vendorId first arrives
  // (vendorId is set async so useFocusEffect alone misses the initial load).
  useFocusEffect(useCallback(() => { loadZoneInfo(); }, [loadZoneInfo]));
  useEffect(() => { loadZoneInfo(); }, [loadZoneInfo]);

  const loadDayDots = useCallback(async () => {
    if (!vendorId) return;
    const now   = new Date();
    const base  = getEffectiveToday();
    const maxD  = new Date(base); maxD.setDate(maxD.getDate() + 13); maxD.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('vendor_calendar')
      .select('start_time')
      .eq('vendor_id', vendorId)
      .eq('block_state', 'unavailable')
      .gte('start_time', base.toISOString())
      .lte('start_time', maxD.toISOString());
    if (!data) return;
    // Build a count of blocked future slots per day
    const blocked: Record<string, number> = {};
    for (const row of data) {
      const key = toLocalDateStr(new Date(row.start_time));
      blocked[key] = (blocked[key] ?? 0) + 1;
    }
    // Mark days where every future slot is blocked
    const dots: Record<string, boolean> = {};
    const cur = new Date(base);
    while (cur <= maxD) {
      const dayStr = toLocalDateStr(cur);
      const futureCount = generateSlots(cur).filter(s => s > now).length;
      if (futureCount > 0 && (blocked[dayStr] ?? 0) >= futureCount) dots[dayStr] = true;
      cur.setDate(cur.getDate() + 1);
    }
    setDayDots(dots);
  }, [vendorId]);

  useEffect(() => { if (vendorId) loadDayDots(); }, [vendorId, loadDayDots]);

  // ── Recurring block helpers ───────────────────────────────────
  // Plain async (not useCallback) so loadZoneInfo can call it with fresh
  // values from the DB without stale-closure issues.
  async function applyRecurringBlocksDirect(vid: string, days: number[]) {
    if (days.length === 0) return;
    const effectiveToday = getEffectiveToday();
    const maxD = new Date(effectiveToday); maxD.setDate(maxD.getDate() + 13);
    const now = new Date();
    const windowStart = new Date(effectiveToday); windowStart.setHours(0, 0, 0, 0);
    const windowEnd   = new Date(maxD);           windowEnd.setHours(23, 59, 59, 999);

    const [{ data: existingBlocks }, { data: bkRows }] = await Promise.all([
      supabase.from('vendor_calendar')
        .select('id, start_time, block_state')
        .eq('vendor_id', vid)
        .gte('start_time', windowStart.toISOString())
        .lte('start_time', windowEnd.toISOString()),
      supabase.from('bookings')
        .select('scheduled_at, service_duration_blocks')
        .eq('vendor_id', vid)
        .in('status', ACTIVE_STATUSES)
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString()),
    ]);

    const blockMap = new Map<number, { id: string; block_state: string }>();
    for (const b of existingBlocks ?? []) blockMap.set(new Date(b.start_time).getTime(), { id: b.id, block_state: b.block_state });

    const bookedSet = new Set<number>();
    for (const bk of bkRows ?? []) {
      const bkStart = new Date(bk.scheduled_at);
      for (let i = 0; i < bk.service_duration_blocks; i++) bookedSet.add(addMinutes(bkStart, i * 30).getTime());
    }

    const toInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];
    const toUpdateIds: string[] = [];
    const cur = new Date(effectiveToday);
    while (cur <= maxD) {
      if (days.includes(cur.getDay())) {
        for (const slot of generateSlots(cur).filter(s => s > now)) {
          if (bookedSet.has(slot.getTime())) continue;
          const ex = blockMap.get(slot.getTime());
          if (!ex) {
            toInsert.push({ vendor_id: vid, start_time: slot.toISOString(), end_time: addMinutes(slot, 30).toISOString(), block_state: 'unavailable' });
          } else if (ex.block_state !== 'unavailable' && ex.block_state !== 'transport_buffer') {
            toUpdateIds.push(ex.id);
          }
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    const ops: PromiseLike<unknown>[] = [];
    if (toInsert.length > 0) ops.push(supabase.from('vendor_calendar').insert(toInsert));
    for (const id of toUpdateIds) ops.push(supabase.from('vendor_calendar').update({ block_state: 'unavailable' }).eq('id', id));
    if (ops.length > 0) await Promise.all(ops);
  }

  const handleAddRecurringDay = useCallback(async (jsDay: number) => {
    if (!vendorId || savingRecurring || recurringDays.includes(jsDay)) return;
    setSavingRecurring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newDays = [...recurringDays, jsDay];
    await supabase.from('vendors').update({ recurring_block_weekdays: newDays }).eq('id', vendorId);
    setRecurringDays(newDays);
    await applyRecurringBlocksDirect(vendorId, newDays);
    await loadDataRef.current();
    await loadDayDots();
    setSavingRecurring(false);
  }, [vendorId, recurringDays, savingRecurring, loadDayDots]);

  const handleRemoveRecurringDay = useCallback(async (jsDay: number) => {
    if (!vendorId || savingRecurring) return;
    setSavingRecurring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newDays = recurringDays.filter(d => d !== jsDay);
    await supabase.from('vendors').update({ recurring_block_weekdays: newDays }).eq('id', vendorId);
    setRecurringDays(newDays);
    // Remove future unbooked blocks for that weekday across the window
    const effectiveToday = getEffectiveToday();
    const maxD = new Date(effectiveToday); maxD.setDate(maxD.getDate() + 13);
    const now = new Date();
    const windowStart = new Date(effectiveToday); windowStart.setHours(0, 0, 0, 0);
    const windowEnd   = new Date(maxD);           windowEnd.setHours(23, 59, 59, 999);
    const [{ data: blockedRows }, { data: bkRows }] = await Promise.all([
      supabase.from('vendor_calendar').select('id, start_time')
        .eq('vendor_id', vendorId).eq('block_state', 'unavailable')
        .gte('start_time', windowStart.toISOString()).lte('start_time', windowEnd.toISOString()),
      supabase.from('bookings').select('scheduled_at, service_duration_blocks')
        .eq('vendor_id', vendorId).in('status', ACTIVE_STATUSES)
        .gte('scheduled_at', windowStart.toISOString()).lte('scheduled_at', windowEnd.toISOString()),
    ]);
    const bookedSet = new Set<number>();
    for (const bk of bkRows ?? []) {
      const bkStart = new Date(bk.scheduled_at);
      for (let i = 0; i < bk.service_duration_blocks; i++) bookedSet.add(addMinutes(bkStart, i * 30).getTime());
    }
    const idsToDelete = (blockedRows ?? [])
      .filter(r => { const t = new Date(r.start_time); return t > now && t.getDay() === jsDay && !bookedSet.has(t.getTime()); })
      .map(r => r.id);
    if (idsToDelete.length > 0) await supabase.from('vendor_calendar').delete().in('id', idsToDelete);
    await loadDataRef.current();
    await loadDayDots();
    setSavingRecurring(false);
  }, [vendorId, recurringDays, savingRecurring, loadDayDots]);

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
          auto_accepted,
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
  loadDataRef.current = loadData;

  useEffect(() => { if (vendorId) loadData(); }, [loadData, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`bookings:vendor:${vendorId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `vendor_id=eq.${vendorId}`,
      }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [vendorId, loadData]);

  // ── Live location push while on_way ───────────────────────────
  useEffect(() => {
    const isOnWay = bookings.some((b) => b.status === BOOKING_STATUS.ON_WAY);
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
  }, [bookings, session?.access_token]);

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
    if (loading) return;
    const effectiveToday = getEffectiveToday();
    const isToday = selectedDay.toDateString() === effectiveToday.toDateString();
    if (!isToday) {
      const timer = setTimeout(() => slotScrollRef.current?.scrollTo({ y: 0, animated: false }), 80);
      return () => clearTimeout(timer);
    }
    const now = new Date();
    const firstFuture = slots.findIndex((slot) => slot >= now);
    if (firstFuture <= 1) return;
    const row = Math.floor(firstFuture / 2);
    const y = 4 + row * 72;
    const timer = setTimeout(() => slotScrollRef.current?.scrollTo({ y, animated: false }), 80);
    return () => clearTimeout(timer);
  }, [slots, loading, selectedDay]);

  const handleBlockDay = useCallback(async () => {
    if (!vendorId || blockingDay) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBlockingDay(true);
    const now = new Date();
    const futureSlots = generateSlots(selectedDay).filter(s => s > now);
    // Slots covered by active bookings are untouched
    const bookedSet = new Set<number>();
    for (const bk of bookings) {
      const bkStart = new Date(bk.scheduled_at);
      for (let i = 0; i < bk.service_duration_blocks; i++) {
        bookedSet.add(addMinutes(bkStart, i * 30).getTime());
      }
    }
    const targetSlots = futureSlots.filter(s => !bookedSet.has(s.getTime()));
    if (targetSlots.length === 0) { setBlockingDay(false); return; }
    const isAllBlocked = targetSlots.every(s => getBlockForSlot(s)?.block_state === 'unavailable');
    if (isAllBlocked) {
      const toDelete = blocks
        .filter(b => b.block_state === 'unavailable' && targetSlots.some(s => s.getTime() === new Date(b.start_time).getTime()))
        .map(b => b.id);
      const undo: UndoPayload = {
        toDelete: [],
        toRevert: [],
        toReInsert: toDelete.map(id => {
          const b = blocks.find(b => b.id === id)!;
          return { vendor_id: vendorId, start_time: b.start_time, end_time: b.end_time, block_state: 'unavailable' };
        }),
      };
      if (toDelete.length > 0) await supabase.from('vendor_calendar').delete().in('id', toDelete);
      await loadData();
      await loadDayDots();
      showSavedInfo(toDelete.length, 'unblocked', undo);
    } else {
      const toInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];
      const toRevert: { id: string; block_state: string }[] = [];
      for (const slot of targetSlots) {
        const b = getBlockForSlot(slot);
        if (b?.block_state === 'unavailable') continue;
        if (b) {
          toRevert.push({ id: b.id, block_state: b.block_state });
          await supabase.from('vendor_calendar').update({ block_state: 'unavailable' }).eq('id', b.id);
        } else {
          toInsert.push({ vendor_id: vendorId, start_time: slot.toISOString(), end_time: addMinutes(slot, 30).toISOString(), block_state: 'unavailable' });
        }
      }
      let insertedIds: string[] = [];
      if (toInsert.length > 0) {
        const { data: ins } = await supabase.from('vendor_calendar').insert(toInsert).select('id');
        insertedIds = (ins ?? []).map((r: any) => r.id as string);
      }
      await loadData();
      await loadDayDots();
      showSavedInfo(toInsert.length + toRevert.length, 'blocked', { toDelete: insertedIds, toRevert, toReInsert: [] });
    }
    setBlockingDay(false);
  }, [vendorId, selectedDay, blocks, bookings, blockingDay, loadData, loadDayDots, getBlockForSlot, showSavedInfo]);

  const handleRangeBlock = useCallback(async () => {
    if (!vendorId || !rangeStart || blockingRange) return;
    const effectiveEnd = rangeEnd ?? rangeStart;
    setBlockingRange(true);
    setCalendarOpen(false);
    setRangeStart(null);
    setRangeEnd(null);
    rangeStartRef.current = null;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now        = new Date();
    const startDate  = fromDateId(rangeStart);
    const endDate    = fromDateId(effectiveEnd);
    const startOfRange = new Date(startDate); startOfRange.setHours(0, 0, 0, 0);
    const endOfRange   = new Date(endDate);   endOfRange.setHours(23, 59, 59, 999);
    const [{ data: existingBlocks }, { data: rangeBookings }] = await Promise.all([
      supabase.from('vendor_calendar')
        .select('id, start_time, end_time, block_state')
        .eq('vendor_id', vendorId)
        .gte('start_time', startOfRange.toISOString())
        .lte('start_time', endOfRange.toISOString()),
      supabase.from('bookings')
        .select('scheduled_at, service_duration_blocks')
        .eq('vendor_id', vendorId)
        .in('status', ACTIVE_STATUSES)
        .gte('scheduled_at', startOfRange.toISOString())
        .lte('scheduled_at', endOfRange.toISOString()),
    ]);
    const bookedSet = new Set<number>();
    for (const bk of rangeBookings ?? []) {
      const bkStart = new Date(bk.scheduled_at);
      for (let i = 0; i < bk.service_duration_blocks; i++) bookedSet.add(addMinutes(bkStart, i * 30).getTime());
    }
    const blockMap = new Map<number, { id: string; block_state: string }>();
    for (const b of existingBlocks ?? []) blockMap.set(new Date(b.start_time).getTime(), { id: b.id, block_state: b.block_state });
    // Collect all target slots
    const targetSlots: Date[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      for (const slot of generateSlots(cur).filter(s => s > now && !bookedSet.has(s.getTime()))) {
        targetSlots.push(slot);
      }
      cur.setDate(cur.getDate() + 1);
    }
    const allAlreadyBlocked = targetSlots.length > 0 &&
      targetSlots.every(slot => blockMap.get(slot.getTime())?.block_state === 'unavailable');
    let insertedIds: string[] = [];
    let written = 0;
    let verb: string;
    let undo: UndoPayload;
    if (allAlreadyBlocked) {
      // Unblock
      const idsToDelete: string[] = [];
      const toReInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];
      for (const slot of targetSlots) {
        const ex = blockMap.get(slot.getTime());
        if (!ex || ex.block_state !== 'unavailable') continue;
        idsToDelete.push(ex.id);
        toReInsert.push({ vendor_id: vendorId, start_time: slot.toISOString(), end_time: addMinutes(slot, 30).toISOString(), block_state: 'unavailable' });
        written++;
      }
      if (idsToDelete.length > 0) await supabase.from('vendor_calendar').delete().in('id', idsToDelete);
      verb = 'unblocked';
      undo = { toDelete: [], toRevert: [], toReInsert };
    } else {
      // Block
      const toInsert: { vendor_id: string; start_time: string; end_time: string; block_state: string }[] = [];
      const toRevert: { id: string; block_state: string }[] = [];
      for (const slot of targetSlots) {
        const ex = blockMap.get(slot.getTime());
        if (ex?.block_state === 'unavailable' || ex?.block_state === 'transport_buffer') continue;
        if (ex) {
          toRevert.push({ id: ex.id, block_state: ex.block_state });
          await supabase.from('vendor_calendar').update({ block_state: 'unavailable' }).eq('id', ex.id);
        } else {
          toInsert.push({ vendor_id: vendorId, start_time: slot.toISOString(), end_time: addMinutes(slot, 30).toISOString(), block_state: 'unavailable' });
        }
        written++;
      }
      if (toInsert.length > 0) {
        const { data: ins } = await supabase.from('vendor_calendar').insert(toInsert).select('id');
        insertedIds = (ins ?? []).map((r: any) => r.id as string);
      }
      verb = 'blocked';
      undo = { toDelete: insertedIds, toRevert, toReInsert: [] };
    }
    await loadData();
    await loadDayDots();
    showSavedInfo(written, verb, undo);
    setBlockingRange(false);
  }, [vendorId, rangeStart, rangeEnd, blockingRange, loadData, loadDayDots, showSavedInfo]);

  const handleUndo = async (undo: UndoPayload) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setSavedInfo(null);
    setUndoing(true);
    try {
      if (undo.toDelete.length > 0) {
        await supabase.from('vendor_calendar').delete().in('id', undo.toDelete);
      }
      for (const row of undo.toRevert) {
        await supabase.from('vendor_calendar').update({ block_state: row.block_state }).eq('id', row.id);
      }
      if (undo.toReInsert.length > 0) {
        await supabase.from('vendor_calendar').insert(undo.toReInsert);
      }
      loadData();
      loadDayDots();
    } catch {
      // best-effort undo — silently ignore failures
    } finally {
      setUndoing(false);
    }
  };

  if (loading) {
    return <View style={s.centered}><ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>;
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
        <TouchableOpacity
          style={[s.zoneBtn, !isOnline && s.zoneBtnDisabled]}
          onPress={() => {
            if (!isOnline) {
              Alert.alert('Go online first', 'Go online on the Jobs tab before configuring auto-accept.');
              return;
            }
            router.push('/vendor-zone-setup' as any);
          }}
        >
          <LightningIcon size={13} color={autoAcceptLive ? theme.color.accentGreen : theme.color.inkMuted} />
          <Text style={[s.zoneBtnLabel, { color: autoAcceptLive ? theme.color.ink : theme.color.inkMuted }]}>Auto-accept</Text>
        </TouchableOpacity>
      </View>

          {/* Day nav — replaces day strip */}
          {(() => {
            const effectiveToday = getEffectiveToday();
            const maxNavDay = new Date(effectiveToday); maxNavDay.setDate(maxNavDay.getDate() + 13);
            const isFirstDay = selectedDay.toDateString() === effectiveToday.toDateString();
            const isLastDay  = selectedDay.toDateString() === maxNavDay.toDateString();
            const realToday  = new Date(); realToday.setHours(0, 0, 0, 0);
            const effectiveIsTomorrow = effectiveToday.getTime() !== realToday.getTime();
            const dateLabel  = isFirstDay
              ? (effectiveIsTomorrow ? 'Tomorrow' : 'Today')
              : `${WEEKDAY_NAMES[selectedDay.getDay()]}, ${selectedDay.getDate()} ${MONTH_SHORT[selectedDay.getMonth()]}`;
            return (
              <View style={s.dayNavRow}>
                <TouchableOpacity
                  onPress={() => setSelectedDay(prev => { const d = new Date(prev); d.setDate(d.getDate() - 1); return d; })}
                  disabled={isFirstDay}
                  hitSlop={10}
                  style={s.navArrowBtn}
                >
                  <Text style={[s.navArrow, isFirstDay && s.navArrowDisabled]}>‹</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { loadDayDots(); setCalendarOpen(true); }}
                  style={s.dateLabelWrap}
                >
                  <Text style={s.dateLabel}>{dateLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedDay(prev => { const d = new Date(prev); d.setDate(d.getDate() + 1); return d; })}
                  disabled={isLastDay}
                  hitSlop={10}
                  style={s.navArrowBtn}
                >
                  <Text style={[s.navArrow, isLastDay && s.navArrowDisabled]}>›</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

          {/* Block day + Today nav */}
          {(() => {
            const effectiveToday = getEffectiveToday();
            const isOnToday = selectedDay.toDateString() === effectiveToday.toDateString();
            const now = new Date();
            const realToday2 = new Date(); realToday2.setHours(0, 0, 0, 0);
            const effectiveIsTomorrow2 = effectiveToday.getTime() !== realToday2.getTime();
            const futureNonBooked = generateSlots(selectedDay).filter(s => s > now && !getBookingForSlot(s));
            const allBlocked = futureNonBooked.length > 0 && futureNonBooked.every(s => getBlockForSlot(s)?.block_state === 'unavailable');
            if (futureNonBooked.length === 0 && isOnToday) return null;
            return (
              <View style={s.blockDayRow}>
                {futureNonBooked.length > 0 && (
                  <TouchableOpacity
                    style={s.blockDayBtn}
                    onPress={handleBlockDay}
                    disabled={blockingDay}
                    activeOpacity={0.75}
                  >
                    {blockingDay
                      ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
                      : <Text style={s.blockDayBtnText}>{allBlocked ? 'Unblock day' : 'Block day'}</Text>
                    }
                  </TouchableOpacity>
                )}
                {!isOnToday && (
                  <TouchableOpacity
                    style={s.todayBtn}
                    onPress={() => setSelectedDay(effectiveToday)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.todayBtnText}>{effectiveIsTomorrow2 ? 'Go to tomorrow' : 'Go to today'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

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
                    <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
                  ) : (
                    <>
                      <Text style={[s.slotTime, { color: isPast ? theme.color.inkMuted : theme.color.ink }]}>
                        {slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </Text>
                      <View style={s.slotGlyph}>
                        {(state === 'unavailable' || state === 'transport_buffer') ? (
                          <CloseIcon size={16} color={theme.color.accentRed} />
                        ) : autoAcceptActiveForDay && !isPast ? (
                          <LightningIcon size={14} color={theme.color.accentGreen} />
                        ) : !isPast ? (
                          <CheckIcon size={16} color={theme.color.accentGreen} />
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

      {/* Saved toast */}
      {undoing && (
        <View style={s.savedToast}>
          <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
        </View>
      )}
      {savedInfo != null && !undoing && (
        <View style={s.savedToastWrap}>
          <VarsToast
            theme={theme}
            message={savedInfo.msg}
            actionLabel="Undo"
            onAction={() => handleUndo(savedInfo.undo)}
          />
        </View>
      )}

      {/* Booking bottom sheet */}
      {selectedBooking && (
        <BookingBottomSheet
          booking={selectedBooking}
          session={session}
          onClose={() => setSelectedBooking(null)}
          onAction={() => { setSelectedBooking(null); loadData(); }}
        />
      )}

      {/* Block range sheet */}
      {blockRangeOpen && vendorId && (
        <BlockRangeSheet
          vendorId={vendorId}
          initialDay={selectedDay}
          onClose={() => setBlockRangeOpen(false)}
          onSaved={(count, undo) => {
            setBlockRangeOpen(false);
            loadData();
            const isUnblock = undo.toReInsert.length > 0;
            showSavedInfo(count, isUnblock ? 'unblocked' : 'blocked', undo);
          }}
        />
      )}

      {/* Calendar modal */}
      {calendarOpen && (() => {
        const effectiveToday = getEffectiveToday();
        const maxNavDay = new Date(effectiveToday); maxNavDay.setDate(maxNavDay.getDate() + 13);
        const markedDates: Record<string, any> = {};
        // Red dots for fully-blocked days
        for (const [ds, blocked] of Object.entries(dayDots)) {
          if (blocked) markedDates[ds] = { ...markedDates[ds], marked: true, dotColor: theme.color.accentRed };
        }
        // Range highlighting
        if (rangeStart) {
          const end = rangeEnd ?? rangeStart;
          const cur = new Date(fromDateId(rangeStart));
          const endD = fromDateId(end);
          while (cur <= endD) {
            const ds = toDateId(cur);
            const isS = ds === rangeStart;
            const isE = ds === end;
            markedDates[ds] = {
              ...(markedDates[ds] ?? {}),
              startingDay: isS,
              endingDay: isE,
              color: isS || isE ? theme.color.ink : 'rgba(0,0,0,0.10)',
              textColor: isS || isE ? theme.color.inverseInk : theme.color.ink,
            };
            cur.setDate(cur.getDate() + 1);
          }
        }
        const closeCalendar = () => {
          setCalendarOpen(false);
          setRangeStart(null);
          setRangeEnd(null);
          rangeStartRef.current = null;
        };
        const handlePan = PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_, gs) => gs.dy > 2,
          onPanResponderRelease: (_, gs) => { if (gs.dy > 50) closeCalendar(); },
        });
        // Check if entire selected range is fully blocked (for Unblock label)
        const rangeAllBlocked = rangeStart ? (() => {
          const end = rangeEnd ?? rangeStart;
          const c = new Date(fromDateId(rangeStart));
          const ed = fromDateId(end);
          while (c <= ed) {
            if (!dayDots[toLocalDateStr(c)]) return false;
            c.setDate(c.getDate() + 1);
          }
          return true;
        })() : false;
        return (
          <Modal transparent animationType="slide" onRequestClose={closeCalendar}>
            <View style={cal.overlay}>
              <TouchableOpacity style={cal.backdrop} onPress={closeCalendar} activeOpacity={1} />
              <View style={cal.sheet}>
                {/* Full-width drag zone so the handle is easy to grab */}
                <View {...handlePan.panHandlers} style={cal.handleZone}>
                  <View style={cal.handle} />
                </View>
                <RNCalendar
                  minDate={toDateId(effectiveToday)}
                  maxDate={toDateId(maxNavDay)}
                  markedDates={markedDates}
                  markingType="period"
                  dayComponent={({ date, marking }: any) => {
                    const ds: string = date.dateString;
                    const minDs = toDateId(effectiveToday);
                    const maxDs = toDateId(maxNavDay);
                    const inWindow = ds >= minDs && ds <= maxDs;
                    const isToday = ds === minDs;
                    const hasDot = marking?.marked;
                    const isStart = !!marking?.startingDay;
                    const isEnd = !!marking?.endingDay;
                    const periodColor: string | undefined = marking?.color;
                    const isMiddle = !!periodColor && !isStart && !isEnd;
                    const isSingleSel = isStart && isEnd;
                    const textCol = !inWindow
                      ? theme.color.inkFaint
                      : (isStart || isEnd) ? theme.color.inverseInk : theme.color.ink;
                    const BAND = 'rgba(0,0,0,0.09)';
                    return (
                      <TouchableOpacity
                        disabled={!inWindow}
                        onPress={() => {
                          const cur = rangeStartRef.current;
                          if (cur && rangeEnd) {
                            // Range already set — update end date if after start, ignore otherwise
                            if (ds > cur) setRangeEnd(ds);
                            return;
                          }
                          if (cur && !rangeEnd) {
                            if (ds <= cur) { rangeStartRef.current = ds; setRangeEnd(cur); setRangeStart(ds); }
                            else { setRangeEnd(ds); }
                            return;
                          }
                          setSelectedDay(fromDateId(ds));
                          closeCalendar();
                        }}
                        onLongPress={() => {
                          if (!inWindow) return;
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          rangeStartRef.current = ds;
                          setRangeStart(ds);
                          setRangeEnd(null);
                        }}
                        activeOpacity={0.7}
                        style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {/* Connecting band — right-half for start, full for middle, left-half for end */}
                        {isStart && !isSingleSel && (
                          <View style={{ position: 'absolute', left: '50%', right: 0, top: 10, bottom: 10, backgroundColor: BAND }} />
                        )}
                        {isMiddle && (
                          <View style={{ position: 'absolute', left: 0, right: 0, top: 10, bottom: 10, backgroundColor: BAND }} />
                        )}
                        {isEnd && !isSingleSel && (
                          <View style={{ position: 'absolute', left: 0, right: '50%', top: 10, bottom: 10, backgroundColor: BAND }} />
                        )}
                        <View style={{ width: 26, height: 26, borderRadius: 13,
                          backgroundColor: (isStart || isEnd) ? theme.color.ink : 'transparent',
                          alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13,
                            fontWeight: isToday ? '800' : '600',
                            color: textCol }}>
                            {date.day}
                          </Text>
                        </View>
                        {hasDot && inWindow && (
                          <View style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2,
                            backgroundColor: theme.color.accentRed }} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  theme={{
                    todayTextColor: theme.color.ink,
                    arrowColor: theme.color.ink,
                    monthTextColor: theme.color.ink,
                    textMonthFontWeight: '800',
                    textDayFontWeight: '600',
                    textDayHeaderFontWeight: '700',
                    backgroundColor: theme.color.bg,
                    calendarBackground: theme.color.bg,
                  }}
                />
                {rangeStart ? (
                  <View style={cal.rangeBar}>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => { rangeStartRef.current = null; setRangeStart(null); setRangeEnd(null); }}
                    >
                      <Text style={cal.rangeCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={cal.rangeHint}>
                      {rangeEnd && rangeEnd !== rangeStart
                        ? `${fromDateId(rangeStart).getDate()} ${MONTH_SHORT[fromDateId(rangeStart).getMonth()]} – ${fromDateId(rangeEnd).getDate()} ${MONTH_SHORT[fromDateId(rangeEnd).getMonth()]}`
                        : 'Tap an end date'}
                    </Text>
                    <TouchableOpacity
                      style={[cal.blockRangeBtn, blockingRange && { opacity: 0.5 }]}
                      onPress={handleRangeBlock}
                      disabled={blockingRange}
                    >
                      {blockingRange
                        ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                        : <Text style={cal.blockRangeBtnText}>{rangeAllBlocked ? 'Unblock' : 'Block'}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={cal.hint}>Hold a day to block a range</Text>
                )}

                {/* Recurring weekly blocks */}
                <View style={cal.recurringSection}>
                  <Text style={cal.recurringSectionTitle}>BLOCK EVERY</Text>
                  <View style={cal.recurringRow}>
                    {BR_WEEKDAY_JS.map((jsDay, i) => {
                      const active = recurringDays.includes(jsDay);
                      return (
                        <TouchableOpacity
                          key={jsDay}
                          style={[cal.recurringChip, active && cal.recurringChipActive]}
                          onPress={() => active ? handleRemoveRecurringDay(jsDay) : handleAddRecurringDay(jsDay)}
                          disabled={savingRecurring}
                          activeOpacity={0.75}
                        >
                          <Text style={[cal.recurringChipText, active && cal.recurringChipTextActive]}>
                            {BR_WEEKDAY_LABELS[i]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
}

function makeStylesS(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink },
    zoneBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.ink, backgroundColor: theme.color.bg,
    },
    zoneBtnLabel: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    zoneBtnDisabled: { opacity: 0.35, borderColor: theme.color.inkFaint },

    // Day nav header
    dayNavRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 10,
    },
    navArrowBtn: { width: 36, alignItems: 'center', justifyContent: 'center' },
    navArrow: { fontSize: 28, fontWeight: '300', color: theme.color.ink, lineHeight: 34 },
    navArrowDisabled: { color: theme.color.inkFaint },
    dateLabelWrap: { alignItems: 'center', minWidth: 200 },
    dateLabel: { fontSize: 17, fontWeight: '700', color: theme.color.ink, textAlign: 'center' },

    // Block Day button + Today nav
    blockDayRow: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
    blockDayBtn: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.ink,
      minWidth: 110, alignItems: 'center',
    },
    blockDayBtnText: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    todayBtn: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.inkFaint,
      alignItems: 'center',
    },
    todayBtnText: { fontSize: 13, fontWeight: '700', color: theme.color.inkMuted },

    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
    slot: {
      width: SLOT_W, height: 60, borderRadius: 5,
      borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
    },
    slotPast: { opacity: 0.35 },
    slotTime: { fontSize: 11, fontWeight: '600' },

    // Booked slot — solid ink fill with inverse-ink text
    slotBooked: {
      borderColor: theme.color.ink,
      borderWidth: 2.5,
      backgroundColor: theme.color.ink,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 3,
    },
    slotBookedName: { fontSize: 10, fontWeight: '700', color: theme.color.inverseInk, textAlign: 'center' },
    slotBookedService: {
      fontSize: 9,
      color: theme.appearance === 'dark' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)',
      textAlign: 'center', marginTop: 1,
    },
    slotGlyph: { position: 'absolute', bottom: 7, right: 7 },
    slotContinuation: {
      width: '60%', height: 3, borderRadius: 5,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },

    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: {
      width: 18, height: 18, borderRadius: 5,
      alignItems: 'center', justifyContent: 'center',
    },
    legendLabel: { fontSize: 12, color: theme.color.inkMuted },

    summary: { paddingHorizontal: 16, paddingTop: 12 },
    summaryText: { fontSize: 13, color: theme.color.inkMuted, fontWeight: '500' },

    savedToast: {
      position: 'absolute', bottom: 80, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: theme.color.ink, borderRadius: 5,
      paddingHorizontal: 16, paddingVertical: 10,
    },
    savedToastWrap: { position: 'absolute', bottom: 80, alignSelf: 'center' },
  });
}

// ── Bottom sheet styles ───────────────────────────────────────
function makeStylesBs(theme: VarsTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: theme.color.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: 5, borderTopRightRadius: 5,
      maxHeight: '90%', paddingHorizontal: 20,
    },
    handle: {
      width: 36, height: 4, borderRadius: 5, backgroundColor: theme.color.inkFaint,
      alignSelf: 'center', marginVertical: 12,
    },
    headerRow: {
      flexDirection: 'row', alignItems: 'flex-start',
      marginBottom: 16,
    },
    clientName: { fontSize: 20, fontWeight: '800', color: theme.color.ink, marginBottom: 6 },
    statusPill: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 12, fontWeight: '700' },
    closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

    map: { width: '100%', height: 180, borderRadius: 5, marginBottom: 10, overflow: 'hidden' },
    addressRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      padding: 10, marginBottom: 12,
    },
    addressText: { flex: 1, fontSize: 13, color: theme.color.ink, lineHeight: 18 },

    card: { padding: 14, marginBottom: 12, gap: 2 },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
    },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    detailLabel: { fontSize: 14, color: theme.color.inkMuted },
    detailValue: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    detailValueBold: { fontSize: 16, fontWeight: '800', color: theme.color.ink },
    divider: { height: 1, backgroundColor: theme.color.inkFaint, marginVertical: 4 },

    lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    lockedText: { fontSize: 13, color: theme.color.inkMuted, fontStyle: 'italic', flex: 1 },
    mutedText: { fontSize: 13, color: theme.color.inkMuted },

    errorBox: { backgroundColor: theme.color.accentRed + '15', borderRadius: 5, padding: 12, marginBottom: 12 },
    errorText: { fontSize: 13, color: theme.color.accentRed, fontWeight: '500' },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtnFlex: { flex: 1 },

    primaryBtn: { marginTop: 4 },

    waitingBox: { padding: 14, alignItems: 'center', marginTop: 4 },
    waitingText: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },

    // Reschedule suggestion UI
    rescheduleBtn: { marginTop: 8 },
    rescheduleWrap: { padding: 14, marginBottom: 12 },
    rescheduleHeading: { fontSize: 14, fontWeight: '700', color: theme.color.ink, marginBottom: 12 },
    rescheduleDayLabel: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
    },
    rescheduleChip: {
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.ink, alignItems: 'center',
    },
    rescheduleChipUnavailable: { borderColor: theme.color.inkFaint, backgroundColor: 'transparent' },
    rescheduleChipSelected: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    rescheduleChipText: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    rescheduleChipTextUnavailable: { color: theme.color.inkMuted },
    rescheduleChipTextSelected: { color: theme.color.inverseInk },
  });
}

// ── Block-range sheet styles ──────────────────────────────────
function makeStylesBr(theme: VarsTheme) {
  return StyleSheet.create({
    scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },

    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    actionBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint, alignItems: 'center',
    },
    actionBtnActive: { borderColor: theme.color.ink, backgroundColor: theme.color.ink },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: theme.color.inkMuted },
    actionBtnTextActive: { color: theme.color.inverseInk },

    heading: { fontSize: 20, fontWeight: '800', color: theme.color.ink, marginTop: 4, marginBottom: 20 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },

    chipRow: { gap: 8 },
    timeChip: {
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.inkFaint,
    },
    timeChipActive: { borderColor: theme.color.ink, backgroundColor: theme.color.ink },
    timeChipText: { fontSize: 13, fontWeight: '600', color: theme.color.ink },
    timeChipTextActive: { color: theme.color.inverseInk },

    weekdayRow: { flexDirection: 'row', gap: 6 },
    dayChip: {
      flex: 1, paddingVertical: 9, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint, alignItems: 'center',
    },
    dayChipActive: { borderColor: theme.color.ink, backgroundColor: theme.color.ink },
    dayChipText: { fontSize: 11, fontWeight: '700', color: theme.color.inkMuted },
    dayChipTextActive: { color: theme.color.inverseInk },

    repeatRow: { flexDirection: 'row', gap: 10 },
    repeatBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint, alignItems: 'center',
    },
    repeatBtnActive: { borderColor: theme.color.ink, backgroundColor: theme.color.ink },
    repeatBtnText: { fontSize: 13, fontWeight: '700', color: theme.color.inkMuted },
    repeatBtnTextActive: { color: theme.color.inverseInk },

    preview: {
      marginTop: 20, paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 5, borderWidth: 1, borderColor: theme.color.inkFaint,
    },
    previewText: { fontSize: 14, color: theme.color.ink, fontWeight: '500' },

    errorBox: { marginTop: 12, backgroundColor: theme.color.accentRed + '15', borderRadius: 5, padding: 12 },
    errorText: { fontSize: 13, color: theme.color.accentRed, fontWeight: '500' },

    confirmBtn: {
      marginTop: 16, height: 54, backgroundColor: theme.color.ink,
      borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },
  });
}

// ── Calendar modal styles ─────────────────────────────────────
function makeStylesCal(theme: VarsTheme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: theme.color.overlay, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: 5, borderTopRightRadius: 5,
      paddingBottom: 28,
    },
    handleZone: { width: '100%', alignItems: 'center', paddingVertical: 14 },
    handle: { width: 36, height: 4, borderRadius: 5, backgroundColor: theme.color.inkFaint },
    rangeBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 12,
    },
    rangeCancelText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    rangeHint: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    blockRangeBtn: {
      backgroundColor: theme.color.ink, borderRadius: 5,
      paddingHorizontal: 18, paddingVertical: 9, minWidth: 80, alignItems: 'center',
    },
    blockRangeBtnText: { fontSize: 14, fontWeight: '700', color: theme.color.inverseInk },
    hint: {
      textAlign: 'center', fontSize: 12, color: theme.color.inkMuted,
      paddingTop: 12, paddingBottom: 4,
    },
    recurringSection: {
      paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
      borderTopWidth: 1, borderTopColor: theme.color.inkFaint, marginTop: 10,
    },
    recurringSectionTitle: {
      fontSize: 11, fontWeight: '700', color: theme.color.inkMuted,
      letterSpacing: 0.5, marginBottom: 10,
    },
    recurringRow: { flexDirection: 'row', gap: 6 },
    recurringChip: {
      flex: 1, paddingVertical: 9, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint, alignItems: 'center',
    },
    recurringChipActive: { borderColor: theme.color.ink, backgroundColor: theme.color.ink },
    recurringChipText: { fontSize: 11, fontWeight: '700', color: theme.color.inkMuted },
    recurringChipTextActive: { color: theme.color.inverseInk },
  });
}
