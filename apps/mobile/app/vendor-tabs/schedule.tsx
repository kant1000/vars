// ============================================================
// VARS — Vendor Schedule / Availability Screen (Phase 9)
// Vendor can block out time slots (vendor_unavailability table).
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

interface Block {
  id: string;
  start_time: string;
  end_time: string;
}

function fmtBlock(start: string, end: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-NG', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  return `${fmt(start)} → ${fmt(end)}`;
}

// Generate next 14 days, each with 30-min slots 08:00–22:00
function generateSlots(day: Date) {
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
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setVendorId(user.id);
    });
  }, []);

  const loadBlocks = useCallback(async () => {
    if (!vendorId) return;
    const { data } = await supabase
      .from('vendor_unavailability')
      .select('id, start_time, end_time')
      .eq('vendor_id', vendorId)
      .gte('end_time', new Date().toISOString())
      .order('start_time');
    setBlocks(data ?? []);
    setLoading(false);
  }, [vendorId]);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const slots = generateSlots(selectedDay);

  const toggleSlot = (iso: string) => {
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      next.has(iso) ? next.delete(iso) : next.add(iso);
      return next;
    });
  };

  const isBlocked = (slot: Date) =>
    blocks.some((b) => slot >= new Date(b.start_time) && slot < new Date(b.end_time));

  const saveBlocks = async () => {
    if (!vendorId || selectedSlots.size === 0) return;
    setSaving(true);
    // Group consecutive selected slots into blocks
    const sorted = Array.from(selectedSlots).sort();
    const rows: { vendor_id: string; start_time: string; end_time: string }[] = [];
    let blockStart: string | null = null, blockEnd: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (!blockStart) blockStart = cur;
      const curEnd = new Date(new Date(cur).getTime() + 30 * 60000).toISOString();
      blockEnd = curEnd;
      if (!next || next !== curEnd) {
        rows.push({ vendor_id: vendorId, start_time: blockStart, end_time: blockEnd });
        blockStart = null;
      }
    }

    const { error } = await supabase.from('vendor_unavailability').insert(rows);
    if (error) Alert.alert('Error', error.message);
    else {
      setSelectedSlots(new Set());
      await loadBlocks();
    }
    setSaving(false);
  };

  const deleteBlock = async (id: string) => {
    await supabase.from('vendor_unavailability').delete().eq('id', id);
    await loadBlocks();
  };

  if (loading) return <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Schedule</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Day strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dayStrip}>
          {DAYS.map((d) => {
            const active = d.toDateString() === selectedDay.toDateString();
            return (
              <TouchableOpacity
                key={d.toISOString()} style={[s.dayChip, active && s.dayChipActive]}
                onPress={() => { setSelectedDay(d); setSelectedSlots(new Set()); }}
              >
                <Text style={[s.dayWeekday, active && s.dayTextActive]}>{d.toLocaleDateString('en-NG', { weekday: 'short' })}</Text>
                <Text style={[s.dayNum, active && s.dayTextActive]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Slot grid */}
        <Text style={s.hint}>Tap slots to block them out. Customers can't book blocked times.</Text>
        <View style={s.grid}>
          {slots.map((slot) => {
            const iso = slot.toISOString();
            const blocked = isBlocked(slot);
            const selected = selectedSlots.has(iso);
            const past = slot < new Date();
            return (
              <TouchableOpacity
                key={iso}
                style={[s.slot, blocked && s.slotBlocked, selected && s.slotSelected, past && s.slotPast]}
                onPress={() => !blocked && !past && toggleSlot(iso)}
                disabled={blocked || past}
              >
                <Text style={[s.slotText, blocked && s.slotTextBlocked, selected && s.slotTextSelected]}>
                  {slot.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedSlots.size > 0 && (
          <TouchableOpacity
            style={[s.saveBtn, saving && s.btnDisabled]}
            onPress={saveBlocks}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Block {selectedSlots.size} slot{selectedSlots.size > 1 ? 's' : ''}</Text>}
          </TouchableOpacity>
        )}

        {/* Existing blocks */}
        {blocks.length > 0 && (
          <View style={s.blocksSection}>
            <Text style={s.sectionLabel}>Blocked times</Text>
            {blocks.map((b) => (
              <View key={b.id} style={s.blockRow}>
                <Text style={s.blockText} numberOfLines={1}>{fmtBlock(b.start_time, b.end_time)}</Text>
                <TouchableOpacity onPress={() => deleteBlock(b.id)}>
                  <Text style={s.deleteText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const SLOT_W = (320 - 32 - 20) / 4;
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  dayStrip: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  dayChip: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, minWidth: 52 },
  dayChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayWeekday: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  dayNum: { fontSize: 18, fontWeight: '800', color: Colors.text },
  dayTextActive: { color: '#FFF' },
  hint: { fontSize: 13, color: Colors.textSecondary, marginHorizontal: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  slot: { width: SLOT_W, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  slotBlocked: { backgroundColor: Colors.error + '15', borderColor: Colors.error + '60' },
  slotSelected: { backgroundColor: Colors.warning + '20', borderColor: Colors.warning },
  slotPast: { backgroundColor: Colors.surface, borderColor: Colors.border, opacity: 0.4 },
  slotText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  slotTextBlocked: { color: Colors.error },
  slotTextSelected: { color: Colors.warning },
  saveBtn: { margin: 16, height: 50, backgroundColor: Colors.warning, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },
  blocksSection: { paddingHorizontal: 16, marginTop: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  blockRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  blockText: { flex: 1, fontSize: 13, color: Colors.text },
  deleteText: { fontSize: 13, color: Colors.error, fontWeight: '600', marginLeft: 12 },
});
