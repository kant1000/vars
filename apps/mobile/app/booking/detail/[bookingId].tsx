// ============================================================
// VARS — Customer Booking Detail
// Route: /booking/detail/[bookingId]
// Deep-linked from all customer push notifications.
// Shows full booking state, timeline, summary, and actions.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { ConfirmModal } from '@/components/ConfirmModal';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { supabase } from '@/lib/supabase';
import { Colors, BORDER_WIDTH, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { StarFilledIcon } from '@/components/icons';
import { StatusDot, VendorStatus } from '@/components/StatusDot';
import { fmtPrice, fmtDuration, fmtTime, fmtDate, fmtDateTime, titleCase } from '@/lib/format';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { useNetworkState } from '@/lib/useNetworkState';
import { cacheSet, cacheGet } from '@/lib/cache';
import { OfflineBanner } from '@/components/OfflineBanner';
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
  // Ungated vendor profile fields (safe to read via an open join, unlike
  // phone/legal name below) — power the vendor header card at the top.
  vendor_profile_image_url: string | null;
  vendor_kyc_verified_at: string | null;
  vendor_avg_rating: number;
  vendor_total_reviews: number;
  vendor_pioneer: boolean;
  vendor_is_online: boolean;
  vendor_is_busy: boolean;
  // vendor_phone/vendor_legal_name only ever reach the client through
  // get_vendor_reveal_state, which returns null until its own gate has
  // fired for this customer+vendor (e.g. 15 min before the appointment) —
  // never fetched via an open join. See supabase/migrations/20260816000007.
  vendor_phone: string | null;
  vendor_legal_name: string | null;
  reveal_pending: boolean;
  phone_revealed: boolean;
  phone_reveal_at: string | null;
  auto_release_at: string | null;
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
  // bookings has no cancelled_at/expired_at columns — updated_at doubles as
  // the timestamp for those two terminal states (it's set at the same
  // moment the status transitions).
  updated_at: string;
  // Payment
  paystack_reference: string | null;
  vendor_id: string;
  suggested_scheduled_at: string | null;
}

// ── Helpers ───────────────────────────────────────────────────

// ── Silent input filter ───────────────────────────────────────
function sanitize(text: string, maxLen: number) {
  return text.replace(/@/g, '').replace(/(\d[\s.\-]{0,2}){7,}/g, '').replace(/\d{7,}/g, '').slice(0, maxLen);
}

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
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
  pending:              { label: 'Confirming...',          color: Colors.statusPending,   description: 'Your stylist has 1 hour to confirm.' },
  accepted:             { label: 'Confirmed',              color: Colors.statusAccepted,  description: 'Your stylist confirmed. See you soon.' },
  on_way:               { label: 'On the way',             color: Colors.statusOnWay,     description: 'Your stylist is on their way to you.' },
  arrived:              { label: 'Arrived',                color: Colors.statusArrived,   description: 'Your stylist has arrived.' },
  service_rendered:     { label: 'Service complete',       color: Colors.primary,         description: 'Confirm below to release payment to your stylist.' },
  completed:            { label: 'Completed',              color: Colors.statusCompleted, description: 'Service complete. Payment has been released.' },
  cancelled:            { label: 'Cancelled',              color: Colors.statusCancelled, description: 'This booking was cancelled.' },
  expired:              { label: 'Expired',                color: Colors.statusExpired,   description: 'This booking expired. No payment was taken.' },
  disputed:             { label: 'Under review',           color: Colors.statusDisputed,  description: 'This booking is under review by the VARS team.' },
  rescheduled_pending:  { label: 'New time suggested',     color: Colors.statusPending,   description: 'Your stylist suggested a new time. Review it below.' },
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
      { label: 'Booking placed',  ts: b.created_at,   reached: true  },
      { label: 'Cancelled',       ts: b.updated_at,   reached: true  },
    ];
  }
  if (s === BOOKING_STATUS.EXPIRED) {
    return [
      { label: 'Booking placed',  ts: b.created_at,   reached: true  },
      { label: 'Expired',         ts: b.updated_at,   reached: true  },
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
  const { theme } = useVarsTheme();
  const tl = useMemo(() => makeStylesTl(theme), [theme]);
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
                <Text style={tl.ts}>Logged</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeStylesTl(theme: VarsTheme) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: 20, paddingVertical: 8 },
    row: { flexDirection: 'row', minHeight: 48 },
    spineCol: { width: 24, alignItems: 'center', marginRight: 12 },
    dot: {
      width: 14, height: 14, borderRadius: 7,
      borderWidth: BORDER_WIDTH.thick, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg, marginTop: 3,
    },
    dotReached: { borderColor: theme.color.accentBlue, backgroundColor: theme.color.accentBlue },
    line: { width: 2, flex: 1, backgroundColor: theme.color.inkFaint, marginTop: 2 },
    lineReached: { backgroundColor: theme.color.accentBlue },
    content: { flex: 1, paddingBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    labelReached: { color: theme.color.ink },
    ts: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
  });
}

