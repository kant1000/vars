// ============================================================
// VARS — Customer Booking Detail
// Route: /booking/detail/[bookingId]
// Deep-linked from all customer push notifications.
// Shows full booking state, timeline, summary, and actions.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ─────────────────────────────────────────────────────
type BookingStatus =
  | 'pending' | 'accepted' | 'on_way' | 'arrived'
  | 'service_rendered' | 'completed' | 'cancelled' | 'expired' | 'disputed';

interface BookingDetail {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_duration_blocks: number;
  service_price_kobo: number;
  scheduled_at: string;
  vendor_name: string;
  vendor_phone: string | null;
  user_location_address: string | null;
  user_location_lat: number | null;
  user_location_lng: number | null;
  access_building: string | null;
  access_floor: string | null;
  access_flat: string | null;
  access_code: string | null;
  // Timeline timestamps
  created_at: string;
  accepted_at: string | null;
  on_way_at: string | null;
  arrived_at: string | null;
  service_rendered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  // Payment
  paystack_reference: string | null;
}

// ── Helpers ───────────────────────────────────────────────────
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
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; description: string }> = {
  pending:          { label: 'Awaiting vendor',   color: Colors.statusPending,   description: 'Your vendor has 2 hours to confirm this booking.' },
  accepted:         { label: 'Confirmed',          color: Colors.statusAccepted,  description: 'Your vendor confirmed. See you soon.' },
  on_way:           { label: 'On the way',         color: Colors.statusOnWay,     description: 'Your vendor is on their way to you.' },
  arrived:          { label: 'Arrived',            color: Colors.statusArrived,   description: 'Your vendor has arrived.' },
  service_rendered: { label: 'Service complete',   color: Colors.primary,         description: 'Confirm below to release payment to your vendor.' },
  completed:        { label: 'Completed',          color: Colors.statusCompleted, description: 'Service complete. Payment has been released.' },
  cancelled:        { label: 'Cancelled',          color: Colors.statusCancelled, description: 'This booking was cancelled.' },
  expired:          { label: 'Expired',            color: Colors.statusExpired,   description: 'Your vendor did not respond in time. You have been fully refunded.' },
  disputed:         { label: 'Under review',       color: Colors.statusDisputed,  description: 'This booking is under review by the VARS team.' },
};

// ── Timeline ──────────────────────────────────────────────────
interface TimelineStep {
  label: string;
  ts: string | null;
  reached: boolean;
}

function buildTimeline(b: BookingDetail): TimelineStep[] {
  const s = b.status;

  if (s === 'cancelled') {
    return [
      { label: 'Booking placed',  ts: b.created_at,    reached: true  },
      { label: 'Cancelled',       ts: b.cancelled_at,  reached: true  },
    ];
  }
  if (s === 'expired') {
    return [
      { label: 'Booking placed',  ts: b.created_at,   reached: true  },
      { label: 'Expired',         ts: b.expired_at,   reached: true  },
    ];
  }
  if (s === 'disputed') {
    return [
      { label: 'Booking placed',     ts: b.created_at,           reached: true },
      { label: 'Confirmed',          ts: b.accepted_at,          reached: !!b.accepted_at },
      { label: 'Dispute raised',     ts: null,                   reached: true },
    ];
  }

  const ORDER: BookingStatus[] = ['pending', 'accepted', 'on_way', 'arrived', 'service_rendered', 'completed'];
  const currentIdx = ORDER.indexOf(s);

  const steps: TimelineStep[] = [
    { label: 'Booking placed',   ts: b.created_at,           reached: true },
    { label: 'Confirmed',        ts: b.accepted_at,          reached: currentIdx >= 1 },
    { label: 'On the way',       ts: b.on_way_at,            reached: currentIdx >= 2 },
    { label: 'Arrived',          ts: b.arrived_at,           reached: currentIdx >= 3 },
    { label: 'Service complete', ts: b.service_rendered_at,  reached: currentIdx >= 4 },
    { label: 'Completed',        ts: b.completed_at,         reached: currentIdx >= 5 },
  ];

  return steps;
}

