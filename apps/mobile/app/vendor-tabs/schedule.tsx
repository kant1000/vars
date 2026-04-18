// ============================================================
// VARS — Vendor Schedule
// Calendar/List toggle (AsyncStorage-persisted)
// Calendar: 3-state slot grid + booked-slot overlay
// List: upcoming bookings in chronological order
// Part 1: types, helpers, calendar view with booked overlay
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

// ── Types ─────────────────────────────────────────────────────
type BlockState = 'unavailable' | 'available' | 'auto_accept' | 'transport_buffer';

type BookingStatus =
  | 'pending' | 'accepted' | 'on_way' | 'arrived'
  | 'service_rendered' | 'completed' | 'cancelled' | 'expired' | 'disputed';

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
}

// ── Constants ─────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const SLOT_W   = (SCREEN_W - 32 - 20) / 4;
const STORAGE_KEY = 'vars_vendor_schedule_view';
const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'accepted', 'on_way', 'arrived', 'service_rendered'];

const STATE_STYLE = {
  default:          { border: Colors.border,        bg: Colors.background, text: Colors.primary },
  unavailable:      { border: Colors.error + '80',  bg: Colors.error + '12', text: Colors.error },
  auto_accept:      { border: '#D4A017',             bg: '#FFF8E6',           text: '#A07010' },
  transport_buffer: { border: Colors.border,         bg: Colors.surface,      text: Colors.textMuted },
  booked:           { border: Colors.primary,        bg: Colors.primary + '18', text: Colors.primary },
};

