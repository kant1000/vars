// ============================================================
// VARS — Vendor Earnings Screen (Phase 9)
// Shows payout history and total lifetime earnings.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtLongDate } from '@/lib/format';

interface Payout {
  id: string;
  amount_kobo: number;
  status: string;
  created_at: string;
  booking_id: string;
  service_name: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  success:  Colors.success,
  pending:  Colors.statusPending,
  failed:   Colors.error,
};

export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('payout_history')
      .select('id, amount_kobo, status, created_at, booking_id, bookings(service_name)')
      .order('created_at', { ascending: false })
      .limit(50);

    setPayouts((data ?? []).map((p: any) => ({
      id: p.id,
      amount_kobo: p.amount_kobo,
      status: p.status,
      created_at: p.created_at,
      booking_id: p.booking_id,
      service_name: p.bookings?.service_name ?? null,
    })));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const totalKobo   = payouts.filter((p) => p.status === 'success').reduce((s, p) => s + p.amount_kobo, 0);
  const pendingKobo = payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount_kobo, 0);

  if (loading) return <View style={s.centered}><ScissorsLoader size="small" color="dark" /></View>;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Earnings</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="transparent" colors={['transparent']} />}
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color="dark" />
          </View>
        )}
        {/* Summary cards */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { flex: 1 }]}>
            <Text style={s.summaryLabel}>Total earned</Text>
            <Text style={s.summaryAmount}>{fmtPrice(totalKobo)}</Text>
          </View>
          <View style={[s.summaryCard, { flex: 1 }]}>
            <Text style={s.summaryLabel}>Pending</Text>
            <Text style={[s.summaryAmount, { color: Colors.statusPending }]}>{fmtPrice(pendingKobo)}</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Payout history</Text>

        {payouts.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No payouts yet</Text>
            <Text style={s.emptyBody}>Complete your first booking to see earnings here.</Text>
          </View>
        ) : (
          payouts.map((p) => (
            <View key={p.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowService}>{p.service_name ?? 'Service'}</Text>
                <Text style={s.rowDate}>{fmtLongDate(p.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={s.rowAmount}>{fmtPrice(p.amount_kobo)}</Text>
                <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[p.status] ?? Colors.textMuted) + '20' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLOR[p.status] ?? Colors.textMuted }]}>
                    {p.status}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  summaryRow: { flexDirection: 'row', gap: 12, margin: 16 },
  summaryCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  summaryLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  summaryAmount: { fontSize: 22, fontWeight: '800', color: Colors.text },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 20, marginBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowService: { fontSize: 15, fontWeight: '600', color: Colors.text },
  rowDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '800', color: Colors.success },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
