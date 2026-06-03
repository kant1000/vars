// ============================================================
// VARS — Vendor Jobs Dashboard
// Sections:
//   • Zone confirmation modal (daily prompt when auto-accept enabled)
//   • Incoming requests (pending) — accept/decline + 2hr countdown
//   • Auto-accepted bookings in grace period — cancel within 5 min
//   • Active jobs (accepted/on_way/arrived/service_rendered) — flow buttons
//   • Upcoming (future accepted bookings)
//   • Past jobs
// Real-time updates via Supabase Realtime on bookings table.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Linking, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { uploadSinglePortfolioPhoto } from '@/lib/storage';
import { fmtPrice, fmtDuration, fmtDateTime } from '@/lib/format';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { useNetworkState } from '@/lib/useNetworkState';
import { flushQueue } from '@/lib/actionQueue';
import { cacheSet, cacheGet } from '@/lib/cache';
import { OfflineBanner } from '@/components/OfflineBanner';
import { LightningIcon } from '@/components/icons';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const LOCATION_UPDATE_INTERVAL_MS = 5 * 60_000; // every 5 min while online

// ── Types ───────────────────────────────────────────────────

interface VendorBooking {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  transport_fee_kobo: number;
  distance_km: number;
  service_duration_blocks: number;
  scheduled_at: string;
  user_location_address: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  phone_revealed: boolean;
  auto_accepted: boolean;
  auto_accept_grace_expires_at: string | null;
  grace_cancelled: boolean;
}

interface ZoneStatus {
  zone_configured: boolean;
  auto_accept_enabled: boolean;
  confirmed_today: boolean;
  needs_confirmation: boolean;
  zone: { lat: number; lng: number; radius_km: number } | null;
}

// ── Helpers ─────────────────────────────────────────────────
function vendorEarning(priceKobo: number, transportFeeKobo: number, isPioneer: boolean) {
  const total = priceKobo + transportFeeKobo;
  return isPioneer ? total : Math.round(total * 0.8);
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
  return { display: secs <= 0 ? 'Expired' : `${h > 0 ? `${h}h ` : ''}${m}m ${String(s).padStart(2, '0')}s`, expired: secs <= 0 };
}

// ── Grace period card (auto-accepted, 5-min cancel window) ──
function GraceCard({
  booking, onUpdated, isPioneer,
}: {
  booking: VendorBooking;
  onUpdated: () => void;
  isPioneer: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { display, expired } = useCountdown(booking.auto_accept_grace_expires_at);

  // Auto-refresh when grace period expires so the card is removed
  useEffect(() => {
    if (expired) onUpdated();
  }, [expired]);

  const handleGraceCancel = async () => {
    Alert.alert(
      'Cancel this booking?',
      'This will cancel the booking and refund the customer in full. You won\'t be penalised.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            setCancelError(null);
            try {
              const { data: { session: s } } = await supabase.auth.getSession();
              const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/vendor-cancel-grace`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${s?.access_token ?? ''}`,
                },
                body: JSON.stringify({ booking_id: booking.id }),
              });
              if (!res.ok) {
                const d = await res.json();
                setCancelError(d.error ?? "Couldn't cancel — tap to retry");
              } else {
                onUpdated();
              }
            } catch {
              setCancelError("Couldn't reach server — tap to retry");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[c.card, c.graceCard]}>
      <View style={c.cardHeader}>
        <Text style={c.graceBadge}>⚡ Auto-accepted</Text>
        {!expired && (
          <Text style={c.graceCountdown}>{display} to cancel</Text>
        )}
      </View>
      <Text style={c.customerName}>{booking.customer_name}</Text>
      <Text style={c.serviceName}>{booking.service_name}</Text>
      <Text style={c.meta}>{fmtDateTime(booking.scheduled_at)} · {fmtDuration(booking.service_duration_blocks)}</Text>
      {booking.user_location_address && (
        <Text style={c.meta} numberOfLines={1}>📍 {booking.user_location_address}</Text>
      )}
      {booking.distance_km > 0 && (
        <Text style={c.meta}>{Number(booking.distance_km).toFixed(1)}km away</Text>
      )}
      <View style={c.earningsBox}>
        <Text style={c.earningsLabel}>YOUR EARNINGS FOR THIS JOB</Text>
        <Text style={c.earningsAmount}>{fmtPrice(vendorEarning(booking.service_price_kobo, booking.transport_fee_kobo, isPioneer))}</Text>
        {booking.transport_fee_kobo > 0 && (
          <Text style={c.transportNote}>Includes a contribution for the distance to your client</Text>
        )}
      </View>
      {!expired && (
        <TouchableOpacity
          style={[c.graceCancelBtn, cancelling && c.btnDisabled]}
          onPress={handleGraceCancel}
          disabled={cancelling}
        >
          {cancelling
            ? <ScissorsLoader size="small" color="dark" />
            : <Text style={c.graceCancelText}>Cancel (no penalty)</Text>
          }
        </TouchableOpacity>
      )}
      {cancelError && <Text style={c.inlineError}>{cancelError}</Text>}
    </View>
  );
}

