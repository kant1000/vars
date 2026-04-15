// ============================================================
// VARS — Vendor Schedule / Three-State Calendar
// Each 30-min slot cycles through three states on tap:
//   (default / no record) → unavailable → auto_accept → (default)
//
// Colours:
//   default      = white border (available, no DB record)
//   unavailable  = red tint  (blocked, customers can't book)
//   auto_accept  = gold tint (instant confirm enabled)
//   transport_buffer = grey  (system-reserved, read-only)
//
// Reads from vendor_calendar. Transport buffer slots are
// shown but cannot be toggled by the vendor.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type BlockState = 'unavailable' | 'available' | 'auto_accept' | 'transport_buffer';

interface CalendarBlock {
  id: string;
  start_time: string;
  end_time: string;
  block_state: BlockState;
}

const SCREEN_W = Dimensions.get('window').width;
const SLOT_W   = (SCREEN_W - 32 - 20) / 4;

// Slot colours per state
const STATE_STYLE = {
  default: {
    border: Colors.border,
    bg: Colors.background,
    text: Colors.primary,
  },
  unavailable: {
    border: Colors.error + '80',
    bg: Colors.error + '12',
    text: Colors.error,
  },
  auto_accept: {
    border: '#D4A017',
    bg: '#FFF8E6',
    text: '#A07010',
  },
  transport_buffer: {
    border: Colors.border,
    bg: Colors.surface,
    text: Colors.textMuted,
  },
};

// Tap cycle: default → unavailable → auto_accept → default
function nextState(current: BlockState | 'default'): BlockState | 'delete' {
  if (current === 'default' || current === 'available') return 'unavailable';
  if (current === 'unavailable') return 'auto_accept';
  return 'delete'; // auto_accept → remove record (back to default)
}

function generateSlots(day: Date): Date[] {
  const slots: Date[] = [];
  const start = new Date(day); start.setHours(8, 0, 0, 0);
  const end   = new Date(day); end.setHours(22, 0, 0, 0);
  let cur = new Date(start);
  while (cur < end) {
    slots.push(new Date(cur));
    cur = new Date(cur.getTime() + 30 * 60000);
  }
  return slots;
}

