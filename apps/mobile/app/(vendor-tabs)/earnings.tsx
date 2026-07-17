// ============================================================
// VARS — Vendor Earnings Screen (Stage 1)
// Period earnings hero + booking-level list
// Three buckets:
//   Cleared     (completed)       — vendor_amount_kobo from payout_history
//   Under review (disputed)       — estimated 80% (no payout row yet)
//   Confirming  (service_rendered) — estimated 80% (no payout row yet)
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsSkeleton } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { fmtPrice, fmtDate, fmtTime } from '@/lib/format';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

type Period = 'today' | 'week' | 'month' | 'all';

interface EarningRow {
  id: string;
  client_name: string;
  service_name: string;
  scheduled_at: string;
  amount_kobo: number;
  status: 'service_rendered' | 'completed' | 'disputed';
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
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { session } = useAuth();

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [period, setPeriod]     = useState<Period>('all');
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
      .select(`
        id, service_name, service_price_kobo, transport_fee_kobo, scheduled_at, status,
        profiles:user_id(full_name),
        payout_history(vendor_amount_kobo)
      `)
      .eq('vendor_id', vendorId)
      .in('status', ['service_rendered', 'completed', 'disputed'])
      .order('scheduled_at', { ascending: false });

    if (range) {
      query = query.gte('scheduled_at', range.from).lte('scheduled_at', range.to);
    }