function Timeline({ booking }: { booking: BookingDetail }) {
  const steps = buildTimeline(booking);
  return (
    <View style={tl.wrap}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <View key={step.label} style={tl.row}>
            {/* Spine */}
            <View style={tl.spineCol}>
              <View style={[tl.dot, step.reached && tl.dotReached]} />
              {!isLast && <View style={[tl.line, step.reached && tl.lineReached]} />}
            </View>
            {/* Content */}
            <View style={tl.content}>
              <Text style={[tl.label, step.reached && tl.labelReached]}>{step.label}</Text>
              {step.ts ? (
                <Text style={tl.ts}>{fmtDateTime(step.ts)}</Text>
              ) : step.reached ? (
                <Text style={tl.ts}>—</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const tl = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 8 },
  row: { flexDirection: 'row', minHeight: 48 },
  spineCol: { width: 24, alignItems: 'center', marginRight: 12 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.background, marginTop: 3,
  },
  dotReached: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 2 },
  lineReached: { backgroundColor: Colors.primary },
  content: { flex: 1, paddingBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  labelReached: { color: Colors.text },
  ts: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});

// ── Map thumbnail (non-interactive) ──────────────────────────
function LocationMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapView
      style={s.mapThumb}
      provider={PROVIDER_DEFAULT}
      region={{ latitude: lat, longitude: lng, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
      scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
      liteMode={true}
    >
      <Marker coordinate={{ latitude: lat, longitude: lng }} />
    </MapView>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_duration_blocks, service_price_kobo,
        scheduled_at, paystack_reference,
        user_location_address, user_location_lat, user_location_lng,
        access_building, access_floor, access_flat, access_code,
        created_at, accepted_at, on_way_at, arrived_at,
        service_rendered_at, completed_at, cancelled_at, expired_at,
        vendors:vendor_id(full_name, phone_number)
      `)
      .eq('id', bookingId)
      .single();

    if (!error && data) {
      setBooking({
        ...data,
        vendor_name: (data as any).vendors?.full_name ?? 'Vendor',
        vendor_phone: (data as any).vendors?.phone_number ?? null,
      } as BookingDetail);
    }
    setLoading(false);
    setRefreshing(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/bookings');
  };

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  if (!booking) {
    return (
      <View style={[s.centered, { paddingTop: insets.top }]}>
        <Text style={s.errorTitle}>Booking not found</Text>
        <TouchableOpacity style={s.backLink} onPress={handleBack}>
          <Text style={s.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[booking.status];
  const hasMap = booking.user_location_lat != null && booking.user_location_lng != null;
  const hasAccess = booking.access_building || booking.access_floor || booking.access_flat || booking.access_code;
  const isTerminal = ['completed', 'cancelled', 'expired', 'disputed'].includes(booking.status);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerBack}>
          <Text style={s.headerBackText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Booking details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isTerminal ? 40 : 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />
        }
      >
        {/* Status hero */}
        <View style={[s.statusHero, { borderBottomColor: cfg.color + '30' }]}>
          <View style={[s.statusPill, { backgroundColor: cfg.color + '18' }]}>
            <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={s.statusDescription}>{cfg.description}</Text>
        </View>

        {/* Booking summary card */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Booking</Text>
          <View style={s.card}>
            <SummaryRow label="Vendor"    value={booking.vendor_name} />
            <SummaryRow label="Service"   value={booking.service_name} />
            <SummaryRow label="Duration"  value={fmtDuration(booking.service_duration_blocks)} />
            <SummaryRow label="Date"      value={fmtShortDate(booking.scheduled_at)} />
            <SummaryRow label="Time"      value={fmtTime(booking.scheduled_at)} />
            <View style={s.cardDivider} />
            <SummaryRow label="Total"     value={fmtPrice(booking.service_price_kobo)} bold />
          </View>
        </View>

        {/* Location */}
        {hasMap && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Location</Text>
            <LocationMap lat={booking.user_location_lat!} lng={booking.user_location_lng!} />
            {booking.user_location_address ? (
              <View style={s.addressRow}>
                <Text style={s.addressIcon}>📍</Text>
                <Text style={s.addressText}>{booking.user_location_address}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Access details (always visible to customer — they provided them) */}
        {hasAccess && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Access details</Text>
            <View style={s.card}>
              {booking.access_building && <SummaryRow label="Building"  value={booking.access_building} />}
              {booking.access_floor    && <SummaryRow label="Floor"     value={booking.access_floor} />}
              {booking.access_flat     && <SummaryRow label="Flat"      value={booking.access_flat} />}
              {booking.access_code     && <SummaryRow label="Gate code" value={booking.access_code} />}
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Timeline</Text>
          <Timeline booking={booking} />
        </View>

        {/* Error banner */}
        {actionError && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{actionError}</Text>
          </View>
        )}

        {/* Action area — stub, implemented in Part 5 */}
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, bold && s.summaryValueBold]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerBackText: { fontSize: 28, color: Colors.primary, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  statusHero: {
    paddingHorizontal: 20, paddingVertical: 20,
    borderBottomWidth: 1, gap: 8,
  },
  statusPill: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  statusPillText: { fontSize: 14, fontWeight: '700' },
  statusDescription: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 2,
  },
  cardDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.text, maxWidth: '60%', textAlign: 'right' },
  summaryValueBold: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  mapThumb: { width: '100%', height: 180, borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surface, borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: Colors.border,
  },
  addressIcon: { fontSize: 14, lineHeight: 20 },
  addressText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },

  errorBanner: { backgroundColor: Colors.error + '15', marginHorizontal: 16, marginTop: 16, borderRadius: 10, padding: 12 },
  errorText: { fontSize: 13, color: Colors.error, fontWeight: '500' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  backLink: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.primary, borderRadius: 12 },
  backLinkText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
