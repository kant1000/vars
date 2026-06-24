// ============================================================
// VARS — My Bookings screen
// All customer bookings, newest first. Active at top, past below.
// Each card taps through to /booking/detail/[bookingId].
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { fmtPrice, fmtDateTime } from '@/lib/format';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

interface BookingSummary {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  scheduled_at: string;
  vendor_name: string;
  // Gate payment fields — only set for accepted bookings awaiting first-time payment
  gate_fired: boolean;
  gate_charged_at: string | null;
}

const STATUS_LABEL: Record<BookingStatus, { text: string; color: string }> = {
  pending:          { text: 'Awaiting vendor',   color: Colors.statusPending   },
  accepted:         { text: 'Confirmed',          color: Colors.statusAccepted  },
  on_way:           { text: 'On the way',         color: Colors.statusOnWay     },
  arrived:          { text: 'Arrived',            color: Colors.statusArrived   },
  service_rendered: { text: 'Service complete',   color: Colors.primary         },
  completed:        { text: 'Completed',          color: Colors.statusCompleted },
  cancelled:          { text: 'Cancelled',          color: Colors.statusCancelled },
  expired:            { text: 'Expired',            color: Colors.statusExpired   },
  disputed:           { text: 'Under review',       color: Colors.statusDisputed  },
  rescheduled_pending:{ text: 'Reschedule pending', color: Colors.statusPending   },
};

const ACTIVE: BookingStatus[] = [
  BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY,
  BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED,
];

type ListItem =
  | { type: 'header'; label: string }
  | { type: 'booking' } & BookingSummary
  | { type: 'empty' };

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Set by gate-checkout when poll times out — keeps us from showing "Complete payment"
  // to a customer who just paid while we wait for the webhook to flip status to on_way.
  const { confirming_booking_id } = useLocalSearchParams<{ confirming_booking_id?: string }>();
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('bookings')
      .select('id, status, service_name, service_price_kobo, scheduled_at, gate_fired, gate_charged_at, vendors:vendor_id(full_name)')
      .eq('user_id', user.id)
      .order('scheduled_at', { ascending: false })
      .limit(50);

    setBookings((data ?? []).map((b: any) => ({
      id: b.id,
      status: b.status as BookingStatus,
      service_name: b.service_name,
      service_price_kobo: b.service_price_kobo,
      scheduled_at: b.scheduled_at,
      vendor_name: b.vendors?.full_name ?? 'Vendor',
      gate_fired: b.gate_fired ?? false,
      gate_charged_at: b.gate_charged_at ?? null,
    })));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`bookings:consumer:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `user_id=eq.${user.id}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  if (loading) {
    return <View style={st.centered}><ScissorsLoader size="large" color="dark" /></View>;
  }

  if (!user) {
    return (
      <View style={st.centered}>
        <Text style={st.emptyTitle}>Sign in to see your bookings</Text>
        <TouchableOpacity style={st.cta} onPress={() => router.push('/auth/login')}>
          <Text style={st.ctaText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const active = bookings.filter((b) => ACTIVE.includes(b.status));
  const past   = bookings.filter((b) => !ACTIVE.includes(b.status));

  const sections: ListItem[] = [
    ...(active.length > 0 ? [{ type: 'header' as const, label: 'Active' }, ...active.map((b) => ({ type: 'booking' as const, ...b }))] : []),
    ...(past.length > 0 ? [{ type: 'header' as const, label: 'Past' }, ...past.map((b) => ({ type: 'booking' as const, ...b }))] : []),
    ...(bookings.length === 0 ? [{ type: 'empty' as const }] : []),
  ];

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>My Bookings</Text>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item, i) => item.type + ((item as any).id ?? '') + i}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
        ListHeaderComponent={
          refreshing ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <ScissorsLoader size="small" color="dark" />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={st.sectionLabel}>{item.label}</Text>;
          }
          if (item.type === 'empty') {
            return (
              <View style={st.emptyWrap}>
                <Text style={st.emptyTitle}>No bookings yet</Text>
                <Text style={st.emptyBody}>Your bookings will appear here once you book a vendor.</Text>
              </View>
            );
          }

          const booking = item as BookingSummary;
          const sl = STATUS_LABEL[booking.status] ?? { text: booking.status, color: Colors.textMuted };

          // Gate has fired but charge hasn't completed yet.
          const gateAwaitingPayment =
            booking.status === BOOKING_STATUS.ACCEPTED &&
            booking.gate_fired &&
            !booking.gate_charged_at;

          // We just navigated here from a poll-timeout in the confirming phase — the
          // customer DID attempt payment but the webhook hasn't landed yet. Show
          // "Confirming" rather than "Complete payment" for this specific booking.
          const isBeingConfirmed = gateAwaitingPayment && booking.id === confirming_booking_id;

          // The customer genuinely hasn't paid yet for all other gate-awaiting cases.
          const needsPayment = gateAwaitingPayment && !isBeingConfirmed;

          return (
            <TouchableOpacity
              style={[st.card, gateAwaitingPayment && st.cardPaymentNeeded]}
              onPress={() => router.push({
                pathname: '/booking/detail/[bookingId]',
                params: { bookingId: booking.id },
              })}
              activeOpacity={0.85}
            >
              <View style={st.cardTop}>
                <Text style={st.vendorName}>{booking.vendor_name}</Text>
                <View style={[st.statusPill, { backgroundColor: sl.color + '18' }]}>
                  <Text style={[st.statusText, { color: sl.color }]}>{sl.text}</Text>
                </View>
              </View>
              <Text style={st.serviceName}>{booking.service_name}</Text>
              <View style={st.cardBottom}>
                <Text style={st.dateTime}>{fmtDateTime(booking.scheduled_at)}</Text>
                <Text style={st.price}>{fmtPrice(booking.service_price_kobo)}</Text>
              </View>
              {isBeingConfirmed && (
                <View style={st.confirmingBanner}>
                  <Text style={st.confirmingBannerText}>Confirming your payment…</Text>
                </View>
              )}
              {needsPayment && (
                <TouchableOpacity
                  style={st.paymentNeededBtn}
                  onPress={() => router.push({
                    pathname: '/booking/gate-checkout/[bookingId]',
                    params: { bookingId: booking.id },
                  } as unknown as Href)}
                  activeOpacity={0.88}
                >
                  <Text style={st.paymentNeededBtnText}>
                    Your vendor is on their way — complete payment →
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, paddingHorizontal: 32,
  },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  card: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.surface, borderRadius: BORDER_RADIUS,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  cardPaymentNeeded: {
    borderColor: Colors.warning, borderWidth: 2,
  },
  confirmingBanner: {
    marginTop: 8, backgroundColor: Colors.warning + '18',
    borderRadius: BORDER_RADIUS, paddingVertical: 8, paddingHorizontal: 12,
  },
  confirmingBannerText: { fontSize: 13, fontWeight: '600', color: Colors.warning },
  paymentNeededBtn: {
    marginTop: 8, backgroundColor: Colors.warning,
    borderRadius: BORDER_RADIUS, paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center',
  },
  paymentNeededBtnText: {
    color: '#FFF', fontSize: 13, fontWeight: '700',
  },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  vendorName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  statusPill: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  serviceName: { fontSize: 14, color: Colors.textSecondary },
  cardBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 6,
  },
  dateTime: { fontSize: 12, color: Colors.textMuted },
  price: { fontSize: 14, fontWeight: '700', color: Colors.text },
  emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  cta: {
    marginTop: 16, backgroundColor: Colors.primary, borderRadius: 5,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  ctaText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