const STATUS_LABEL: Record<BookingStatus, { text: string; color: string }> = {
  pending:          { text: 'Pending',          color: Colors.statusPending   },
  accepted:         { text: 'Confirmed',        color: Colors.statusAccepted  },
  on_way:           { text: 'On the way',       color: Colors.statusOnWay     },
  arrived:          { text: 'Arrived',          color: Colors.statusArrived   },
  service_rendered: { text: 'Service done',     color: Colors.primary         },
  completed:        { text: 'Completed',        color: Colors.statusCompleted },
  cancelled:        { text: 'Cancelled',        color: Colors.statusCancelled },
  expired:          { text: 'Expired',          color: Colors.statusExpired   },
  disputed:         { text: 'Under review',     color: Colors.statusDisputed  },
};

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d;
});

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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtPrice(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

function fmtDuration(blocks: number) {
  const m = blocks * 30;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}hr ${rem}min` : `${h}hr`;
}

function nextState(current: BlockState | 'default'): BlockState | 'delete' {
  if (current === 'default' || current === 'available') return 'unavailable';
  if (current === 'unavailable') return 'auto_accept';
  return 'delete';
}

// ── Sub-components ────────────────────────────────────────────
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { borderColor: color, backgroundColor: color + '20' }]} />
      <Text style={s.legendLabel}>{label}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<VendorBooking | null>(null);

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
          scheduled_at, phone_revealed, user_location_lat, user_location_lng,
          user_location_address, access_building, access_floor, access_flat, access_code,
          profiles:user_id(full_name, phone_number)
        `)
        .eq('vendor_id', vendorId)
        .in('status', ACTIVE_STATUSES)
        .gte('scheduled_at', dayStart.toISOString())
        .lt('scheduled_at', dayEnd.toISOString()),
    ]);

    setBlocks(calData ?? []);
    setBookings((bkData ?? []).map((b: any) => ({
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
    })));
    setLoading(false);
  }, [vendorId, selectedDay]);

  useEffect(() => { if (vendorId) loadData(); }, [loadData, vendorId]);

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
  const autoCount = blocks.filter((b) => b.block_state === 'auto_accept').length;
  const unavailCount = blocks.filter((b) => b.block_state === 'unavailable').length;

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>;
  }

  const slots = generateSlots(selectedDay);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Schedule</Text>
        <TouchableOpacity style={s.zoneBtn} onPress={() => router.push('/vendor-zone-setup' as any)}>
          <Text style={s.zoneBtnText}>⚡ Zone</Text>
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
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Day strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayStrip}>
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

          {/* Legend */}
          <View style={s.legend}>
            <LegendDot color={Colors.border}   label="Available" />
            <LegendDot color={Colors.error}    label="Blocked" />
            <LegendDot color="#D4A017"         label="Auto-accept" />
            <LegendDot color={Colors.textMuted} label="Buffer" />
            <LegendDot color={Colors.primary}  label="Booked" />
          </View>

          <Text style={s.hint}>Tap to cycle: available → blocked → auto-accept</Text>

          {/* Slot grid */}
          <View style={s.grid}>
            {slots.map((slot) => {
              const iso = slot.toISOString();
              const block   = getBlockForSlot(slot);
              const booking = getBookingForSlot(slot);
              const isPast  = slot < new Date();
              const isToggling = toggling === iso;

              if (booking) {
                const isFirstSlot = new Date(booking.scheduled_at).getTime() === slot.getTime();
                const sl = STATUS_LABEL[booking.status];
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
                        <View style={[s.slotStatusDot, { backgroundColor: sl.color }]} />
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
                    <ActivityIndicator size="small" color={Colors.textMuted} />
                  ) : (
                    <>
                      <Text style={[s.slotTime, { color: isPast ? Colors.textMuted : style.text }]}>
                        {slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </Text>
                      {state === 'auto_accept'      && <Text style={s.slotIcon}>⚡</Text>}
                      {state === 'unavailable'      && <Text style={s.slotIcon}>✕</Text>}
                      {state === 'transport_buffer' && <Text style={s.slotIcon}>🚗</Text>}
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Count summary */}
          {(autoCount > 0 || unavailCount > 0 || bookings.length > 0) && (
            <View style={s.summary}>
              <Text style={s.summaryText}>
                {bookings.length > 0 ? `📅 ${bookings.length} booking${bookings.length > 1 ? 's' : ''}` : ''}
                {bookings.length > 0 && (autoCount > 0 || unavailCount > 0) ? '  ·  ' : ''}
                {autoCount > 0 ? `⚡ ${autoCount} auto-accept` : ''}
                {autoCount > 0 && unavailCount > 0 ? '  ·  ' : ''}
                {unavailCount > 0 ? `✕ ${unavailCount} blocked` : ''}
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        // List view — coming in Part 3
        <View style={s.centered}>
          <Text style={{ color: Colors.textMuted }}>List view coming soon</Text>
        </View>
      )}

      {/* Bottom sheet — coming in Part 2 */}
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
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D4A017', backgroundColor: '#FFF8E6',
  },
  zoneBtnText: { fontSize: 13, fontWeight: '700', color: '#A07010' },

  toggleRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 10,
    backgroundColor: Colors.surface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: Colors.background, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  toggleBtnTextActive: { color: Colors.text },

  dayStrip: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dayChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, minWidth: 52,
  },
  dayChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayWeekday: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  dayNum: { fontSize: 18, fontWeight: '800', color: Colors.text },
  dayTextActive: { color: '#FFF' },

  legend: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 2, flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5 },
  legendLabel: { fontSize: 12, color: Colors.textSecondary },

  hint: { fontSize: 12, color: Colors.textMuted, marginHorizontal: 16, marginBottom: 10, marginTop: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  slot: {
    width: SLOT_W, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, alignItems: 'center', minHeight: 46, justifyContent: 'center',
  },
  slotPast: { opacity: 0.35 },
  slotTime: { fontSize: 11, fontWeight: '600' },
  slotIcon: { fontSize: 10, marginTop: 1 },

  // Booked slot
  slotBooked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '18',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  slotBookedName: { fontSize: 10, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  slotBookedService: { fontSize: 9, color: Colors.primary + 'CC', textAlign: 'center', marginTop: 1 },
  slotStatusDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  slotContinuation: {
    width: '60%', height: 3, borderRadius: 2,
    backgroundColor: Colors.primary + '60',
  },

  summary: { paddingHorizontal: 16, paddingTop: 12 },
  summaryText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
});
