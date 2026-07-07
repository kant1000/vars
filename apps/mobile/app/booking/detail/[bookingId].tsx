// ============================================================
// VARS — Customer Booking Detail
// Route: /booking/detail/[bookingId]
// Deep-linked from all customer push notifications.
// Shows full booking state, timeline, summary, and actions.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtDuration, fmtTime, fmtDate, fmtDateTime } from '@/lib/format';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { useNetworkState } from '@/lib/useNetworkState';
import { cacheSet, cacheGet } from '@/lib/cache';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PinIcon } from '@/components/icons';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ─────────────────────────────────────────────────────

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
  vendor_id: string;
  suggested_scheduled_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

// ── Silent input filter ───────────────────────────────────────
function sanitize(text: string, maxLen: number) {
  return text.replace(/@/g, '').replace(/\d{7,}/g, '').slice(0, maxLen);
}


// ── Dispute categories ────────────────────────────────────────
type DisputeCategory =
  | 'vendor_no_show' | 'vendor_very_late' | 'service_not_completed'
  | 'service_quality_poor' | 'wrong_service' | 'other';

const DISPUTE_CATEGORIES: { value: DisputeCategory; label: string }[] = [
  { value: 'vendor_no_show',          label: "Vendor didn't show up" },
  { value: 'vendor_very_late',        label: 'Vendor arrived very late' },
  { value: 'service_not_completed',   label: 'Service was not completed' },
  { value: 'service_quality_poor',    label: 'Service quality was poor' },
  { value: 'wrong_service',           label: 'Wrong service was performed' },
  { value: 'other',                   label: 'Other' },
];

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; description: string }> = {
  pending:              { label: 'Confirming...',          color: Colors.statusPending,   description: 'Your vendor has 1 hour to confirm.' },
  accepted:             { label: 'Confirmed',              color: Colors.statusAccepted,  description: 'Your vendor confirmed. See you soon.' },
  on_way:               { label: 'On the way',             color: Colors.statusOnWay,     description: 'Your vendor is on their way to you.' },
  arrived:              { label: 'Arrived',                color: Colors.statusArrived,   description: 'Your vendor has arrived.' },
  service_rendered:     { label: 'Service complete',       color: Colors.primary,         description: 'Confirm below to release payment to your vendor.' },
  completed:            { label: 'Completed',              color: Colors.statusCompleted, description: 'Service complete. Payment has been released.' },
  cancelled:            { label: 'Cancelled',              color: Colors.statusCancelled, description: 'This booking was cancelled.' },
  expired:              { label: 'Expired',                color: Colors.statusExpired,   description: 'This booking expired — you\'ve been fully refunded.' },
  disputed:             { label: 'Under review',           color: Colors.statusDisputed,  description: 'This booking is under review by the VARS team.' },
  rescheduled_pending:  { label: 'New time suggested',     color: Colors.statusPending,   description: 'Your vendor suggested a new time. Review it below.' },
};

// ── Timeline ──────────────────────────────────────────────────
interface TimelineStep {
  label: string;
  ts: string | null;
  reached: boolean;
}