// ── Pending booking card ─────────────────────────────────────
function PendingCard({
  booking, onUpdated, isPioneer,
}: {
  booking: VendorBooking;
  onUpdated: () => void;
  isPioneer: boolean;
}) {
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // 1-hour window from booking creation (server enforces this via paystack-capture)
  const expiry = new Date(new Date(booking.created_at).getTime() + 1 * 60 * 60 * 1000).toISOString();
  const { display: countdown } = useCountdown(expiry);

  const handle = async (action: 'accept' | 'decline') => {
    setActing(true);
    setActionError(null);
    const endpoint = action === 'accept' ? 'paystack-capture' : 'paystack-release';
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token ?? ''}` },
        body: JSON.stringify({ booking_id: booking.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        setActionError(d.error ?? "Couldn't save — tap to retry");
      } else {
        onUpdated();
      }
    } catch {
      setActionError("Couldn't reach server — tap to retry");
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
      {booking.distance_km > 0 && (
        <Text style={c.meta}>{Number(booking.distance_km).toFixed(1)}km away</Text>
      )}
      <View style={c.earningsBox}>
        <Text style={c.earningsLabel}>YOUR EARNINGS FOR THIS JOB</Text>
        <Text style={c.earningsAmount}>{fmtPrice(vendorEarning(booking.service_price_kobo, booking.transport_fee_kobo, isPioneer))}</Text>
        {booking.transport_fee_kobo > 0 && (
          <Text style={c.transportNote}>Includes a contribution for the distance to your client</Text>
        )}
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
          {acting ? <ScissorsLoader size="small" color="light" />
            : <Text style={c.acceptBtnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
      {actionError && <Text style={c.inlineError}>{actionError}</Text>}
    </View>
  );
}

// ── Active job card ──────────────────────────────────────────
const FLOW_ACTIONS: Partial<Record<BookingStatus, { label: string; next: BookingStatus; color: string }>> = {
  accepted:  { label: "I'm on my way",    next: BOOKING_STATUS.ON_WAY,           color: Colors.statusOnWay },
  on_way:    { label: "I've arrived",     next: BOOKING_STATUS.ARRIVED,          color: Colors.statusArrived },
  arrived:   { label: 'Service rendered', next: BOOKING_STATUS.SERVICE_RENDERED, color: Colors.primary },
};

function ActiveCard({
  booking, onUpdated,
}: {
  booking: VendorBooking;
  onUpdated: () => void;
}) {
  const [acting, setActing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const action = FLOW_ACTIONS[booking.status];

  // Show "time's up" banner when arrived and past scheduled end
  const scheduledEnd = new Date(
    new Date(booking.scheduled_at).getTime() + booking.service_duration_blocks * 30 * 60 * 1000
  );
  const isPastEnd = booking.status === 'arrived' && new Date() > scheduledEnd;

  const advance = async () => {
    if (!action) return;
    setActing(true);
    setAdvanceError(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/vendor-update-job-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token ?? ''}`,
        },
        body: JSON.stringify({ booking_id: booking.id, new_status: action.next }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAdvanceError(data.error ?? "Couldn't save — tap to retry");
      } else {
        onUpdated();
      }
    } catch {
      setAdvanceError("Couldn't save — tap to retry");
    }
    setActing(false);
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel this booking?',
      'The customer will receive a full refund. Your cancellation count will be tracked.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            setCancelError(null);
            try {
              const { data: { session: s } } = await supabase.auth.getSession();
              const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/vendor-cancel-booking`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${s?.access_token ?? ''}`,
                },
                body: JSON.stringify({ booking_id: booking.id }),
              });
              if (!res.ok) {
                const d = await res.json();
                setCancelError(d.error ?? "Couldn't cancel — tap to retry");
              } else {
                onUpdated();
              }
            } catch {
              setCancelError("Couldn't reach server — tap to retry");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const statusColors: Partial<Record<BookingStatus, string>> = {
    accepted:         Colors.statusAccepted,
    on_way:           Colors.statusOnWay,
    arrived:          Colors.statusArrived,
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
      {isPastEnd && (
        <View style={c.renderReminderBanner}>
          <Text style={c.renderReminderText}>
            💰 Service time has passed — mark it done to release your payment.
          </Text>
        </View>
      )}
      {action && (
        <TouchableOpacity
          style={[c.flowBtn, { backgroundColor: action.color }, acting && c.btnDisabled]}
          onPress={advance}
          disabled={acting}
        >
          {acting ? <ScissorsLoader size="small" color="light" />
            : <Text style={c.flowBtnText}>{action.label}</Text>}
        </TouchableOpacity>
      )}
      {advanceError && <Text style={c.inlineError}>{advanceError}</Text>}
      {booking.status === BOOKING_STATUS.SERVICE_RENDERED && (
        <View style={c.waitingBox}>
          <Text style={c.waitingText}>Waiting for customer to confirm. Payment auto-releases 1 hour after the scheduled end time.</Text>
        </View>
      )}
      {([BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED] as BookingStatus[]).includes(booking.status) && (
        <TouchableOpacity
          style={[c.vendorCancelBtn, cancelling && c.btnDisabled]}
          onPress={handleCancel}
          disabled={cancelling}
        >
          {cancelling
            ? <ScissorsLoader size="small" color="dark" />
            : <Text style={c.vendorCancelText}>Cancel booking</Text>
          }
        </TouchableOpacity>
      )}
      {cancelError && <Text style={c.inlineError}>{cancelError}</Text>}
    </View>
  );
}