// Vendor position updates only ever arrive while the vendor's own app is
// foregrounded — both pings are plain setIntervals with no background task
// (confirmed elsewhere: nothing requests background location). A pin can go
// stale the instant a vendor backgrounds mid-job, so this threshold decides
// when to stop confidently calling it "Live" and say how long it's been.
const STALE_AFTER_MS = 2 * 60 * 1000;

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1m ago';
  return `${minutes}m ago`;
}

// ── Live tracking map (on_way status) ────────────────────────
function LiveTrackingMap({
  vendorId, clientLat, clientLng,
}: {
  vendorId: string;
  clientLat: number;
  clientLng: number;
}) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const mapRef = useRef<MapView>(null);
  const [vendorCoords, setVendorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // Pump only — forces a re-render so the "Xm ago" text and stale threshold
  // advance even when no new location has arrived to trigger one naturally.
  const [, setTick] = useState(0);

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

  // Realtime is the primary path: pushes the instant vendor-update-location
  // writes, instead of waiting on a fixed interval. The 60s poll below stays
  // as a fallback only, for the known case where a Realtime channel silently
  // drops (backgrounding, network hiccups) — matches the vendor's own on_way
  // ping cadence rather than trying to be faster than the data source.
  useEffect(() => {
    const channel = supabase
      .channel(`vendor-location:${vendorId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vendors',
        filter: `id=eq.${vendorId}`,
      }, () => { fetchVendorLocation(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [vendorId, fetchVendorLocation]);

  useEffect(() => {
    fetchVendorLocation();
    const interval = setInterval(fetchVendorLocation, 60_000);
    return () => clearInterval(interval);
  }, [fetchVendorLocation]);

  // Re-render every 15s so the relative "Xm ago" label and the stale
  // threshold advance on their own, not only when a new position arrives.
  useEffect(() => {
    const tick = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(tick);
  }, []);

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

  const ageMs = lastUpdated ? Date.now() - lastUpdated.getTime() : null;
  const isStale = ageMs !== null && ageMs > STALE_AFTER_MS;

  return (
    <View>
      <View style={s.liveHeader}>
        <View style={[s.liveDot, isStale && s.liveDotStale]} />
        <Text style={[s.liveLabel, isStale && s.liveLabelStale]}>
          {isStale ? `Last seen ${formatAge(ageMs)}` : 'Live'}
        </Text>
        {lastUpdated && !isStale && (
          <Text style={s.liveUpdated}>Updated {formatAge(ageMs!)}</Text>
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
          pinColor={theme.color.accentBlue}
        />
        {/* Vendor location */}
        {vendorCoords && (
          <Marker
            coordinate={{ latitude: vendorCoords.lat, longitude: vendorCoords.lng }}
            title="Your stylist"
            pinColor={theme.color.accentGreen}
          />
        )}
      </MapView>
      {!vendorCoords && (
        <View style={s.liveLoadingOverlay}>
          <ScissorsLoader size="small" color="dark" />
          <Text style={s.liveLoadingText}>Locating your stylist…</Text>
        </View>
      )}
    </View>
  );
}

// ── Vendor header card (avatar + name + rating, no price line — this
// screen already shows the booked service/price via BookingLineSummary) ──
const VENDOR_AVATAR_SIZE = 60;

function BookingVendorHeader({ booking }: { booking: BookingDetail }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity
      style={s.vendorHeaderCard}
      activeOpacity={0.88}
      onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: booking.vendor_id } })}
    >
      <View style={s.vendorHeaderAvatarWrap}>
        {booking.vendor_profile_image_url ? (
          <Image
            source={{
              uri: booking.vendor_kyc_verified_at
                ? `${booking.vendor_profile_image_url}?v=${encodeURIComponent(booking.vendor_kyc_verified_at)}`
                : booking.vendor_profile_image_url,
            }}
            style={s.vendorHeaderAvatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[s.vendorHeaderAvatar, s.vendorHeaderAvatarFallback]}>
            <Text style={s.vendorHeaderAvatarInitial}>{booking.vendor_name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        {booking.vendor_pioneer && (
          <View style={s.vendorHeaderPioneerDot}>
            <StarFilledIcon size={16} color={Colors.badgePioneer} strokeColor={theme.color.ink} />
          </View>
        )}
        <View style={s.vendorHeaderStatusDot}>
          <StatusDot
            status={(booking.vendor_is_busy ? 'busy' : booking.vendor_is_online ? 'online' : 'offline') as VendorStatus}
            size={14}
            bordered={false}
          />
        </View>
      </View>
      <View style={s.vendorHeaderInfo}>
        <Text style={s.vendorHeaderName} numberOfLines={1}>{booking.vendor_name}</Text>
        {booking.vendor_total_reviews === 0 ? (
          <Text style={s.vendorHeaderNew}>New on VARS</Text>
        ) : (
          <View style={s.vendorHeaderRatingRow}>
            <StarFilledIcon size={13} color={Colors.star} />
            <Text style={s.vendorHeaderRatingText}>
              {booking.vendor_avg_rating.toFixed(1)}
              <Text style={s.vendorHeaderReviewCount}> ({booking.vendor_total_reviews})</Text>
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Compact 3-line booking summary (service + duration, date & time, total) ──
function BookingLineSummary({ booking }: { booking: BookingDetail }) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.card}>
      <View style={s.lineSummaryRow}>
        <Text style={s.lineSummaryService} numberOfLines={1}>{booking.service_name}</Text>
        <Text style={s.lineSummaryDuration}>{fmtDuration(booking.service_duration_blocks)}</Text>
      </View>
      <Text style={s.lineSummaryDateTime}>{fmtDate(booking.scheduled_at)} · {fmtTime(booking.scheduled_at)}</Text>
      <Text style={s.lineSummaryAmount}>{fmtPrice(booking.service_price_kobo)}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
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
        phone_revealed, phone_reveal_at, auto_release_at,
        user_location_address, user_location_lat, user_location_lng,
        access_building, access_floor, access_flat, access_code,
        created_at, updated_at, accepted_at, on_way_at, arrived_at,
        service_rendered_at, completed_at,
        vendors:vendor_id(full_name, profile_image_url, kyc_verified_at, avg_rating, total_reviews, pioneer, is_online, is_busy)
      `)
      .eq('id', bookingId)
      .single();

    if (error) {
      console.warn('[booking/detail] failed to load booking', bookingId, error);
    }
    if (!error && data) {
      const vendorId = (data as any).vendor_id as string;
      // Legal name + phone number only ever reach the client through this
      // RPC, which returns null for either field until its own gate has
      // fired for this customer+vendor — never fetched via an open join.
      const { data: revealData } = await supabase
        .rpc('get_vendor_reveal_state', { p_vendor_id: vendorId })
        .maybeSingle();
      const reveal = revealData as { legal_name: string | null; phone_number: string | null; pending: boolean } | null;

      const fresh: BookingDetail = {
        ...data,
        vendor_id: vendorId,
        vendor_name: (data as any).vendors?.full_name ?? 'Vendor',
        vendor_profile_image_url: (data as any).vendors?.profile_image_url ?? null,
        vendor_kyc_verified_at: (data as any).vendors?.kyc_verified_at ?? null,
        vendor_avg_rating: (data as any).vendors?.avg_rating ?? 0,
        vendor_total_reviews: (data as any).vendors?.total_reviews ?? 0,
        vendor_pioneer: (data as any).vendors?.pioneer ?? false,
        vendor_is_online: (data as any).vendors?.is_online ?? false,
        vendor_is_busy: (data as any).vendors?.is_busy ?? false,
        vendor_phone: reveal?.phone_number ?? null,
        vendor_legal_name: reveal?.legal_name ?? null,
        reveal_pending: reveal?.pending ?? false,
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
    return <View style={s.centered}><ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>;
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

  const minsUntil = minutesUntil(booking.scheduled_at);
  const showPhone = booking.phone_revealed && booking.vendor_phone;
  const showPhoneCountdown = !booking.phone_revealed
    && booking.status === BOOKING_STATUS.ACCEPTED
    && minsUntil > 0 && minsUntil <= 30;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <OfflineBanner visible={!isConnected} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerBack} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
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
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
          </View>
        )}
        {/* Vendor header */}
        <BookingVendorHeader booking={booking} />

        {/* Booking summary — service/duration, date & time, total */}
        <View style={s.section}>
          <BookingLineSummary booking={booking} />
        </View>

        {/* Legal name reveal */}
        {booking.vendor_legal_name ? (
          <View style={s.revealCard}>
            <Text style={s.revealCardText}>{titleCase(booking.vendor_legal_name)}</Text>
          </View>
        ) : booking.reveal_pending ? (
          <View style={s.revealCard}>
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
            <Text style={s.revealCardTextPending}>Confirming legal name</Text>
          </View>
        ) : null}

        {/* Phone reveal */}
        {showPhone && (
          <TouchableOpacity
            style={s.phoneCard}
            onPress={() => Linking.openURL(`tel:${booking.vendor_phone}`)}
          >
            <Text style={s.phoneLabel}>📞 Call {booking.vendor_name.split(' ')[0]}</Text>
            <Text style={s.phoneNum}>{booking.vendor_phone}</Text>
          </TouchableOpacity>
        )}
        {showPhoneCountdown && (
          <View style={s.phoneCountdown}>
            <Text style={s.phoneCountdownText}>
              📞 {booking.vendor_name.split(' ')[0]}'s number revealed {minsUntil} min before your appointment
            </Text>
          </View>
        )}

        {/* Auto-release notice */}
        {booking.status === BOOKING_STATUS.SERVICE_RENDERED && booking.auto_release_at && (
          <View style={s.autoReleaseBox}>
            <Text style={s.autoReleaseText}>
              Payment auto-releases to your vendor at {fmtTime(booking.auto_release_at)} if you don't confirm.
            </Text>
          </View>
        )}

        {/* Live stylist tracking — on_way only. No static map/address for other
            statuses: the address is already right there in Access details below,
            a non-interactive thumbnail of it added nothing. */}
        {hasMap && booking.status === BOOKING_STATUS.ON_WAY && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Stylist tracking</Text>
            <LiveTrackingMap
              vendorId={booking.vendor_id}
              clientLat={booking.user_location_lat!}
              clientLng={booking.user_location_lng!}
            />
          </View>
        )}

        {/* Access details (always visible to customer — they provided them) */}
        {hasAccess && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Access details</Text>
            <View style={s.card}>
              {booking.access_building && <SummaryRow label="Address details" value={booking.access_building} />}
              {booking.access_floor    && <SummaryRow label="Floor"     value={booking.access_floor} />}
              {booking.access_flat     && <SummaryRow label="Flat"      value={booking.access_flat} />}
              {booking.access_code     && <SummaryRow label="Gate code" value={booking.access_code} />}
            </View>
          </View>
        )}

        {/* Status description — sits right above the timeline it explains */}
        <View style={[s.section, { paddingTop: 20 }]}>
          <Text style={s.statusDescription}>{cfg.description}</Text>
          {(booking.status === BOOKING_STATUS.PENDING || booking.status === BOOKING_STATUS.ACCEPTED) && (
            <Text style={[s.escrowNote, { marginTop: 6 }]}>
              Payment is only taken when your stylist sets off, not before.
            </Text>
          )}
        </View>

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
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
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
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
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
              <Text style={s.primaryBtnText}>Find another stylist</Text>
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
        <ConfirmModal
          visible={showCancelModal}
          title="Cancel booking?"
          body="Your stylist hasn't set off yet, cancellation is free. No payment has been taken."
          confirmLabel="Yes, cancel"
          dismissLabel="Keep booking"
          destructive
          onConfirm={handleCancel}
          onDismiss={() => setShowCancelModal(false)}
        />
      )}

      {/* ── Reschedule suggestion modal ─────────────── */}
      {booking.status === BOOKING_STATUS.RESCHEDULED_PENDING && !!booking.suggested_scheduled_at && (
        <ConfirmModal
          visible
          dismissOnBackdropPress={false}
          title="Suggested a new time"
          confirmLabel="Accept new time"
          dismissLabel="Find another stylist"
          confirmLoading={actionLoading}
          onConfirm={handleAcceptReschedule}
          onDismiss={handleDeclineReschedule}
          body={
            <>
              <Text style={s.rescheduleVendorName}>{booking.vendor_name}</Text>
              <View style={s.rescheduleTimeCard}>
                <Text style={s.rescheduleDateText}>{fmtDate(booking.suggested_scheduled_at)}</Text>
                <Text style={s.rescheduleTimeText}>{fmtTime(booking.suggested_scheduled_at)}</Text>
              </View>
              {actionError && (
                <View style={[s.errorBanner, { marginHorizontal: 0 }]}>
                  <Text style={s.errorText}>{actionError}</Text>
                </View>
              )}
            </>
          }
        />
      )}

      {/* ── Dispute sheet ───────────────────────────── */}
      <BottomSheetModal
        ref={disputeSheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        android_keyboardInputMode="adjustResize"
        backgroundStyle={{ backgroundColor: theme.color.bg }}
        handleIndicatorStyle={{ backgroundColor: theme.color.inkFaint }}
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
              placeholderTextColor={theme.color.inkMuted}
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
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, bold && s.summaryValueBold]}>{value}</Text>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerBackText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },

    statusDescription: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20 },
    escrowNote: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },

    vendorHeaderCard: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      marginHorizontal: 16, marginTop: 16,
      backgroundColor: theme.color.bg,
      borderRadius: BORDER_RADIUS, padding: 12,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
    },
    vendorHeaderAvatarWrap: { width: VENDOR_AVATAR_SIZE, height: VENDOR_AVATAR_SIZE },
    vendorHeaderAvatar: { width: VENDOR_AVATAR_SIZE, height: VENDOR_AVATAR_SIZE, borderRadius: VENDOR_AVATAR_SIZE / 2 },
    vendorHeaderAvatarFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    vendorHeaderAvatarInitial: { fontSize: 22, fontWeight: '700', color: Colors.primary },
    vendorHeaderStatusDot: { position: 'absolute', bottom: 1, right: 1 },
    vendorHeaderPioneerDot: { position: 'absolute', top: 1, right: 1 },
    vendorHeaderInfo: { flex: 1, gap: 6 },
    vendorHeaderName: { fontSize: 16, fontWeight: '700', color: theme.color.ink },
    vendorHeaderNew: { fontSize: 12, fontWeight: '600', color: Colors.badgeNew },
    vendorHeaderRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    vendorHeaderRatingText: { fontSize: 12, fontWeight: '600', color: theme.color.ink, includeFontPadding: false },
    vendorHeaderReviewCount: { fontWeight: '400', color: theme.color.inkMuted },

    lineSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    lineSummaryService: { fontSize: 15, fontWeight: '700', color: theme.color.ink, flex: 1, marginRight: 8 },
    lineSummaryDuration: { fontSize: 14, color: theme.color.inkMuted },
    lineSummaryDateTime: { fontSize: 14, color: theme.color.inkMuted, marginTop: 6 },
    lineSummaryAmount: { fontSize: 18, fontWeight: '800', color: theme.color.accentBlue, marginTop: 8 },

    section: { paddingHorizontal: 16, paddingTop: 20 },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
    },

    card: {
      backgroundColor: theme.color.surface2, borderRadius: 5,
      padding: 16, borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, gap: 2,
    },
    cardDivider: { height: BORDER_WIDTH.thin, backgroundColor: theme.color.inkFaint, marginVertical: 6 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    summaryLabel: { fontSize: 14, color: theme.color.inkMuted },
    summaryValue: { fontSize: 14, fontWeight: '600', color: theme.color.ink, maxWidth: '60%', textAlign: 'right' },
    summaryValueBold: { fontSize: 16, fontWeight: '800', color: theme.color.accentBlue },

    revealCard: {
      marginHorizontal: 16, marginTop: 12,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.color.surface2, borderRadius: 5,
      padding: 12, borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
    },
    revealCardText: { fontSize: 13, fontWeight: '600', color: theme.color.accentBlue },
    revealCardTextPending: { fontSize: 13, color: theme.color.inkMuted },

    phoneCard: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: Colors.success + '15', borderRadius: 5,
      padding: 16, borderWidth: BORDER_WIDTH.thin, borderColor: Colors.success + '40',
    },
    phoneLabel: { fontSize: 15, fontWeight: '700', color: Colors.success, marginBottom: 2 },
    phoneNum: { fontSize: 18, fontWeight: '800', color: theme.color.ink },
    phoneCountdown: {
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: Colors.warning + '15', borderRadius: 5, padding: 12,
    },
    phoneCountdownText: { fontSize: 13, color: Colors.warning, fontWeight: '500' },

    autoReleaseBox: { marginHorizontal: 16, marginTop: 12 },
    autoReleaseText: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },

    errorBanner: { backgroundColor: theme.color.accentRed + '15', marginHorizontal: 16, marginTop: 16, borderRadius: 5, padding: 12 },
    errorText: { fontSize: 13, color: theme.color.accentRed, fontWeight: '500' },
    errorTitle: { fontSize: 18, fontWeight: '700', color: theme.color.ink, marginBottom: 12 },
    backLink: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: theme.color.ink, borderRadius: 5 },
    backLinkText: { color: theme.color.inverseInk, fontSize: 15, fontWeight: '700' },

    // Action buttons
    actionSection: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
    primaryBtn: {
      height: 56, backgroundColor: theme.color.ink,
      borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    },
    primaryBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },
    secondaryBtn: {
      height: 44, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
      borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: '600', color: theme.color.inkMuted },
    cancelBtn: {
      height: 50, borderRadius: 5, alignItems: 'center', justifyContent: 'center',
      borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.accentRed + '60',
    },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: theme.color.accentRed },
    btnDisabled: { opacity: 0.5 },
    servicePhoto: { width: 160, height: 160, borderRadius: 5 },
    reviewDisplay: {
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: 5,
      paddingHorizontal: 16, paddingVertical: 14,
      flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    reviewStars: { fontSize: 20, color: theme.color.accentBlue },
    reviewLabel: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },

    // Modals
    modalSheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: 5, borderTopRightRadius: 5,
      padding: 24, paddingBottom: 40, gap: 12,
    },
    modalTitle: { fontSize: 20, fontWeight: '800', color: theme.color.ink },
    modalBody: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20 },
    modalBold: { fontWeight: '700', color: theme.color.ink },
    disputeInput: {
      backgroundColor: theme.color.surface2, borderRadius: 5,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: theme.color.ink, minHeight: 80,
    },
    categoryRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.surface2,
    },
    categoryRowSelected: { borderColor: theme.color.accentRed, backgroundColor: theme.color.accentRed + '0D' },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: BORDER_WIDTH.thick, borderColor: theme.color.inkFaint },
    radioSelected: { borderColor: theme.color.accentRed, backgroundColor: theme.color.accentRed },
    categoryLabel: { fontSize: 14, color: theme.color.ink, flex: 1 },
    categoryLabelSelected: { fontWeight: '600', color: theme.color.accentRed },

    // Reschedule modal
    rescheduleVendorName: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    rescheduleTimeCard: {
      backgroundColor: theme.color.surface2, borderRadius: 5,
      padding: 20, borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
      alignItems: 'center', width: '100%', marginVertical: 4,
    },
    rescheduleDateText: { fontSize: 15, fontWeight: '600', color: theme.color.inkMuted },
    rescheduleTimeText: { fontSize: 34, fontWeight: '800', color: theme.color.ink, marginTop: 4 },

    // Live tracking map
    liveHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginBottom: 8,
    },
    liveDot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: theme.color.accentGreen,
    },
    liveDotStale: { backgroundColor: theme.color.inkMuted },
    liveLabel: { fontSize: 13, fontWeight: '600', color: theme.color.accentGreen, flex: 1 },
    liveLabelStale: { color: theme.color.inkMuted },
    liveUpdated: { fontSize: 12, color: theme.color.inkMuted },
    liveMap: { width: '100%', height: 260, borderRadius: 5, overflow: 'hidden' },
    liveLoadingOverlay: {
      position: 'absolute', top: 32, left: 0, right: 0,
      alignItems: 'center', gap: 8,
    },
    liveLoadingText: { fontSize: 13, color: theme.color.inkMuted, fontWeight: '500' },
  });
}