const DAYS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d;
});

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null); // ISO of slot being toggled

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setVendorId(user.id);
    });
  }, []);

  const loadBlocks = useCallback(async () => {
    if (!vendorId) return;
    const dayStart = new Date(selectedDay); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(selectedDay); dayEnd.setHours(23, 59, 59, 999);

    // Use overlap query so blocks that span midnight are not missed
    const { data } = await supabase
      .from('vendor_calendar')
      .select('id, start_time, end_time, block_state')
      .eq('vendor_id', vendorId)
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString())
      .order('start_time');

    setBlocks(data ?? []);
    setLoading(false);
  }, [vendorId, selectedDay]);

  useEffect(() => { if (vendorId) loadBlocks(); }, [loadBlocks, vendorId]);

  const slots = generateSlots(selectedDay);

  // Compare via epoch ms — Supabase returns "+00:00" format, JS toISOString() returns "Z" format
  const getBlockForSlot = (slotIso: string): CalendarBlock | undefined => {
    const target = new Date(slotIso).getTime();
    return blocks.find((b) => new Date(b.start_time).getTime() === target);
  };

  const handleToggle = async (slot: Date) => {
    if (!vendorId || toggling) return;
    const slotIso = slot.toISOString();
    const existing = getBlockForSlot(slotIso);

    // Transport buffer slots are system-managed — read-only
    if (existing?.block_state === 'transport_buffer') return;

    const currentState = existing?.block_state ?? 'default';
    const next = nextState(currentState);

    setToggling(slotIso);

    if (next === 'delete') {
      // Remove record → slot returns to default (available)
      await supabase.from('vendor_calendar').delete().eq('id', existing!.id);
    } else if (existing) {
      // Update existing record
      await supabase.from('vendor_calendar').update({ block_state: next }).eq('id', existing.id);
    } else {
      // Insert new record
      const slotEnd = new Date(slot.getTime() + 30 * 60000);
      await supabase.from('vendor_calendar').insert({
        vendor_id: vendorId,
        start_time: slotIso,
        end_time: slotEnd.toISOString(),
        block_state: next,
      });
    }

    await loadBlocks();
    setToggling(null);
  };

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Schedule</Text>
        <TouchableOpacity style={s.zoneBtn} onPress={() => router.push('/vendor-zone-setup')}>
          <Text style={s.zoneBtnText}>⚡ Zone</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Day strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.dayStrip}
        >
          {DAYS.map((d) => {
            const active = d.toDateString() === selectedDay.toDateString();
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[s.dayChip, active && s.dayChipActive]}
                onPress={() => { setSelectedDay(d); }}
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
          <LegendDot color={Colors.border} label="Available" />
          <LegendDot color={Colors.error} label="Blocked" />
          <LegendDot color="#D4A017" label="Auto-accept" />
          <LegendDot color={Colors.textMuted} label="Buffer" />
        </View>

        {/* Hint */}
        <Text style={s.hint}>Tap to cycle: available → blocked → auto-accept</Text>

        {/* Slot grid */}
        <View style={s.grid}>
          {slots.map((slot) => {
            const iso = slot.toISOString();
            const block = getBlockForSlot(iso);
            const state = block?.block_state ?? 'default';
            const isPast = slot < new Date();
            const isToggling = toggling === iso;
            const styleKey = state === 'default' ? 'default' : state;
            const style = STATE_STYLE[styleKey as keyof typeof STATE_STYLE] ?? STATE_STYLE.default;

            return (
              <TouchableOpacity
                key={iso}
                style={[
                  s.slot,
                  { borderColor: style.border, backgroundColor: style.bg },
                  isPast && s.slotPast,
                ]}
                onPress={() => !isPast && handleToggle(slot)}
                disabled={isPast || state === 'transport_buffer' || isToggling}
                activeOpacity={0.7}
              >
                {isToggling ? (
                  <ActivityIndicator size="small" color={Colors.textMuted} />
                ) : (
                  <>
                    <Text style={[s.slotTime, { color: isPast ? Colors.textMuted : style.text }]}>
                      {slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </Text>
                    {state === 'auto_accept' && (
                      <Text style={s.slotIcon}>⚡</Text>
                    )}
                    {state === 'unavailable' && (
                      <Text style={s.slotIcon}>✕</Text>
                    )}
                    {state === 'transport_buffer' && (
                      <Text style={s.slotIcon}>🚗</Text>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Count summary */}
        <View style={s.summary}>
          {(() => {
            const dayBlocks = blocks.filter((b) => {
              const d = new Date(b.start_time);
              return d.toDateString() === selectedDay.toDateString();
            });
            const autoCount = dayBlocks.filter((b) => b.block_state === 'auto_accept').length;
            const unavailCount = dayBlocks.filter((b) => b.block_state === 'unavailable').length;
            if (autoCount === 0 && unavailCount === 0) return null;
            return (
              <Text style={s.summaryText}>
                {autoCount > 0 ? `⚡ ${autoCount} auto-accept slot${autoCount > 1 ? 's' : ''}` : ''}
                {autoCount > 0 && unavailCount > 0 ? '  ·  ' : ''}
                {unavailCount > 0 ? `✕ ${unavailCount} blocked` : ''}
              </Text>
            );
          })()}
        </View>
      </ScrollView>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { borderColor: color, backgroundColor: color + '20' }]} />
      <Text style={s.legendLabel}>{label}</Text>
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
    borderRadius: 20, borderWidth: 1.5, borderColor: '#D4A017',
    backgroundColor: '#FFF8E6',
  },
  zoneBtnText: { fontSize: 13, fontWeight: '700', color: '#A07010' },

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
    flexDirection: 'row', gap: 16,
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

  summary: { paddingHorizontal: 16, paddingTop: 12 },
  summaryText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
});