function buildTimeline(b: BookingDetail): TimelineStep[] {
  const s = b.status;

  if (s === BOOKING_STATUS.CANCELLED) {
    return [
      { label: 'Booking placed',  ts: b.created_at,    reached: true  },
      { label: 'Cancelled',       ts: b.cancelled_at,  reached: true  },
    ];
  }
  if (s === BOOKING_STATUS.EXPIRED) {
    return [
      { label: 'Booking placed',  ts: b.created_at,   reached: true  },
      { label: 'Expired',         ts: b.expired_at,   reached: true  },
    ];
  }
  if (s === BOOKING_STATUS.DISPUTED) {
    return [
      { label: 'Booking placed',     ts: b.created_at,           reached: true },
      { label: 'Confirmed',          ts: b.accepted_at,          reached: !!b.accepted_at },
      { label: 'Dispute raised',     ts: null,                   reached: true },
    ];
  }

  const ORDER: BookingStatus[] = [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED, BOOKING_STATUS.COMPLETED];
  const currentIdx = ORDER.indexOf(s === BOOKING_STATUS.RESCHEDULED_PENDING ? BOOKING_STATUS.PENDING : s);

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

// ── Live tracking map (on_way status) ────────────────────────
function LiveTrackingMap({
  vendorId, clientLat, clientLng,
}: {
  vendorId: string;
  clientLat: number;
  clientLng: number;
}) {
  const mapRef = useRef<MapView>(null);
  const [vendorCoords, setVendorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchVendorLocation = useCallback(async () => {
    const { data } = await supabase
      .from('vendors')
      .select('vendor_current_lat, vendor_current_lng')
      .eq('id', vendorId)
      .single();
    if (data?.vendor_current_lat && data?.vendor_current_lng) {
      setVendorCoords({ lat: data.vendor_current_lat, lng: data.vendor_current_lng });
      setLastUpdated(new Date());
    }
  }, [vendorId]);

  // Fetch immediately, then every 30s
  useEffect(() => {
    fetchVendorLocation();
    const interval = setInterval(fetchVendorLocation, 30_000);
    return () => clearInterval(interval);
  }, [fetchVendorLocation]);

  // Fit both markers into view once vendor coords arrive
  useEffect(() => {
    if (!vendorCoords) return;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: vendorCoords.lat, longitude: vendorCoords.lng },
        { latitude: clientLat, longitude: clientLng },
      ],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
    );
  }, [vendorCoords, clientLat, clientLng]);

  const midLat = vendorCoords ? (vendorCoords.lat + clientLat) / 2 : clientLat;
  const midLng = vendorCoords ? (vendorCoords.lng + clientLng) / 2 : clientLng;

  return (
    <View>
      <View style={s.liveHeader}>
        <View style={s.liveDot} />
        <Text style={s.liveLabel}>Live · updates every 30s</Text>
        {lastUpdated && (
          <Text style={s.liveUpdated}>
            {lastUpdated.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </Text>
        )}
      </View>
      <MapView
        ref={mapRef}
        style={s.liveMap}
        provider={PROVIDER_DEFAULT}
        initialRegion={{ latitude: midLat, longitude: midLng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        scrollEnabled zoomEnabled rotateEnabled={false} pitchEnabled={false}
      >
        {/* Client location */}
        <Marker
          coordinate={{ latitude: clientLat, longitude: clientLng }}
          title="Your location"
          pinColor={Colors.primary}
        />
        {/* Vendor location */}
        {vendorCoords && (
          <Marker
            coordinate={{ latitude: vendorCoords.lat, longitude: vendorCoords.lng }}
            title="Your vendor"
            pinColor="#22C55E"
          />
        )}
      </MapView>
      {!vendorCoords && (
        <View style={s.liveLoadingOverlay}>
          <ScissorsLoader size="small" color="dark" />
          <Text style={s.liveLoadingText}>Locating your vendor…</Text>
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { isOnline: isConnected } = useNetworkState();

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approvedPhotoUrls, setApprovedPhotoUrls] = useState<string[]>([]);
  const [hasReview, setHasReview] = useState(false);
  const [reviewRating, setReviewRating] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const disputeSheetRef = useRef<BottomSheetModal>(null);
  const [disputeCategory, setDisputeCategory] = useState<DisputeCategory | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const callEdgeFn = async (fn: string, body: object) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s?.access_token) throw new Error('Session expired. Please sign in again.');
    const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `${fn} failed`);
    return data;
  };

  const handleConfirmService = async () => {
    if (!booking) return;
    setActionLoading(true); setActionError(null);
    try {
      await callEdgeFn('paystack-settle', { booking_id: booking.id });
      await load();
    } catch (err: any) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  const handleCancel = async () => {
    if (!booking) return;
    setShowCancelModal(false);
    setActionLoading(true); setActionError(null);
    try {
      await callEdgeFn('paystack-cancel', { booking_id: booking.id, reason: 'User cancelled' });
      await load();
    } catch (err: any) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  const handleDispute = async () => {
    if (!booking || !disputeCategory) return;
    if (disputeCategory === 'other' && !disputeReason.trim()) return;
    disputeSheetRef.current?.dismiss();
    setActionLoading(true); setActionError(null);
    try {
      await callEdgeFn('dispute-raise', {
        booking_id: booking.id,
        category: disputeCategory,
        reason: disputeReason.trim() || undefined,
      });
      setDisputeCategory(null);
      setDisputeReason('');
      await load();
    } catch (err: any) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  const handleAcceptReschedule = async () => {
    if (!booking) return;
    setActionLoading(true); setActionError(null);
    try {
      await callEdgeFn('customer-accept-reschedule', { booking_id: booking.id });
      await load();
    } catch (err: any) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  const handleDeclineReschedule = async () => {
    if (!booking) return;
    setActionLoading(true); setActionError(null);
    try {
      await callEdgeFn('customer-decline-reschedule', { booking_id: booking.id });
      await load();
    } catch (err: any) { setActionError(err.message); }
    finally { setActionLoading(false); }
  };

  // Seed UI from cache on first mount only — avoids blank screen while fetch runs
  useEffect(() => {
    cacheGet<BookingDetail>(`booking_detail_${bookingId}`).then((c) => { if (c) setBooking(c); });
  }, [bookingId]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, status, vendor_id, service_name, service_duration_blocks, service_price_kobo,
        scheduled_at, suggested_scheduled_at, paystack_reference,
        user_location_address, user_location_lat, user_location_lng,
        access_building, access_floor, access_flat, access_code,
        created_at, accepted_at, on_way_at, arrived_at,
        service_rendered_at, completed_at, cancelled_at, expired_at,
        vendors:vendor_id(full_name, phone_number)
      `)
      .eq('id', bookingId)
      .single();

    if (!error && data) {
      const fresh: BookingDetail = {
        ...data,
        vendor_id: (data as any).vendor_id,
        vendor_name: (data as any).vendors?.full_name ?? 'Vendor',
        vendor_phone: (data as any).vendors?.phone_number ?? null,
        suggested_scheduled_at: (data as any).suggested_scheduled_at ?? null,
      } as BookingDetail;
      setBooking(fresh);
      cacheSet(`booking_detail_${bookingId}`, fresh, 5 * 60_000).catch(() => {});

      if (fresh.status === 'completed') {
        const [{ data: review }, { data: photos }] = await Promise.all([
          supabase.from('reviews').select('rating').eq('booking_id', bookingId).maybeSingle(),
          supabase.from('portfolio_photos').select('storage_path').eq('booking_id', bookingId).eq('consent_state', 'approved'),
        ]);
        setHasReview(!!review);
        setReviewRating(review?.rating ?? null);
        setApprovedPhotoUrls(
          (photos ?? []).map((p: any) =>
            supabase.storage.from('portfolio').getPublicUrl(p.storage_path).data.publicUrl
          )
        );
      }
    }
    setLoading(false);
    setRefreshing(false);
  }, [bookingId]);

  // useFocusEffect handles both initial mount and return-from-navigation refreshes
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const channel = supabase
      .channel(`booking:${bookingId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `id=eq.${bookingId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId, load]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/bookings');
  };

  if (loading && !booking) {
    return <View style={s.centered}><ScissorsLoader size="large" color="dark" /></View>;
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
  const isTerminal = ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED, BOOKING_STATUS.DISPUTED] as BookingStatus[]).includes(booking.status);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <OfflineBanner visible={!isConnected} />

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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="transparent" colors={['transparent']} />
        }
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color="dark" />
          </View>
        )}
        {/* Status hero */}
        <View style={[s.statusHero, { borderBottomColor: cfg.color + '30' }]}>
          <View style={[s.statusPill, { backgroundColor: cfg.color + '18' }]}>
            <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={s.statusDescription}>{cfg.description}</Text>
          {(booking.status === BOOKING_STATUS.PENDING || booking.status === BOOKING_STATUS.ACCEPTED) && (
            <Text style={s.escrowNote}>
              Payment is only taken when your stylist sets off — not before.
            </Text>
          )}
        </View>

        {/* Booking summary card */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Booking</Text>
          <View style={s.card}>
            <SummaryRow label="Vendor"    value={booking.vendor_name} />
            <SummaryRow label="Service"   value={booking.service_name} />
            <SummaryRow label="Duration"  value={fmtDuration(booking.service_duration_blocks)} />
            <SummaryRow label="Date"      value={fmtDate(booking.scheduled_at)} />
            <SummaryRow label="Time"      value={fmtTime(booking.scheduled_at)} />
            <View style={s.cardDivider} />
            <SummaryRow label="Total"     value={fmtPrice(booking.service_price_kobo)} bold />
          </View>
        </View>

        {/* Location — live map for on_way, static thumbnail otherwise */}
        {hasMap && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              {booking.status === BOOKING_STATUS.ON_WAY ? 'Vendor tracking' : 'Location'}
            </Text>
            {booking.status === BOOKING_STATUS.ON_WAY ? (
              <LiveTrackingMap
                vendorId={booking.vendor_id}
                clientLat={booking.user_location_lat!}
                clientLng={booking.user_location_lng!}
              />
            ) : (
              <>
                <LocationMap lat={booking.user_location_lat!} lng={booking.user_location_lng!} />
                {booking.user_location_address ? (
                  <View style={s.addressRow}>
                    <PinIcon size={16} color={Colors.text} />
                    <Text style={s.addressText}>{booking.user_location_address}</Text>
                  </View>
                ) : null}
              </>
            )}
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

        {/* ── Action area ─────────────────────────────── */}

        {/* Confirm service (service_rendered) */}
        {booking.status === BOOKING_STATUS.SERVICE_RENDERED && (
          <View style={s.actionSection}>
            <TouchableOpacity
              style={[s.primaryBtn, actionLoading && s.btnDisabled]}
              onPress={handleConfirmService}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={s.primaryBtnText}>Confirm service complete</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.secondaryBtn, actionLoading && s.btnDisabled]}
              onPress={() => disputeSheetRef.current?.present()}
              disabled={actionLoading}
            >
              <Text style={s.secondaryBtnText}>Report an issue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel (pending / accepted only) */}
        {(booking.status === BOOKING_STATUS.PENDING || booking.status === BOOKING_STATUS.ACCEPTED) && (
          <View style={s.actionSection}>
            <TouchableOpacity
              style={[s.cancelBtn, actionLoading && s.btnDisabled]}
              onPress={() => setShowCancelModal(true)}
              disabled={actionLoading}
            >
              {actionLoading
                ? <ScissorsLoader size="small" color="dark" />
                : <Text style={s.cancelBtnText}>Cancel booking</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* Expired — find another vendor */}
        {booking.status === BOOKING_STATUS.EXPIRED && (
          <View style={s.actionSection}>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => router.replace('/(tabs)')}
            >
              <Text style={s.primaryBtnText}>Find another vendor</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Approved photos from this service */}
        {booking.status === BOOKING_STATUS.COMPLETED && approvedPhotoUrls.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Photos from this service</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }}>
              {approvedPhotoUrls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={s.servicePhoto}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Review section for completed bookings */}
        {booking.status === BOOKING_STATUS.COMPLETED && (
          <View style={s.actionSection}>
            {hasReview && reviewRating !== null ? (
              <View style={s.reviewDisplay}>
                <Text style={s.reviewStars}>{'★'.repeat(reviewRating)}{'☆'.repeat(5 - reviewRating)}</Text>
                <Text style={s.reviewLabel}>Your review</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => router.push(`/review/${booking.id}` as any)}
              >
                <Text style={s.primaryBtnText}>Leave a review</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {/* ── Cancel confirmation modal ───────────────── */}
      {booking && (
        <Modal visible={showCancelModal} transparent animationType="fade" onRequestClose={() => setShowCancelModal(false)}>
          <Pressable style={s.modalOverlay} onPress={() => setShowCancelModal(false)}>
            <Pressable style={s.modalSheet} onPress={() => {}}>
              <Text style={s.modalTitle}>Cancel booking?</Text>
              <Text style={s.modalBody}>
                Your stylist hasn&apos;t set off yet — cancellation is free. No payment has been taken.
              </Text>
              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalKeepBtn} onPress={() => setShowCancelModal(false)}>
                  <Text style={s.modalKeepText}>Keep booking</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalCancelBtn} onPress={handleCancel}>
                  <Text style={s.modalCancelText}>Yes, cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Reschedule suggestion modal ─────────────── */}
      {booking.status === BOOKING_STATUS.RESCHEDULED_PENDING && !!booking.suggested_scheduled_at && (
        <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
          <View style={s.rescheduleOverlay}>
            <View style={s.rescheduleSheet}>
              <Text style={s.rescheduleVendorName}>{booking.vendor_name}</Text>
              <Text style={s.rescheduleHeading}>Suggested a new time</Text>
              <View style={s.rescheduleTimeCard}>
                <Text style={s.rescheduleDateText}>{fmtDate(booking.suggested_scheduled_at)}</Text>
                <Text style={s.rescheduleTimeText}>{fmtTime(booking.suggested_scheduled_at)}</Text>
              </View>
              {actionError && (
                <View style={[s.errorBanner, { marginHorizontal: 0 }]}>
                  <Text style={s.errorText}>{actionError}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.primaryBtn, { width: '100%' }, actionLoading && s.btnDisabled]}
                onPress={handleAcceptReschedule}
                disabled={actionLoading}
              >
                {actionLoading
                  ? <ScissorsLoader size="small" color="light" />
                  : <Text style={s.primaryBtnText}>Accept new time</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secondaryBtn, { width: '100%' }, actionLoading && s.btnDisabled]}
                onPress={handleDeclineReschedule}
                disabled={actionLoading}
              >
                <Text style={s.secondaryBtnText}>Find another vendor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Dispute sheet ───────────────────────────── */}
      <BottomSheetModal
        ref={disputeSheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetView style={[s.modalSheet, { paddingBottom: 32 }]}>
          <Text style={s.modalTitle}>Raise a dispute</Text>
          <Text style={s.modalBody}>Tell us what went wrong. Our team will review within 24 hours.</Text>
          <View style={{ gap: 8, marginBottom: 2 }}>
            {DISPUTE_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                activeOpacity={0.7}
                onPress={() => setDisputeCategory(c.value)}
                style={[s.categoryRow, disputeCategory === c.value && s.categoryRowSelected]}
              >
                <View style={[s.radio, disputeCategory === c.value && s.radioSelected]} />
                <Text style={[s.categoryLabel, disputeCategory === c.value && s.categoryLabelSelected]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {disputeCategory && (
            <TextInput
              style={[s.disputeInput, { marginTop: 14 }]}
              placeholder={disputeCategory === 'other' ? 'Describe the issue… (required)' : 'Add more details (optional)'}
              placeholderTextColor={Colors.textMuted}
              value={disputeReason}
              onChangeText={(t) => setDisputeReason(sanitize(t, 500))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          )}
          <TouchableOpacity
            style={[s.primaryBtn, { marginTop: 16 },
              (!disputeCategory || (disputeCategory === 'other' && !disputeReason.trim())) && s.btnDisabled]}
            onPress={handleDispute}
            disabled={!disputeCategory || (disputeCategory === 'other' && !disputeReason.trim())}
          >
            <Text style={s.primaryBtnText}>Submit dispute</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>

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
  statusPill: { alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  statusDescription: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  escrowNote: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },

  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },

  card: {
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 2,
  },
  cardDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.text, maxWidth: '60%', textAlign: 'right' },
  summaryValueBold: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  mapThumb: { width: '100%', height: 180, borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 10, borderWidth: 1, borderColor: Colors.border,
  },
  addressText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 18 },

  errorBanner: { backgroundColor: Colors.error + '15', marginHorizontal: 16, marginTop: 16, borderRadius: 5, padding: 12 },
  errorText: { fontSize: 13, color: Colors.error, fontWeight: '500' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  backLink: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.ink, borderRadius: 5 },
  backLinkText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

  // Action buttons
  actionSection: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  primaryBtn: {
    height: 56, backgroundColor: Colors.ink,
    borderRadius: 5, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    height: 44, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  cancelBtn: {
    height: 50, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.error + '60',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.error },
  btnDisabled: { opacity: 0.5 },
  servicePhoto: { width: 160, height: 160, borderRadius: 5 },
  reviewDisplay: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 5,
    paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  reviewStars: { fontSize: 20, color: Colors.primary },
  reviewLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 5, borderTopRightRadius: 5,
    padding: 24, paddingBottom: 40, gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  modalBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  modalBold: { fontWeight: '700', color: Colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalKeepBtn: {
    flex: 1, height: 52, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  modalKeepText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  modalCancelBtn: {
    flex: 1, height: 52, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.ink,
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  disputeInput: {
    backgroundColor: Colors.surface, borderRadius: 5,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text, minHeight: 80,
  },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryRowSelected: { borderColor: Colors.error, backgroundColor: Colors.error + '0D' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border },
  radioSelected: { borderColor: Colors.error, backgroundColor: Colors.error },
  categoryLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  categoryLabelSelected: { fontWeight: '600', color: Colors.error },

  // Reschedule modal
  rescheduleOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  rescheduleSheet: {
    backgroundColor: Colors.background, borderRadius: 5,
    padding: 24, width: '100%', gap: 12, alignItems: 'center',
  },
  rescheduleVendorName: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  rescheduleHeading: {
    fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center',
  },
  rescheduleTimeCard: {
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 20, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', width: '100%', marginVertical: 4,
  },
  rescheduleDateText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  rescheduleTimeText: { fontSize: 34, fontWeight: '800', color: Colors.text, marginTop: 4 },

  // Live tracking map
  liveHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8,
  },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.success,
  },
  liveLabel: { fontSize: 13, fontWeight: '600', color: Colors.success, flex: 1 },
  liveUpdated: { fontSize: 12, color: Colors.textMuted },
  liveMap: { width: '100%', height: 260, borderRadius: 5, overflow: 'hidden' },
  liveLoadingOverlay: {
    position: 'absolute', top: 32, left: 0, right: 0,
    alignItems: 'center', gap: 8,
  },
  liveLoadingText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
});