    const { data } = await query;
    setRows((data ?? []).map((b: any) => {
      const payoutRow = Array.isArray(b.payout_history) ? b.payout_history[0] : null;
      const totalKobo = b.service_price_kobo + (b.transport_fee_kobo ?? 0);
      const vendorAmount = payoutRow?.vendor_amount_kobo ?? Math.round(totalKobo * 0.8);
      return {
        id: b.id,
        client_name: b.profiles?.full_name ?? 'Client',
        service_name: b.service_name,
        scheduled_at: b.scheduled_at,
        amount_kobo: vendorAmount,
        status: b.status as 'service_rendered' | 'completed' | 'disputed',
      };
    }));
    setLoading(false);
    setRefreshing(false);
  }, [vendorId, period]);

  useEffect(() => { if (vendorId) load(); }, [load, vendorId]);

  const clearedKobo    = rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amount_kobo, 0);
  const confirmingKobo = rows.filter((r) => r.status === 'service_rendered').reduce((s, r) => s + r.amount_kobo, 0);
  const reviewKobo     = rows.filter((r) => r.status === 'disputed').reduce((s, r) => s + r.amount_kobo, 0);
  const totalKobo      = clearedKobo + confirmingKobo + reviewKobo;

  const fmt = (k: number) => hidden ? '₦ · · ·' : fmtPrice(k);

  const ListHeader = (
    <>
      {/* Period filter — static chrome, shown immediately regardless of load state */}
      <View style={s.filterRow}>
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
      </View>

      {loading ? (
        <>
          <View style={s.hero}>
            <View style={s.heroLabelRow}>
              <Text style={s.heroLabel}>EARNINGS</Text>
            </View>
            <VarsSkeleton theme={theme} height={40} width="60%" style={{ marginBottom: 12 }} />
            <View style={s.heroSplit}>
              <VarsSkeleton theme={theme} height={13} width="50%" />
              <VarsSkeleton theme={theme} height={13} width="55%" />
            </View>
          </View>
          {Array.from({ length: 3 }).map((_, i) => (
            <View key={i} style={s.row}>
              <View style={s.rowLeft}>
                <VarsSkeleton theme={theme} height={15} width="50%" />
                <VarsSkeleton theme={theme} height={13} width="65%" style={{ marginTop: 4 }} />
                <VarsSkeleton theme={theme} height={12} width="40%" style={{ marginTop: 4 }} />
              </View>
              <View style={s.rowRight}>
                <VarsSkeleton theme={theme} height={16} width={60} />
                <VarsSkeleton theme={theme} height={18} width={70} radius={BORDER_RADIUS} />
              </View>
            </View>
          ))}
        </>
      ) : (
        <>
          {/* Hero card */}
          <View style={s.hero}>
            <View style={s.heroLabelRow}>
              <Text style={s.heroLabel}>EARNINGS</Text>
              <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
                {hidden
                  ? <EyeOffIcon size={16} color={theme.color.inkMuted} />
                  : <EyeIcon    size={16} color={theme.color.inkMuted} />}
              </TouchableOpacity>
            </View>
            <Text style={s.heroAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {fmt(totalKobo)}
            </Text>
            <View style={s.heroSplit}>
              <View style={s.heroChip}>
                <View style={[s.heroDot, { backgroundColor: theme.color.accentAmber }]} />
                <Text style={s.heroChipText}>Pending {hidden ? '···' : fmtPrice(confirmingKobo)}</Text>
              </View>
              <View style={s.heroChip}>
                <View style={[s.heroDot, { backgroundColor: theme.color.accentRed }]} />
                <Text style={s.heroChipText}>Under review {hidden ? '···' : fmtPrice(reviewKobo)}</Text>
              </View>
            </View>
          </View>

          {rows.length > 0 && (
            <Text style={s.sectionLabel}>BOOKINGS</Text>
          )}
        </>
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
        data={loading ? [] : rows}
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
          loading ? null : (
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Nothing here yet</Text>
              <Text style={s.emptyBody}>
                {period === 'today'
                  ? "Complete a booking today to see it here."
                  : "Completed bookings will appear here."}
              </Text>
            </View>
          )
        }
        renderItem={({ item: r }) => {
          const pillColor =
            r.status === 'completed' ? theme.color.accentGreen :
            r.status === 'disputed'  ? theme.color.accentRed   :
            theme.color.accentAmber;
          const pillLabel =
            r.status === 'completed' ? 'Cleared'      :
            r.status === 'disputed'  ? 'Under review' :
            'Pending';
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
                <View style={[s.statusPill, { borderColor: pillColor }]}>
                  <Text style={[s.statusText, { color: pillColor }]}>
                    {pillLabel}
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

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },

    header: {
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink },

    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 8,
    },
    filterPill: {
      flex: 1, alignItems: 'center',
      paddingVertical: 7,
      borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: theme.color.inkFaint,
    },
    filterPillActive: {
      backgroundColor: theme.color.ink, borderColor: theme.color.ink,
    },
    filterPillText: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted },
    filterPillTextActive: { color: theme.color.inverseInk },

    hero: {
      margin: 16, marginTop: 12,
      padding: 20,
      borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: theme.color.ink,
    },
    heroLabelRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 6,
    },
    heroLabel: {
      fontSize: 11, fontWeight: '700', color: theme.color.inkMuted,
      letterSpacing: 0.8,
    },
    heroAmount: {
      fontSize: 40, fontWeight: '400', color: theme.color.ink,
      letterSpacing: -1, marginBottom: 12,
    },
    heroSplit: { flexDirection: 'column', gap: 6 },
    heroChip:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroDot:   { width: 8, height: 8, borderRadius: 4 },
    heroChipText: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted },
    heroEmpty: { fontSize: 13, color: theme.color.inkMuted },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: theme.color.inkMuted,
      letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
    },

    row: {
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 20,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    rowLeft:    { flex: 1, marginRight: 12, gap: 2 },
    rowClient:  { fontSize: 15, fontWeight: '700', color: theme.color.ink },
    rowService: { fontSize: 13, color: theme.color.inkMuted },
    rowDate:    { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    rowRight:   { alignItems: 'flex-end', gap: 5 },
    rowAmount:  { fontSize: 16, fontWeight: '800', color: theme.color.ink },
    statusPill: {
      borderRadius: BORDER_RADIUS, paddingHorizontal: 8, paddingVertical: 2,
      borderWidth: 1,
    },
    statusText: { fontSize: 11, fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    emptyBody:  { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}
