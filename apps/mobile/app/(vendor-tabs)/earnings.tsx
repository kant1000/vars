// ============================================================
// VARS — Vendor Earnings Screen (Stage 1)
// Period earnings hero + booking-level list
// Amounts shown are gross booking price (service_price_kobo).
// Status: service_rendered = "Confirming", completed = "Paid"
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { fmtPrice, fmtDate, fmtTime } from '@/lib/format';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

type Period = 'today' | 'week' | 'month' | 'all';

interface EarningRow {
  id: string;
  client_name: string;
  service_name: string;
  scheduled_at: string;
  amount_kobo: number;
  status: 'service_rendered' | 'completed';
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All time' },
];

function periodRange(p: Period): { from: string; to: string } | null {
  const now = new Date();
  if (p === 'today') {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to   = new Date(now); to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (p === 'week') {
    const day  = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const from = new Date(now); from.setDate(now.getDate() + diff); from.setHours(0, 0, 0, 0);
    const to   = new Date(from); to.setDate(from.getDate() + 6);   to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (p === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return null;
}

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [period, setPeriod]     = useState<Period>('week');
  const [rows, setRows]         = useState<EarningRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden]     = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setVendorId(user.id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!vendorId) return;
    const range = periodRange(period);

    let query = supabase
      .from('bookings')
      .select('id, service_name, service_price_kobo, scheduled_at, status, profiles:user_id(full_name)')
      .eq('vendor_id', vendorId)
      .in('status', ['service_rendered', 'completed'])
      .order('scheduled_at', { ascending: false });

    if (range) {
      query = query.gte('scheduled_at', range.from).lte('scheduled_at', range.to);
    }

    const { data } = await query;
    setRows((data ?? []).map((b: any) => ({
      id: b.id,
      client_name: b.profiles?.full_name ?? 'Client',
      service_name: b.service_name,
      scheduled_at: b.scheduled_at,
      amount_kobo: b.service_price_kobo,
      status: b.status as 'service_rendered' | 'completed',
    })));
    setLoading(false);
    setRefreshing(false);
  }, [vendorId, period]);

  useEffect(() => { if (vendorId) load(); }, [load, vendorId]);

  const totalKobo      = rows.reduce((s, r) => s + r.amount_kobo, 0);
  const paidKobo       = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amount_kobo, 0);
  const confirmingKobo = rows.filter((r) => r.status === 'service_rendered').reduce((s, r) => s + r.amount_kobo, 0);

  const fmt = (k: number) => hidden ? '₦ · · ·' : fmtPrice(k);

  if (loading) {
    return <View style={s.centered}><ScissorsLoader size="small" color="dark" /></View>;
  }

  const ListHeader = (
    <>
      {/* Period filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
      >
        {PERIODS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[s.filterPill, period === key && s.filterPillActive]}
            onPress={() => setPeriod(key)}
          >
            <Text style={[s.filterPillText, period === key && s.filterPillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Hero card */}
      <View style={s.hero}>
        <View style={s.heroLabelRow}>
          <Text style={s.heroLabel}>EARNINGS</Text>
          <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
            {hidden
              ? <EyeOffIcon size={16} color={Colors.inkMuted} />
              : <EyeIcon    size={16} color={Colors.inkMuted} />}
          </TouchableOpacity>
        </View>
        <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {fmt(totalKobo)}
        </Text>
        {(paidKobo > 0 || confirmingKobo > 0) ? (
          <View style={s.heroSplit}>
            {paidKobo > 0 && (
              <View style={s.heroChip}>
                <View style={[s.heroDot, { backgroundColor: Colors.success }]} />
                <Text style={s.heroChipText}>Paid {hidden ? '···' : fmtPrice(paidKobo)}</Text>
              </View>
            )}
            {confirmingKobo > 0 && (
              <View style={s.heroChip}>
                <View style={[s.heroDot, { backgroundColor: Colors.warning }]} />
                <Text style={s.heroChipText}>Confirming {hidden ? '···' : fmtPrice(confirmingKobo)}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={s.heroEmpty}>No earnings yet for this period</Text>
        )}
      </View>

      {rows.length > 0 && (
        <Text style={s.sectionLabel}>BOOKINGS</Text>
      )}
    </>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Earnings</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Nothing here yet</Text>
            <Text style={s.emptyBody}>
              {period === 'today'
                ? "Complete a booking today to see it here."
                : "Completed bookings will appear here."}
            </Text>
          </View>
        }
        renderItem={({ item: r }) => {
          const isPaid = r.status === 'completed';
          return (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <Text style={s.rowClient} numberOfLines={1}>{r.client_name}</Text>
                <Text style={s.rowService} numberOfLines={1}>{r.service_name}</Text>
                <Text style={s.rowDate}>
                  {fmtDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}
                </Text>
              </View>
              <View style={s.rowRight}>
                <Text style={s.rowAmount}>{fmt(r.amount_kobo)}</Text>
                <View style={[s.statusPill, { borderColor: isPaid ? Colors.success : Colors.warning }]}>
                  <Text style={[s.statusText, { color: isPaid ? Colors.success : Colors.warning }]}>
                    {isPaid ? 'Paid' : 'Confirming'}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },

  filterRow: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: Colors.inkFaint,
  },
  filterPillActive: {
    backgroundColor: Colors.ink, borderColor: Colors.ink,
  },
  filterPillText: { fontSize: 13, fontWeight: '600', color: Colors.inkMuted },
  filterPillTextActive: { color: Colors.white },

  hero: {
    margin: 16, marginTop: 12,
    padding: 20,
    borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: Colors.ink,
  },
  heroLabelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.inkMuted,
    letterSpacing: 0.8,
  },
  heroAmount: {
    fontSize: 40, fontWeight: '800', color: Colors.ink,
    letterSpacing: -1, marginBottom: 12,
  },
  heroSplit: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  heroChip:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroDot:   { width: 8, height: 8, borderRadius: 4 },
  heroChipText: { fontSize: 13, fontWeight: '600', color: Colors.inkMuted },
  heroEmpty: { fontSize: 13, color: Colors.inkMuted },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLeft:    { flex: 1, marginRight: 12, gap: 2 },
  rowClient:  { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowService: { fontSize: 13, color: Colors.textSecondary },
  rowDate:    { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowRight:   { alignItems: 'flex-end', gap: 5 },
  rowAmount:  { fontSize: 16, fontWeight: '800', color: Colors.ink },
  statusPill: {
    borderRadius: BORDER_RADIUS, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  emptyBody:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