// ── Upcoming / past booking row ──────────────────────────────
function BookingRow({
  booking,
  vendorPhotoCount,
  hasPhotoForBooking,
  onPhotoAdded,
  isPioneer,
}: {
  booking: VendorBooking;
  vendorPhotoCount?: number;
  hasPhotoForBooking?: boolean;
  onPhotoAdded?: () => void;
  isPioneer?: boolean;
}) {
  const [addingPhoto, setAddingPhoto] = useState(false);
  const isCompleted = booking.status === 'completed';
  const profileFull = (vendorPhotoCount ?? 0) >= 10;

  const handleAddPhoto = async () => {
    setAddingPhoto(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.access_token) return;
      const user = s.user;

      const upload = await uploadSinglePortfolioPhoto(user.id);
      if (!upload) return;

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/photo-consent-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${s.access_token}`,
          },
          body: JSON.stringify({ booking_id: booking.id, storage_path: upload.path }),
        }
      );

      if (!res.ok) {
        const d = await res.json();
        // Clean up the already-uploaded storage file to avoid orphans
        await supabase.storage.from('portfolio').remove([upload.path]).catch(() => {});
        Alert.alert('Error', d.error ?? 'Could not submit photo.');
        return;
      }

      Alert.alert(
        'Request sent',
        'Your client has been notified. The photo will appear on your profile once they approve.'
      );
      onPhotoAdded?.();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not upload photo.');
    } finally {
      setAddingPhoto(false);
    }
  };

  return (
    <View style={c.row}>
      <View style={{ flex: 1 }}>
        <Text style={c.rowService}>{booking.service_name}</Text>
        <Text style={c.rowMeta}>{fmtDateTime(booking.scheduled_at)}</Text>
        {isCompleted && (
          hasPhotoForBooking ? (
            <Text style={c.photoSent}>📷 Photo request sent</Text>
          ) : profileFull ? (
            <Text style={c.photoFull}>Profile full — delete a photo to add more</Text>
          ) : (
            <TouchableOpacity
              onPress={handleAddPhoto}
              disabled={addingPhoto}
              style={c.addPhotoBtn}
            >
              {addingPhoto
                ? <ScissorsLoader size="small" color="dark" />
                : <Text style={c.addPhotoBtnText}>+ Add a photo from this job</Text>}
            </TouchableOpacity>
          )
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[c.rowEarning, !isCompleted && { color: Colors.textMuted }]}>
          {isCompleted ? fmtPrice(vendorEarning(booking.service_price_kobo, booking.transport_fee_kobo, isPioneer ?? false)) : booking.status.replace(/_/g, ' ')}
        </Text>
      </View>
    </View>
  );
}

// ── Zone confirmation modal ──────────────────────────────────
function ZoneConfirmModal({
  visible, zone, onConfirmed, onDismiss,
}: {
  visible: boolean;
  zone: { lat: number; lng: number; radius_km: number } | null;
  onConfirmed: () => void;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/vendor-confirm-zone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token ?? ''}`,
        },
      });
      if (res.ok) onConfirmed();
      else {
        const d = await res.json();
        Alert.alert('Error', d.error ?? 'Could not confirm zone.');
      }
    } catch {
      Alert.alert('Error', 'Could not reach server.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={zm.overlay}>
        <View style={zm.sheet}>
          <LightningIcon size={24} color={Colors.pioneerGold} />
          <Text style={zm.title}>Confirm your zone?</Text>
          <Text style={zm.body}>
            {zone
              ? `Your auto-accept zone is set to a ${zone.radius_km} km radius around your pin. Confirm to activate auto-accept for today.`
              : 'Confirm your operating zone for today to activate auto-accept.'}
          </Text>
          <TouchableOpacity
            style={[zm.confirmBtn, confirming && zm.btnDisabled]}
            onPress={handleConfirm}
            disabled={confirming}
          >
            {confirming
              ? <ScissorsLoader size="small" color="light" />
              : <Text style={zm.confirmBtnText}>Yes, I'm in my zone</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={zm.changeBtn} onPress={() => { onDismiss(); router.push('/vendor-zone-setup'); }}>
            <Text style={zm.changeBtnText}>Change zone</Text>
          </TouchableOpacity>
          <TouchableOpacity style={zm.dismissBtn} onPress={onDismiss}>
            <Text style={zm.dismissBtnText}>Not today</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Root component ───────────────────────────────────────────
export default function VendorJobsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { isOnline: isConnected } = useNetworkState();

  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isPioneer, setIsPioneer] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<'kyc' | 'no_services' | 'no_notifications' | null>(null);
  const [zoneModal, setZoneModal] = useState<ZoneStatus | null>(null);
  const [vendorPhotoCount, setVendorPhotoCount] = useState(0);
  const [bookingPhotoIds, setBookingPhotoIds] = useState<Set<string>>(new Set());

  // Flush queued offline actions only when transitioning offline → online (not on mount)
  const prevConnectedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected) {
      flushQueue().catch(() => {});
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected]);

  // Seed UI from cache on first mount only — avoids blank screen while fetch runs
  useEffect(() => {
    cacheGet<VendorBooking[]>('vendor_jobs').then((c) => { if (c) setBookings(c); });
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_price_kobo, transport_fee_kobo, distance_km,
        service_duration_blocks, scheduled_at, user_location_address, created_at, phone_revealed,
        auto_accepted, auto_accept_grace_expires_at, grace_cancelled,
        profiles(full_name, phone_number)
      `)
      .order('scheduled_at', { ascending: true })
      .not('status', 'in', '("completed","cancelled","expired","disputed")')
      .limit(50);

    // Also fetch a batch of recent completed/cancelled for history
    const { data: history } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_price_kobo, transport_fee_kobo, distance_km,
        service_duration_blocks, scheduled_at, user_location_address, created_at, phone_revealed,
        auto_accepted, auto_accept_grace_expires_at, grace_cancelled,
        profiles(full_name, phone_number)
      `)
      .in('status', [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED])
      .order('scheduled_at', { ascending: false })
      .limit(20);

    const toBooking = (b: any): VendorBooking => ({
      id: b.id,
      status: b.status,
      service_name: b.service_name,
      service_price_kobo: b.service_price_kobo,
      transport_fee_kobo: b.transport_fee_kobo ?? 0,
      distance_km: b.distance_km ?? 0,
      service_duration_blocks: b.service_duration_blocks,
      scheduled_at: b.scheduled_at,
      user_location_address: b.user_location_address,
      created_at: b.created_at,
      customer_name: b.profiles?.full_name ?? 'Customer',
      customer_phone: b.profiles?.phone_number ?? null,
      phone_revealed: b.phone_revealed,
      auto_accepted: b.auto_accepted ?? false,
      auto_accept_grace_expires_at: b.auto_accept_grace_expires_at ?? null,
      grace_cancelled: b.grace_cancelled ?? false,
    });

    const allBookings = [...(data ?? []).map(toBooking), ...(history ?? []).map(toBooking)];
    setBookings(allBookings);
    cacheSet('vendor_jobs', allBookings, 5 * 60_000).catch(() => {});

    // Portfolio state for "Add photo from this job" feature
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: photos } = await supabase
        .from('portfolio_photos')
        .select('booking_id, consent_state')
        .eq('vendor_id', user.id)
        .neq('consent_state', 'declined');

      const count = (photos ?? []).length;
      const ids = new Set(
        (photos ?? [])
          .filter((p: any) => p.booking_id != null)
          .map((p: any) => p.booking_id as string)
      );
      setVendorPhotoCount(count);
      setBookingPhotoIds(ids);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch vendor online status, zone confirmation check, and go-live prerequisites
  const checkGoLive = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [vendorRes, svcRes, notifPerms] = await Promise.all([
      supabase
        .from('vendors')
        .select('is_online, kyc_status, pioneer, pioneer_bookings_completed, auto_accept_enabled, auto_accept_zone_confirmed_date, auto_accept_zone_lat, auto_accept_zone_lng, auto_accept_zone_radius_km, auto_accept_paused_due_to_drift')
        .eq('id', user.id)
        .single(),
      supabase
        .from('vendor_services')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', user.id)
        .eq('is_active', true),
      Notifications.getPermissionsAsync(),
    ]);

    const data = vendorRes.data;
    if (!data) return;

    setIsOnline(data.is_online);
    setIsPioneer(data.pioneer === true && (data.pioneer_bookings_completed ?? 3) < 3);

    // Derive the single most relevant blocking reason
    if (data.kyc_status !== 'verified') {
      setBlockReason('kyc');
    } else if ((svcRes.count ?? 0) === 0) {
      setBlockReason('no_services');
    } else if (notifPerms.status !== 'granted') {
      setBlockReason('no_notifications');
    } else {
      setBlockReason(null);
    }

    // Show zone confirmation modal if auto-accept is on but not confirmed today
    const today = new Date().toISOString().slice(0, 10);
    const zoneConfigured = data.auto_accept_zone_lat != null;
    const confirmedToday = data.auto_accept_zone_confirmed_date === today;
    if (zoneConfigured && data.auto_accept_enabled && !confirmedToday) {
      setZoneModal({
        zone_configured: true,
        auto_accept_enabled: true,
        confirmed_today: false,
        needs_confirmation: true,
        zone: {
          lat: data.auto_accept_zone_lat,
          lng: data.auto_accept_zone_lng,
          radius_km: data.auto_accept_zone_radius_km,
        },
      });
    }
  };

  useEffect(() => { checkGoLive(); }, []);

  // Re-check notification permission on focus (user may have changed it in Settings)
  useFocusEffect(useCallback(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setBlockReason((prev) => {
        if (prev !== 'no_notifications') return prev;
        return status === 'granted' ? null : 'no_notifications';
      });
    });
  }, []));

  // useFocusEffect handles both initial mount and return-from-navigation refreshes
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('vendor_bookings_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const toggleOnline = async () => {
    // Block going online if prerequisites are not met
    if (!isOnline && blockReason) return;

    setTogglingOnline(true);
    setToggleError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const next = !isOnline;
      setIsOnline(next); // optimistic
      const { error } = await supabase.from('vendors').update({ is_online: next }).eq('id', user.id);
      if (error) {
        setIsOnline(!next); // revert
        setToggleError("Couldn't save — tap to retry");
      }
    }
    setTogglingOnline(false);
  };

  // ── Periodic location updates for zone drift detection ────
  // Fires every 60 s while the vendor is marked online.
  // Stops automatically when vendor goes offline or app backgrounds.
  useEffect(() => {
    if (!isOnline || !session) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const sendLocation = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await fetch(`${SUPABASE_URL}/functions/v1/vendor-update-location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          }),
        });
      } catch {
        // Non-critical — skip this tick silently
      }
    };

    // Send immediately on going online, then every interval
    sendLocation();
    intervalId = setInterval(sendLocation, LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOnline, session]);

  const pending  = bookings.filter((b) => b.status === BOOKING_STATUS.PENDING);
  // Grace bookings: auto-accepted, still within 5-min grace, not yet cancelled
  const graceBookings = bookings.filter((b) =>
    b.status === 'accepted' &&
    b.auto_accepted &&
    !b.grace_cancelled &&
    b.auto_accept_grace_expires_at != null &&
    new Date(b.auto_accept_grace_expires_at) > new Date()
  );
  const ACTIVE_STATUSES  = [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED] as BookingStatus[];
  const HISTORY_STATUSES = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED] as BookingStatus[];
  const active   = bookings.filter((b) =>
    ACTIVE_STATUSES.includes(b.status) &&
    !graceBookings.some((g) => g.id === b.id)
  );
  const upcoming = bookings.filter((b) => b.status === BOOKING_STATUS.ACCEPTED && new Date(b.scheduled_at) > new Date() && !graceBookings.some((g) => g.id === b.id));
  // Remove from active if scheduled far in future (show only today's jobs)
  const todayActive = active.filter((b) => {
    const d = new Date(b.scheduled_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() || b.status !== 'accepted';
  });
  const history  = bookings.filter((b) => HISTORY_STATUSES.includes(b.status));

  // Show spinner only when there's genuinely nothing to display yet (cache not yet seeded)
  if (loading && bookings.length === 0) return <View style={c.centered}><ScissorsLoader size="large" color="dark" /></View>;

  return (
    <View style={[c.container, { paddingTop: insets.top }]}>
      <OfflineBanner visible={!isConnected} />

      {/* Zone confirmation modal */}
      {zoneModal && (
        <ZoneConfirmModal
          visible={!!zoneModal}
          zone={zoneModal.zone}
          onConfirmed={() => setZoneModal(null)}
          onDismiss={() => setZoneModal(null)}
        />
      )}

      {/* Header */}
      <View style={c.header}>
        <Text style={c.headerTitle}>My Jobs</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <TouchableOpacity
            style={[c.onlineToggle, (togglingOnline || (!isOnline && !!blockReason)) && c.btnDisabled]}
            onPress={toggleOnline}
            disabled={togglingOnline}
          >
            {togglingOnline ? (
              <ScissorsLoader size="small" color="dark" />
            ) : isOnline ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentGreen }} />
                <Text style={c.onlineToggleText}>Online</Text>
              </View>
            ) : (
              <Text style={c.onlineToggleText}>Go online</Text>
            )}
          </TouchableOpacity>
          {toggleError && <Text style={c.inlineError}>{toggleError}</Text>}
        </View>
      </View>

      {/* Go-live prerequisite banner — shows the single most relevant blocker */}
      {!isOnline && blockReason && (
        <View style={c.blockBanner}>
          <Text style={c.blockBannerText}>
            {blockReason === 'kyc' && 'Complete your identity check to go live.'}
            {blockReason === 'no_services' && 'Add at least one service to your profile to go live.'}
            {blockReason === 'no_notifications' && 'Turn on notifications to receive booking requests.'}
          </Text>
          {blockReason === 'no_notifications' && (
            <TouchableOpacity onPress={() => Linking.openSettings()}>
              <Text style={c.blockBannerLink}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="transparent" colors={['transparent']} />
        }
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color="dark" />
          </View>
        )}
        {/* Auto-accepted — grace period */}
        {graceBookings.length > 0 && (
          <Section title={`Auto-accepted (${graceBookings.length})`} urgent>
            {graceBookings.map((b) => (
              <GraceCard
                key={b.id}
                booking={b}
                isPioneer={isPioneer}
                onUpdated={load}
              />
            ))}
          </Section>
        )}

        {/* Incoming requests */}
        {pending.length > 0 && (
          <Section title={`Incoming requests (${pending.length})`} urgent>
            {pending.map((b) => (
              <PendingCard
                key={b.id}
                booking={b}
                isPioneer={isPioneer}
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
              .map((b) => <BookingRow key={b.id} booking={b} isPioneer={isPioneer} />)}
          </Section>
        )}

        {/* History */}
        {history.length > 0 && (
          <Section title="Recent history">
            {history.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                vendorPhotoCount={vendorPhotoCount}
                hasPhotoForBooking={bookingPhotoIds.has(b.id)}
                onPhotoAdded={load}
                isPioneer={isPioneer}
              />
            ))}
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
    borderWidth: 1.5, borderColor: Colors.ink, backgroundColor: 'transparent',
  },
  onlineOn:  {},
  onlineOff: {},
  onlineToggleText: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  onlineToggleTextOn: {},

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
  earningsBox: {
    marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  earningsLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2,
  },
  earningsAmount: { fontSize: 22, fontWeight: '800', color: Colors.text },
  transportNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 16 },
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
  inlineError: { fontSize: 12, color: Colors.error, marginTop: 6, textAlign: 'center' },

  // Service-rendered reminder banner
  renderReminderBanner: {
    backgroundColor: Colors.offlineText,
    borderRadius: 10, padding: 10, marginTop: 4,
    borderWidth: 1, borderColor: Colors.amberBorder,
  },
  renderReminderText: { fontSize: 13, color: Colors.offlineBg, fontWeight: '600', lineHeight: 18 },

  // Vendor cancel button on active cards
  vendorCancelBtn: {
    marginTop: 4, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  vendorCancelText: { fontSize: 13, fontWeight: '600', color: Colors.error },

  // Grace period card
  graceCard: { borderColor: Colors.ink, borderWidth: 1.5 },
  graceBadge: { fontSize: 12, fontWeight: '700', color: Colors.ink, flex: 1 },
  graceCountdown: { fontSize: 12, fontWeight: '700', color: Colors.accentRed, fontVariant: ['tabular-nums'] },
  graceCancelBtn: {
    marginTop: 8, height: 42, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  graceCancelText: { fontSize: 14, fontWeight: '700', color: Colors.error },

  // Rows
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowService: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowEarning: { fontSize: 14, fontWeight: '700', color: Colors.success },
  addPhotoBtn: { marginTop: 6, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  addPhotoBtnText: { fontSize: 12, color: Colors.ink, fontWeight: '600' },
  photoSent: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  photoFull: { fontSize: 12, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },

  blockBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primaryLight, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8,
  },
  blockBannerText: { flex: 1, fontSize: 13, color: Colors.primary, fontWeight: '500', lineHeight: 18 },
  blockBannerLink: { fontSize: 13, fontWeight: '700', color: Colors.primary, textDecorationLine: 'underline' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});

// Zone modal styles
const zm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, width: '100%', alignItems: 'center', gap: 8,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  body:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  confirmBtn: {
    width: '100%', height: 54, backgroundColor: Colors.pioneerGold,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  changeBtn: {
    width: '100%', height: 48,
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  changeBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  dismissBtn: { paddingVertical: 12 },
  dismissBtnText: { fontSize: 14, color: Colors.textMuted },
});
