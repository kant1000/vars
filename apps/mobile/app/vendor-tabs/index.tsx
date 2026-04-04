// ============================================================
// VARS — Vendor Jobs Dashboard (Phase 9)
// Sections:
//   • Incoming requests (pending) — accept/decline + 2hr countdown
//   • Active jobs (accepted/on_way/arrived/service_rendered) — flow buttons
//   • Upcoming (future accepted bookings)
//   • Past jobs
// Real-time updates via Supabase Realtime on bookings table.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ───────────────────────────────────────────────────
type BookingStatus =
  | 'pending' | 'accepted' | 'vendor_on_way' | 'vendor_arrived'
  | 'service_rendered' | 'completed' | 'cancelled' | 'expired';

interface VendorBooking {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  service_duration_blocks: number;
  scheduled_at: string;
  user_location_address: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  phone_revealed: boolean;
}

// ── Helpers ─────────────────────────────────────────────────
function fmtPrice(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}
function fmtDuration(blocks: number) {
  const m = blocks * 30;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}hr ${rem}min` : `${h}hr`;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
function vendorEarning(priceKobo: number) {
  return Math.round(priceKobo * 0.8); // 80% to vendor
}

// ── Countdown hook ───────────────────────────────────────────
function useCountdown(expiryIso: string | null) {
  const [secs, setSecs] = useState(() =>
    expiryIso ? Math.max(0, Math.round((new Date(expiryIso).getTime() - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!expiryIso) return;
    const id = setInterval(() => {
      setSecs(Math.max(0, Math.round((new Date(expiryIso).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiryIso]);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return secs <= 0 ? 'Expired' : `${h > 0 ? `${h}h ` : ''}${m}m ${String(s).padStart(2, '0')}s`;
}

// ── Pending booking card ─────────────────────────────────────
function PendingCard({
  booking, sessionToken, onUpdated,
}: {
  booking: VendorBooking;
  sessionToken: string;
  onUpdated: () => void;
}) {
  const [acting, setActing] = useState(false);
  // 2-hour window from booking creation
  const expiry = new Date(new Date(booking.created_at).getTime() + 2 * 60 * 60 * 1000).toISOString();
  const countdown = useCountdown(expiry);

  const handle = async (action: 'accept' | 'decline') => {
    setActing(true);
    const endpoint = action === 'accept' ? 'paystack-capture' : 'paystack-release';
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        Alert.alert('Error', d.error ?? 'Something went wrong.');
      } else {
        onUpdated();
      }
    } catch {
      Alert.alert('Error', 'Could not reach server.');
    } finally {
      setActing(false);
    }
  };

  return (
    <View style={c.card}>
      <View style={c.cardHeader}>
        <View style={[c.statusDot, { backgroundColor: Colors.statusPending }]} />
        <Text style={c.customerName}>{booking.customer_name}</Text>
        <Text style={c.countdown}>{countdown}</Text>
      </View>
      <Text style={c.serviceName}>{booking.service_name}</Text>
      <Text style={c.meta}>{fmtDateTime(booking.scheduled_at)} · {fmtDuration(booking.service_duration_blocks)}</Text>
      {booking.user_location_address && (
        <Text style={c.meta} numberOfLines={1}>📍 {booking.user_location_address}</Text>
      )}
      <View style={c.priceRow}>
        <Text style={c.earning}>You earn: <Text style={c.earningAmount}>{fmtPrice(vendorEarning(booking.service_price_kobo))}</Text></Text>
      </View>
      <View style={c.btnRow}>
        <TouchableOpacity
          style={[c.declineBtn, acting && c.btnDisabled]}
          onPress={() => handle('decline')}
          disabled={acting}
        >
          <Text style={c.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[c.acceptBtn, acting && c.btnDisabled]}
          onPress={() => handle('accept')}
          disabled={acting}
        >
          {acting ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={c.acceptBtnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Active job card ──────────────────────────────────────────
const FLOW_ACTIONS: Partial<Record<BookingStatus, { label: string; next: BookingStatus; color: string }>> = {
  accepted:         { label: "I'm on my way",    next: 'vendor_on_way',    color: Colors.statusOnWay },
  vendor_on_way:    { label: "I've arrived",      next: 'vendor_arrived',   color: Colors.statusArrived },
  vendor_arrived:   { label: 'Service rendered',  next: 'service_rendered', color: Colors.primary },
};

function ActiveCard({ booking, onUpdated }: { booking: VendorBooking; onUpdated: () => void }) {
  const [acting, setActing] = useState(false);
  const action = FLOW_ACTIONS[booking.status];

  const advance = async () => {
    if (!action) return;
    setActing(true);
    const update: Record<string, any> = { status: action.next };
    if (action.next === 'vendor_on_way')    update.on_way_at = new Date().toISOString();
    if (action.next === 'vendor_arrived')   update.arrived_at = new Date().toISOString();
    if (action.next === 'service_rendered') update.service_rendered_at = new Date().toISOString();

    const { error } = await supabase.from('bookings').update(update).eq('id', booking.id);
    if (error) Alert.alert('Error', error.message);
    else onUpdated();
    setActing(false);
  };

  const statusColors: Partial<Record<BookingStatus, string>> = {
    accepted:         Colors.statusAccepted,
    vendor_on_way:    Colors.statusOnWay,
    vendor_arrived:   Colors.statusArrived,
    service_rendered: Colors.primary,
  };
  const dot = statusColors[booking.status] ?? Colors.primary;

  return (
    <View style={c.card}>
      <View style={c.cardHeader}>
        <View style={[c.statusDot, { backgroundColor: dot }]} />
        <Text style={c.customerName}>{booking.customer_name}</Text>
        <Text style={[c.statusPill, { color: dot }]}>
          {booking.status.replace(/_/g, ' ')}
        </Text>
      </View>
      <Text style={c.serviceName}>{booking.service_name}</Text>
      <Text style={c.meta}>{fmtDateTime(booking.scheduled_at)}</Text>
      {booking.user_location_address && (
        <Text style={c.meta} numberOfLines={1}>📍 {booking.user_location_address}</Text>
      )}
      {booking.phone_revealed && booking.customer_phone && (
        <Text style={c.phoneReveal}>📞 {booking.customer_phone}</Text>
      )}
      {action && (
        <TouchableOpacity
          style={[c.flowBtn, { backgroundColor: action.color }, acting && c.btnDisabled]}
          onPress={advance}
          disabled={acting}
        >
          {acting ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={c.flowBtnText}>{action.label}</Text>}
        </TouchableOpacity>
      )}
      {booking.status === 'service_rendered' && (
        <View style={c.waitingBox}>
          <Text style={c.waitingText}>Waiting for customer to confirm. Payment auto-releases in 2 hours.</Text>
        </View>
      )}
    </View>
  );
}

// ── Upcoming / past booking row ──────────────────────────────
function BookingRow({ booking }: { booking: VendorBooking }) {
  const isCompleted = booking.status === 'completed';
  return (
    <View style={c.row}>
      <View style={{ flex: 1 }}>
        <Text style={c.rowService}>{booking.service_name}</Text>
        <Text style={c.rowMeta}>{fmtDateTime(booking.scheduled_at)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[c.rowEarning, !isCompleted && { color: Colors.textMuted }]}>
          {isCompleted ? fmtPrice(vendorEarning(booking.service_price_kobo)) : booking.status.replace(/_/g, ' ')}
        </Text>
      </View>
    </View>
  );
}

// ── Root component ───────────────────────────────────────────
export default function VendorJobsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_price_kobo, service_duration_blocks,
        scheduled_at, user_location_address, created_at, phone_revealed,
        profiles(full_name, phone_number)
      `)
      .order('scheduled_at', { ascending: true })
      .not('status', 'in', '("completed","cancelled","expired","disputed")')
      .limit(50);

    // Also fetch a batch of recent completed/cancelled for history
    const { data: history } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_price_kobo, service_duration_blocks,
        scheduled_at, user_location_address, created_at, phone_revealed,
        profiles(full_name, phone_number)
      `)
      .in('status', ['completed', 'cancelled', 'expired'])
      .order('scheduled_at', { ascending: false })
      .limit(20);

    const toBooking = (b: any): VendorBooking => ({
      id: b.id,
      status: b.status,
      service_name: b.service_name,
      service_price_kobo: b.service_price_kobo,
      service_duration_blocks: b.service_duration_blocks,
      scheduled_at: b.scheduled_at,
      user_location_address: b.user_location_address,
      created_at: b.created_at,
      customer_name: b.profiles?.full_name ?? 'Customer',
      customer_phone: b.profiles?.phone_number ?? null,
      phone_revealed: b.phone_revealed,
    });

    setBookings([...(data ?? []).map(toBooking), ...(history ?? []).map(toBooking)]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch vendor online status
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('vendors').select('is_online').eq('id', user.id).single();
      if (data) setIsOnline(data.is_online);
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('vendor_bookings_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const toggleOnline = async () => {
    setTogglingOnline(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const next = !isOnline;
      await supabase.from('vendors').update({ is_online: next }).eq('id', user.id);
      setIsOnline(next);
    }
    setTogglingOnline(false);
  };

  const pending  = bookings.filter((b) => b.status === 'pending');
  const active   = bookings.filter((b) => ['accepted','vendor_on_way','vendor_arrived','service_rendered'].includes(b.status));
  const upcoming = bookings.filter((b) => b.status === 'accepted' && new Date(b.scheduled_at) > new Date());
  // Remove from active if scheduled far in future (show only today's jobs)
  const todayActive = active.filter((b) => {
    const d = new Date(b.scheduled_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() || b.status !== 'accepted';
  });
  const history  = bookings.filter((b) => ['completed','cancelled','expired'].includes(b.status));

  if (loading) return <View style={c.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  return (
    <View style={[c.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={c.header}>
        <Text style={c.headerTitle}>My Jobs</Text>
        <TouchableOpacity
          style={[c.onlineToggle, isOnline ? c.onlineOn : c.onlineOff, togglingOnline && c.btnDisabled]}
          onPress={toggleOnline}
          disabled={togglingOnline}
        >
          {togglingOnline
            ? <ActivityIndicator color={isOnline ? '#FFF' : Colors.primary} size="small" />
            : <Text style={[c.onlineToggleText, isOnline && c.onlineToggleTextOn]}>
                {isOnline ? '● Online' : '○ Go online'}
              </Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
      >
        {/* Incoming requests */}
        {pending.length > 0 && (
          <Section title={`Incoming requests (${pending.length})`} urgent>
            {pending.map((b) => (
              <PendingCard
                key={b.id}
                booking={b}
                sessionToken={session?.access_token ?? ''}
                onUpdated={load}
              />
            ))}
          </Section>
        )}

        {/* Active jobs */}
        {todayActive.length > 0 && (
          <Section title="Active today">
            {todayActive.map((b) => (
              <ActiveCard key={b.id} booking={b} onUpdated={load} />
            ))}
          </Section>
        )}

        {/* Upcoming */}
        {upcoming.filter((b) => {
          const d = new Date(b.scheduled_at);
          return d.toDateString() !== new Date().toDateString();
        }).length > 0 && (
          <Section title="Upcoming">
            {upcoming
              .filter((b) => new Date(b.scheduled_at).toDateString() !== new Date().toDateString())
              .map((b) => <BookingRow key={b.id} booking={b} />)}
          </Section>
        )}

        {/* History */}
        {history.length > 0 && (
          <Section title="Recent history">
            {history.map((b) => <BookingRow key={b.id} booking={b} />)}
          </Section>
        )}

        {pending.length === 0 && todayActive.length === 0 && (
          <View style={c.empty}>
            <Text style={c.emptyTitle}>{isOnline ? 'No jobs yet' : 'You\'re offline'}</Text>
            <Text style={c.emptyBody}>
              {isOnline
                ? 'Sit tight — booking requests will appear here.'
                : 'Go online to start receiving booking requests.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children, urgent }: { title: string; children: React.ReactNode; urgent?: boolean }) {
  return (
    <View style={c.section}>
      <Text style={[c.sectionTitle, urgent && c.sectionTitleUrgent]}>{title}</Text>
      {children}
    </View>
  );
}

const c = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },
  onlineToggle: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5,
  },
  onlineOn:  { backgroundColor: Colors.success, borderColor: Colors.success },
  onlineOff: { backgroundColor: Colors.background, borderColor: Colors.border },
  onlineToggleText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  onlineToggleTextOn: { color: '#FFF' },

  section: { paddingTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  sectionTitleUrgent: { color: Colors.statusPending },

  // Cards
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 10, gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  customerName: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  countdown: { fontSize: 12, fontWeight: '700', color: Colors.statusPending, fontVariant: ['tabular-nums'] },
  statusPill: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  serviceName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 13, color: Colors.textSecondary },
  priceRow: { marginTop: 4 },
  earning: { fontSize: 13, color: Colors.textSecondary },
  earningAmount: { fontWeight: '800', color: Colors.text },
  phoneReveal: { fontSize: 14, fontWeight: '600', color: Colors.success },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  declineBtn: {
    flex: 1, height: 44, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  acceptBtn: {
    flex: 2, height: 44, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  flowBtn: {
    height: 48, borderRadius: 12, marginTop: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  flowBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  waitingBox: {
    backgroundColor: Colors.primaryLight, borderRadius: 10, padding: 10, marginTop: 4,
  },
  waitingText: { fontSize: 12, color: Colors.primary, lineHeight: 17 },

  btnDisabled: { opacity: 0.5 },

  // Rows
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowService: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowEarning: { fontSize: 14, fontWeight: '700', color: Colors.success },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
