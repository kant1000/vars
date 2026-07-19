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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, LayoutChangeEvent, Linking, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { ConfirmModal } from '@/components/ConfirmModal';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { uploadSinglePortfolioPhoto } from '@/lib/storage';
import { fmtPrice, fmtDuration, fmtDateTime } from '@/lib/format';
import { fetchWithRetry } from '@/lib/fetchWithRetry';
import { useNetworkState } from '@/lib/useNetworkState';
import { flushQueue } from '@/lib/actionQueue';
import { cacheSet, cacheGet } from '@/lib/cache';
import { OfflineBanner } from '@/components/OfflineBanner';
import { LightningIcon, CheckCircleIcon, XCircleIcon, CarIcon, CreditCardIcon } from '@/components/icons';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';
import { useVendorOnline } from '@/contexts/VendorOnlineContext';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

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
  gate_fired: boolean;
  auto_accept_grace_expires_at: string | null;
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

function useCountdown(expiresAt: string) {
  const getSecondsLeft = () => Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft);

  useEffect(() => {
    const tick = () => setSecondsLeft(getSecondsLeft());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return { display: `${minutes}:${String(seconds).padStart(2, '0')}` };
}

// ── Pending booking card ─────────────────────────────────────
function PendingCard({
  booking, onUpdated, isPioneer, c,
}: {
  booking: VendorBooking;
  onUpdated: () => void;
  isPioneer: boolean;
  c: ReturnType<typeof makeStylesC>;
}) {
  const { theme } = useVarsTheme();
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
        setActionError(d.error ?? "Couldn't save, tap to retry");
      } else {
        onUpdated();
      }
    } catch {
      setActionError("Couldn't reach server, tap to retry");
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
          {acting ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
            : <Text style={c.acceptBtnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
      {actionError && <Text style={c.inlineError}>{actionError}</Text>}
    </View>
  );
}

// ── Active job card ──────────────────────────────────────────
// "On My Way" calls paystack-gate (gate fires + charge). Other transitions
// call vendor-update-job-status as before.
const FLOW_ACTIONS: Partial<Record<BookingStatus, { label: string; next: BookingStatus; color: string }>> = {
  on_way:    { label: "I've arrived",     next: BOOKING_STATUS.ARRIVED,          color: Colors.statusArrived },
  arrived:   { label: 'Service rendered', next: BOOKING_STATUS.SERVICE_RENDERED, color: Colors.primary },
};

function ActiveCard({
  booking, onUpdated, c, theme,
}: {
  booking: VendorBooking;
  onUpdated: () => void;
  c: ReturnType<typeof makeStylesC>;
  theme: VarsTheme;
}) {
  const [acting, setActing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [gateStage, setGateStage] = useState<'confirm' | 'charging' | 'success' | 'awaiting_payment' | 'error' | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const action = FLOW_ACTIONS[booking.status];

  // "On My Way" gate window: opens GATE_WINDOW_MINUTES (120) before scheduled_at
  const gateWindowOpen = new Date(new Date(booking.scheduled_at).getTime() - 120 * 60 * 1000);
  const isInGateWindow = booking.status === BOOKING_STATUS.ACCEPTED && new Date() >= gateWindowOpen;

  // Show "time's up" banner when arrived and past scheduled end
  const scheduledEnd = new Date(
    new Date(booking.scheduled_at).getTime() + booking.service_duration_blocks * 30 * 60 * 1000
  );
  const isPastEnd = booking.status === 'arrived' && new Date() > scheduledEnd;

  // Grace period — penalty-free cancel window for auto-accepted bookings
  const graceExpiry = booking.auto_accept_grace_expires_at ?? new Date(0).toISOString();
  const { display: graceCountdown } = useCountdown(graceExpiry);
  const isInGracePeriod =
    booking.auto_accepted &&
    booking.auto_accept_grace_expires_at != null &&
    new Date() < new Date(booking.auto_accept_grace_expires_at);

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
        setAdvanceError(data.error ?? "Couldn't save, tap to retry");
      } else {
        onUpdated();
      }
    } catch {
      setAdvanceError("Couldn't save, tap to retry");
    }
    setActing(false);
  };

  const handleCancel = () => setShowCancelModal(true);

  const confirmCancel = async () => {
    setShowCancelModal(false);
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
        setCancelError(d.error ?? "Couldn't cancel, tap to retry");
      } else {
        onUpdated();
      }
    } catch {
      setCancelError("Couldn't reach server, tap to retry");
    } finally {
      setCancelling(false);
    }
  };

  const handleGate = async () => {
    setGateStage('charging');
    setGateError(null);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/paystack-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token ?? ''}` },
        body: JSON.stringify({ booking_id: booking.id, trigger_type: 'manual' }),
      });
      if (!res.ok) {
        const d = await res.json();
        setGateError(d.error ?? "Couldn't process payment, please try again.");
        setGateStage('error');
        return;
      }
      const d = await res.json();
      if (d.gate_already_fired) {
        setGateStage(null);
        onUpdated();
        return;
      }
      if (d.checkout_required) {
        setGateStage('awaiting_payment');
        return;
      }
      setGateStage('success');
      setTimeout(() => {
        setGateStage(null);
        onUpdated();
      }, 1500);
    } catch {
      setGateError("Couldn't reach the server, please try again.");
      setGateStage('error');
    }
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
            💰 Service time has passed. Mark it done to release your payment.
          </Text>
        </View>
      )}
      {/* Gate fired but customer hasn't completed checkout yet */}
      {booking.status === BOOKING_STATUS.ACCEPTED && booking.gate_fired && (
        <View style={c.gateConfirmingBanner}>
          <Text style={c.gateConfirmingTitle}>Confirming payment</Text>
          <Text style={c.gateConfirmingBody}>
            Your client is completing their payment. You'll get a notification as soon as it's confirmed, then you're good to go.
          </Text>
        </View>
      )}
      {/* "On My Way" fires the gate — only visible within the 2-hour window */}
      {booking.status === BOOKING_STATUS.ACCEPTED && !booking.gate_fired && (
        isInGateWindow ? (
          <TouchableOpacity
            style={[c.flowBtn, { backgroundColor: Colors.statusOnWay }]}
            onPress={() => setGateStage('confirm')}
          >
            <Text style={c.flowBtnText}>I'm on my way</Text>
          </TouchableOpacity>
        ) : (
          <View style={c.gateWindowBanner}>
            <Text style={c.gateWindowText}>
              "On My Way" opens 2 hours before your appointment.
            </Text>
          </View>
        )
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
      {isInGracePeriod && booking.status === BOOKING_STATUS.ACCEPTED && (
        <View style={c.graceBanner}>
          <Text style={c.graceText}>Auto-accepted, cancel penalty-free in</Text>
          <Text style={c.graceCountdown}>{graceCountdown}</Text>
        </View>
      )}
      {([BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED] as BookingStatus[]).includes(booking.status) && (
        <TouchableOpacity
          style={[c.vendorCancelBtn, cancelling && c.btnDisabled]}
          onPress={handleCancel}
          disabled={cancelling}
        >
          {cancelling
            ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
            : <Text style={[c.vendorCancelText, isInGracePeriod && c.vendorCancelTextGrace]}>
                {isInGracePeriod ? 'Cancel penalty-free' : 'Cancel booking'}
              </Text>
          }
        </TouchableOpacity>
      )}
      {cancelError && <Text style={c.inlineError}>{cancelError}</Text>}
      <GateModal
        stage={gateStage}
        customerName={booking.customer_name}
        error={gateError}
        onConfirm={handleGate}
        onDismiss={() => setGateStage(null)}
        onClose={() => { setGateStage(null); onUpdated(); }}
        theme={theme}
      />
      <ConfirmModal
        visible={showCancelModal}
        title={isInGracePeriod ? 'Cancel penalty-free?' : 'Cancel this booking?'}
        body={
          isInGracePeriod
            ? 'This booking was auto-accepted. Cancelling now is penalty-free: the customer gets a full refund with no impact on your record.'
            : 'The customer will receive a full refund. Your cancellation count will be tracked.'
        }
        confirmLabel="Cancel booking"
        dismissLabel="Keep booking"
        destructive
        onConfirm={confirmCancel}
        onDismiss={() => setShowCancelModal(false)}
      />
    </View>
  );
}

// ── Gate payment modal ────────────────────────────────────────
type GateStage = 'confirm' | 'charging' | 'success' | 'awaiting_payment' | 'error' | null;

function GateModal({
  stage, customerName, error, onConfirm, onDismiss, onClose, theme,
}: {
  stage: GateStage;
  customerName: string;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  onClose: () => void;
  theme: VarsTheme;
}) {
  const gm = useMemo(() => makeStylesGm(theme), [theme]);
  if (!stage) return null;
  const firstName = customerName.split(' ')[0];
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={stage === 'confirm' ? onDismiss : () => {}}
    >
      <View style={gm.overlay}>
        <View style={gm.sheet}>
          {stage === 'confirm' && (
            <>
              <CarIcon size={28} color={Colors.statusOnWay} />
              <Text style={gm.title}>Heading out?</Text>
              <Text style={gm.body}>
                {'Once you tap below, '}
                {firstName}
                {' gets charged and your departure is logged.\n\nTrust is the currency on VARS.'}
              </Text>
              <TouchableOpacity style={gm.primaryBtn} onPress={onConfirm}>
                <Text style={gm.primaryBtnText}>I'm on my way →</Text>
              </TouchableOpacity>
              <TouchableOpacity style={gm.ghostBtn} onPress={onDismiss}>
                <Text style={gm.ghostBtnText}>Not yet</Text>
              </TouchableOpacity>
            </>
          )}
          {stage === 'charging' && (
            <>
              <ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
              <Text style={gm.chargingTitle}>Securing payment...</Text>
              <Text style={gm.subText}>Hang tight, this takes a second.</Text>
            </>
          )}
          {stage === 'success' && (
            <>
              <CheckCircleIcon size={36} color={theme.color.accentGreen} />
              <Text style={gm.successTitle}>Payment confirmed</Text>
              <Text style={gm.successBody}>{'You\'re on your way. '}{firstName} has been notified.</Text>
            </>
          )}
          {stage === 'awaiting_payment' && (
            <>
              <CreditCardIcon size={32} color={Colors.statusOnWay} />
              <Text style={gm.title}>Payment request sent</Text>
              <Text style={gm.body}>
                {firstName}{' is completing their payment. Head out, you\'ll be notified the moment it confirms.'}
              </Text>
              <TouchableOpacity style={gm.primaryBtn} onPress={onClose}>
                <Text style={gm.primaryBtnText}>Got it</Text>
              </TouchableOpacity>
            </>
          )}
          {stage === 'error' && (
            <>
              <XCircleIcon size={32} color={theme.color.accentRed} />
              <Text style={gm.errorTitle}>Something went wrong</Text>
              <Text style={gm.errorBody}>{error}</Text>
              <TouchableOpacity style={gm.primaryBtn} onPress={onConfirm}>
                <Text style={gm.primaryBtnText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={gm.ghostBtn} onPress={onClose}>
                <Text style={gm.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Upcoming / past booking row ──────────────────────────────
function BookingRow({
  booking,
  vendorPhotoCount,
  photoConsentState,
  onPhotoAdded,
  isPioneer,
  c,
}: {
  booking: VendorBooking;
  vendorPhotoCount?: number;
  photoConsentState?: 'pending' | 'approved' | null;
  onPhotoAdded?: () => void;
  isPioneer?: boolean;
  c: ReturnType<typeof makeStylesC>;
}) {
  const { theme } = useVarsTheme();
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [showRequestSentModal, setShowRequestSentModal] = useState(false);
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

      setShowRequestSentModal(true);
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
          photoConsentState === 'approved' ? (
            <Text style={c.photoApproved}>✓ Photo in your portfolio</Text>
          ) : photoConsentState === 'pending' ? (
            <Text style={c.photoSent}>📷 Photo request sent</Text>
          ) : profileFull ? (
            <Text style={c.photoFull}>Profile full, delete a photo to add more</Text>
          ) : (
            <TouchableOpacity
              onPress={handleAddPhoto}
              disabled={addingPhoto}
              style={c.addPhotoBtn}
            >
              {addingPhoto
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
                : <Text style={c.addPhotoBtnText}>+ Add a photo from this job</Text>}
            </TouchableOpacity>
          )
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {isCompleted ? (
          <Text style={c.rowEarning}>
            {fmtPrice(vendorEarning(booking.service_price_kobo, booking.transport_fee_kobo, isPioneer ?? false))}
          </Text>
        ) : booking.status === BOOKING_STATUS.CANCELLED ? (
          <>
            <Text style={c.rowEarningCancelled}>
              {fmtPrice(vendorEarning(booking.service_price_kobo, booking.transport_fee_kobo, isPioneer ?? false))}
            </Text>
            <Text style={c.rowStatusLabel}>Cancelled</Text>
          </>
        ) : (
          <Text style={c.rowStatusLabel}>{booking.status.replace(/_/g, ' ')}</Text>
        )}
      </View>
      <ConfirmModal
        visible={showRequestSentModal}
        title="Request sent"
        body="Your client has been notified. The photo will appear on your profile once they approve."
        confirmLabel="Got it"
        dismissLabel={null}
        onConfirm={() => setShowRequestSentModal(false)}
        onDismiss={() => setShowRequestSentModal(false)}
      />
    </View>
  );
}

// ── Zone confirmation modal ──────────────────────────────────
function ZoneConfirmModal({
  visible, zone, onConfirmed, onDismiss, theme,
}: {
  visible: boolean;
  zone: { lat: number; lng: number; radius_km: number } | null;
  onConfirmed: () => void;
  onDismiss: () => void;
  theme: VarsTheme;
}) {
  const zm = useMemo(() => makeStylesZm(theme), [theme]);
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
  const { theme } = useVarsTheme();
  const c = useMemo(() => makeStylesC(theme), [theme]);
  const { isOnline: isConnected } = useNetworkState();

  const scrollViewRef = useRef<ScrollView>(null);
  const historyHeightRef = useRef(0);
  const [scrollKey, setScrollKey] = useState(0);

  const [bookings, setBookings] = useState<VendorBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { isOnline, togglingOnline, toggleError, blockReason, toggleOnline, refreshOnlineStatus } = useVendorOnline();
  const [isPioneer, setIsPioneer] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [restrictionAmountKobo, setRestrictionAmountKobo] = useState(0);
  const [repaymentClaiming, setRepaymentClaiming] = useState(false);
  const [repaymentClaimed, setRepaymentClaimed] = useState(false);
  const [zoneModal, setZoneModal] = useState<ZoneStatus | null>(null);
  const [vendorPhotoCount, setVendorPhotoCount] = useState(0);
  const [bookingPhotoStates, setBookingPhotoStates] = useState<Map<string, 'pending' | 'approved'>>(new Map());

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
        auto_accepted, gate_fired, auto_accept_grace_expires_at,
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
        auto_accepted, gate_fired, auto_accept_grace_expires_at,
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
      gate_fired: b.gate_fired ?? false,
      auto_accept_grace_expires_at: b.auto_accept_grace_expires_at ?? null,
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
      const stateMap = new Map(
        (photos ?? [])
          .filter((p: any) => p.booking_id != null)
          .map((p: any) => [p.booking_id as string, p.consent_state as 'pending' | 'approved'])
      );
      setVendorPhotoCount(count);
      setBookingPhotoStates(stateMap);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  // Fetch vendor-display-only data: pioneer badge, restriction, zone modal
  const checkGoLive = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('vendors')
      .select('pioneer, pioneer_bookings_completed, auto_accept_enabled, auto_accept_zone_confirmed_date, auto_accept_zone_lat, auto_accept_zone_lng, auto_accept_zone_radius_km, is_restricted, restriction_amount_owed_kobo, restriction_repayment_claimed_at')
      .eq('id', user.id)
      .single();

    if (!data) return;

    setIsPioneer(data.pioneer === true && (data.pioneer_bookings_completed ?? 3) < 3);
    setIsRestricted(data.is_restricted === true);
    setRestrictionAmountKobo(data.restriction_amount_owed_kobo ?? 0);
    setRepaymentClaimed(data.restriction_repayment_claimed_at != null);

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

  // Re-run online prerequisite check on focus (context handles interval + auto-offline)
  useFocusEffect(useCallback(() => { refreshOnlineStatus(); }, [refreshOnlineStatus]));

  // useFocusEffect handles both initial mount and return-from-navigation refreshes
  useFocusEffect(useCallback(() => {
    load();
    setScrollKey((k) => k + 1);
  }, [load]));

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('vendor_bookings_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Scroll anchor: on each tab focus + data load, position so the last 2 history
  // items are visible with active jobs just below — same pattern as schedule screen.
  const historyCount = bookings.filter((b) =>
    ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED] as string[]).includes(b.status)
  ).length;
  useEffect(() => {
    if (loading || historyCount === 0) return;
    const timer = setTimeout(() => {
      const h = historyHeightRef.current;
      if (h === 0) return;
      // Each row ≈ 80px; subtract 2 rows so the last 2 history items sit above the fold
      scrollViewRef.current?.scrollTo({ y: Math.max(0, h - 160), animated: false });
    }, 80);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey, loading, historyCount]);

  const pending  = bookings.filter((b) => b.status === BOOKING_STATUS.PENDING);
  const ACTIVE_STATUSES  = [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED] as BookingStatus[];
  const HISTORY_STATUSES = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED] as BookingStatus[];
  const active   = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status));
  const upcoming = bookings.filter((b) => b.status === BOOKING_STATUS.ACCEPTED && new Date(b.scheduled_at) > new Date());
  // Show only today's accepted jobs in the active section; future ones go to Upcoming
  const todayActive = active.filter((b) => {
    const d = new Date(b.scheduled_at);
    const now = new Date();
    return d.toDateString() === now.toDateString() || b.status !== 'accepted';
  });
  const history  = bookings.filter((b) => HISTORY_STATUSES.includes(b.status));

  // Show spinner only when there's genuinely nothing to display yet (cache not yet seeded)
  if (loading && bookings.length === 0) return <View style={c.centered}><ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>;

  // Restriction blocking wall — full-screen, no navigation out until admin lifts restriction
  if (isRestricted) {
    return (
      <View style={[c.container, c.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Text style={c.restrictTitle}>Account restricted</Text>
        <Text style={c.restrictBody}>
          You cancelled a booking after travel began and the customer was refunded.{'\n\n'}
          To restore your account, transfer{' '}
          <Text style={{ fontWeight: '800' }}>₦{Math.round(restrictionAmountKobo / 100).toLocaleString()}</Text>
          {' '}to VARS:{'\n\n'}
          Bank: Wema Bank{'\n'}
          Account: 0123456789{'\n'}
          Name: VARS Technology Limited{'\n\n'}
          Include your registered phone number as reference.
        </Text>
        {!repaymentClaimed ? (
          <TouchableOpacity
            style={[c.restrictClaimBtn, repaymentClaiming && c.btnDisabled]}
            disabled={repaymentClaiming}
            onPress={async () => {
              setRepaymentClaiming(true);
              try {
                const { data: { session: s } } = await supabase.auth.getSession();
                const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-claim-repayment`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.access_token ?? ''}` },
                });
                if (res.ok) setRepaymentClaimed(true);
                else Alert.alert('Error', "Couldn't reach server, try again.");
              } catch {
                Alert.alert('Error', "Couldn't reach server, try again.");
              } finally {
                setRepaymentClaiming(false);
              }
            }}
          >
            {repaymentClaiming
              ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
              : <Text style={c.restrictClaimBtnText}>I've paid</Text>}
          </TouchableOpacity>
        ) : (
          <View style={c.restrictClaimedBox}>
            <Text style={c.restrictClaimedText}>
              Received. Our team will verify your payment and restore your account shortly.
            </Text>
          </View>
        )}
      </View>
    );
  }

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
          theme={theme}
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
            {/* Invisible anchor — always in normal flow, locks button to "Go online" width */}
            <Text style={[c.onlineToggleText, { opacity: 0 }]}>Go online</Text>
            {/* Actual content centred absolutely so it never affects layout */}
            <View style={c.onlineToggleOverlay}>
              {togglingOnline ? (
                <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
              ) : isOnline ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.accentGreen }} />
                  <Text style={c.onlineToggleText}>Online</Text>
                </View>
              ) : (
                <Text style={c.onlineToggleText}>Go online</Text>
              )}
            </View>
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
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="transparent" colors={['transparent']} />
        }
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
          </View>
        )}

        {/* History — rendered oldest→newest so the two most recent sit just above live jobs.
            onLayout captures the section height so the scroll anchor knows where to jump. */}
        {history.length > 0 && (
          <View onLayout={(e: LayoutChangeEvent) => { historyHeightRef.current = e.nativeEvent.layout.height; }}>
            <Section title="Recent history" c={c}>
              {[...history].reverse().map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  vendorPhotoCount={vendorPhotoCount}
                  photoConsentState={bookingPhotoStates.get(b.id) ?? null}
                  onPhotoAdded={load}
                  isPioneer={isPioneer}
                  c={c}
                />
              ))}
            </Section>
          </View>
        )}

        {/* Incoming requests */}
        {pending.length > 0 && (
          <Section title={`Incoming requests (${pending.length})`} urgent c={c}>
            {pending.map((b) => (
              <PendingCard
                key={b.id}
                booking={b}
                isPioneer={isPioneer}
                onUpdated={load}
                c={c}
              />
            ))}
          </Section>
        )}

        {/* Active jobs */}
        {todayActive.length > 0 && (
          <Section title="Active today" c={c}>
            {todayActive.map((b) => (
              <ActiveCard key={b.id} booking={b} onUpdated={load} c={c} theme={theme} />
            ))}
          </Section>
        )}

        {/* Upcoming */}
        {upcoming.filter((b) => {
          const d = new Date(b.scheduled_at);
          return d.toDateString() !== new Date().toDateString();
        }).length > 0 && (
          <Section title="Upcoming" c={c}>
            {upcoming
              .filter((b) => new Date(b.scheduled_at).toDateString() !== new Date().toDateString())
              .map((b) => <BookingRow key={b.id} booking={b} isPioneer={isPioneer} c={c} />)}
          </Section>
        )}

        {pending.length === 0 && todayActive.length === 0 && (
          <View style={c.empty}>
            <Text style={c.emptyTitle}>{isOnline ? 'No jobs yet' : 'You\'re offline'}</Text>
            <Text style={c.emptyBody}>
              {isOnline
                ? 'Sit tight, booking requests will appear here.'
                : 'Go online to start receiving booking requests.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children, urgent, c }: { title: string; children: React.ReactNode; urgent?: boolean; c: ReturnType<typeof makeStylesC> }) {
  return (
    <View style={c.section}>
      <Text style={[c.sectionTitle, urgent && c.sectionTitleUrgent]}>{title}</Text>
      {children}
    </View>
  );
}

function makeStylesC(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink },
    onlineToggle: {
      height: 34, paddingHorizontal: 14, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.ink, backgroundColor: 'transparent',
      alignItems: 'center', justifyContent: 'center',
    },
    onlineToggleOverlay: {
      position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
      alignItems: 'center', justifyContent: 'center',
    },
    onlineOn:  {},
    onlineOff: {},
    onlineToggleText: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    onlineToggleTextOn: {},

    section: { paddingTop: 20, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: theme.color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    sectionTitleUrgent: { color: Colors.statusPending },

    // Cards
    card: {
      backgroundColor: theme.color.surface2, borderRadius: 5,
      padding: 16, borderWidth: 1, borderColor: theme.color.inkFaint, marginBottom: 10, gap: 6,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    customerName: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.color.ink },
    countdown: { fontSize: 12, fontWeight: '700', color: Colors.statusPending, fontVariant: ['tabular-nums'] },
    statusPill: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
    serviceName: { fontSize: 16, fontWeight: '600', color: theme.color.ink },
    meta: { fontSize: 13, color: theme.color.inkMuted },
    earningsBox: {
      marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.color.inkFaint,
    },
    earningsLabel: {
      fontSize: 10, fontWeight: '700', color: theme.color.inkMuted,
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2,
    },
    earningsAmount: { fontSize: 22, fontWeight: '800', color: theme.color.ink },
    transportNote: { fontSize: 12, color: theme.color.inkMuted, marginTop: 3, lineHeight: 16 },
    phoneReveal: { fontSize: 14, fontWeight: '600', color: theme.color.accentGreen },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
    declineBtn: {
      flex: 1, height: 44, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      alignItems: 'center', justifyContent: 'center',
    },
    declineBtnText: { fontSize: 14, fontWeight: '700', color: theme.color.inkMuted },
    acceptBtn: {
      flex: 2, height: 44, borderRadius: 5,
      backgroundColor: theme.color.accentBlue,
      alignItems: 'center', justifyContent: 'center',
    },
    acceptBtnText: { fontSize: 14, fontWeight: '700', color: theme.color.inverseInk },

    flowBtn: {
      height: 48, borderRadius: 5, marginTop: 8,
      alignItems: 'center', justifyContent: 'center',
    },
    // flowBtn's background is a per-status semantic color set inline (never theme-reactive) -
    // white text stays fixed to match.
    flowBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
    // waitingBox/gateWindowBanner keep the static primary/primaryLight tint pair -
    // no dark-mode-safe "tinted surface" token exists yet.
    waitingBox: {
      backgroundColor: Colors.primaryLight, borderRadius: 5, padding: 10, marginTop: 4,
    },
    waitingText: { fontSize: 12, color: Colors.primary, lineHeight: 17 },

    btnDisabled: { opacity: 0.5 },
    inlineError: { fontSize: 12, color: theme.color.accentRed, marginTop: 6, textAlign: 'center' },

    // Service-rendered reminder banner — fixed amber-warning treatment, same as OfflineBanner.
    renderReminderBanner: {
      backgroundColor: Colors.offlineText,
      borderRadius: 5, padding: 10, marginTop: 4,
      borderWidth: 1, borderColor: Colors.amberBorder,
    },
    renderReminderText: { fontSize: 13, color: Colors.offlineBg, fontWeight: '600', lineHeight: 18 },

    // Vendor cancel button on active cards
    vendorCancelBtn: {
      marginTop: 4, height: 38, borderRadius: 5,
      alignItems: 'center', justifyContent: 'center',
    },
    vendorCancelText: { fontSize: 13, fontWeight: '600', color: theme.color.accentRed },
    vendorCancelTextGrace: { color: theme.color.ink },

    // Auto-accept grace period banner — fixed amber-warning treatment.
    graceBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: Colors.offlineText, borderRadius: BORDER_RADIUS,
      borderWidth: 1, borderColor: Colors.amberBorder,
      paddingHorizontal: 12, paddingVertical: 8, marginTop: 8,
    },
    graceText: { fontSize: 12, fontWeight: '600', color: Colors.offlineBg, flex: 1 },
    graceCountdown: { fontSize: 13, fontWeight: '800', color: Colors.offlineBg, fontVariant: ['tabular-nums'] },

    // Gate fired — customer is completing checkout
    gateConfirmingBanner: {
      backgroundColor: Colors.warning + '15', borderRadius: BORDER_RADIUS,
      borderWidth: 1, borderColor: Colors.warning + '40',
      padding: 12, marginTop: 8, gap: 4,
    },
    gateConfirmingTitle: { fontSize: 13, fontWeight: '700', color: Colors.warning },
    gateConfirmingBody: { fontSize: 12, color: theme.color.inkMuted, lineHeight: 17 },

    // Gate window banner (shown when booking is accepted but gate window not yet open)
    gateWindowBanner: {
      backgroundColor: Colors.primaryLight, borderRadius: BORDER_RADIUS,
      padding: 10, marginTop: 8,
    },
    gateWindowText: { fontSize: 12, color: Colors.primary, lineHeight: 17 },

    // Restriction wall
    restrictTitle: { fontSize: 22, fontWeight: '800', color: theme.color.accentRed, marginBottom: 16, textAlign: 'center' },
    restrictBody: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
    restrictClaimBtn: {
      width: '100%', height: 52, backgroundColor: theme.color.accentBlue,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
    },
    restrictClaimBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '800' },
    restrictClaimedBox: {
      backgroundColor: Colors.primaryLight, borderRadius: BORDER_RADIUS,
      padding: 16, marginTop: 8,
    },
    restrictClaimedText: { fontSize: 14, color: Colors.primary, textAlign: 'center', lineHeight: 20 },

    // Rows
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    rowService: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    rowMeta: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    rowEarning: { fontSize: 14, fontWeight: '700', color: theme.color.accentGreen },
    rowEarningCancelled: { fontSize: 14, fontWeight: '700', color: theme.color.accentRed },
    rowStatusLabel: { fontSize: 11, fontWeight: '500', color: theme.color.inkMuted, marginTop: 2, textTransform: 'capitalize' },
    addPhotoBtn: { marginTop: 6, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
    addPhotoBtnText: { fontSize: 12, color: theme.color.ink, fontWeight: '600' },
    photoSent:     { fontSize: 12, color: theme.color.inkMuted, marginTop: 4 },
    photoApproved: { fontSize: 12, color: theme.color.accentGreen, marginTop: 4, fontWeight: '600' },
    photoFull:     { fontSize: 12, color: theme.color.inkMuted, marginTop: 4, fontStyle: 'italic' },

    blockBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: Colors.primaryLight, paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint, gap: 8,
    },
    blockBannerText: { flex: 1, fontSize: 13, color: Colors.primary, fontWeight: '500', lineHeight: 18 },
    blockBannerLink: { fontSize: 13, fontWeight: '700', color: Colors.primary, textDecorationLine: 'underline' },

    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.color.ink, marginBottom: 8 },
    emptyBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}

// Gate modal styles
function makeStylesGm(theme: VarsTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: theme.color.overlay,
      alignItems: 'center', justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: BORDER_RADIUS, borderTopRightRadius: BORDER_RADIUS,
      padding: 28, width: '100%', alignItems: 'center', gap: 8,
    },
    title: { fontSize: 20, fontWeight: '800', color: theme.color.ink, textAlign: 'center', marginTop: 4 },
    body: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
    chargingTitle: { fontSize: 18, fontWeight: '800', color: theme.color.ink, textAlign: 'center', marginTop: 8 },
    subText: { fontSize: 13, color: theme.color.inkMuted, textAlign: 'center' },
    successTitle: { fontSize: 20, fontWeight: '800', color: theme.color.accentGreen, textAlign: 'center', marginTop: 4 },
    successBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
    errorTitle: { fontSize: 20, fontWeight: '800', color: theme.color.accentRed, textAlign: 'center', marginTop: 4 },
    errorBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
    // Fixed to the per-status "on my way" color, same as elsewhere in this file.
    primaryBtn: {
      width: '100%', height: 54, backgroundColor: Colors.statusOnWay,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center', marginTop: 8,
    },
    primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    ghostBtn: {
      width: '100%', height: 48,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    ghostBtnText: { fontSize: 15, fontWeight: '700', color: theme.color.inkMuted },
  });
}

// Zone modal styles
function makeStylesZm(theme: VarsTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: theme.color.overlay,
      alignItems: 'center', justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: 5, borderTopRightRadius: 5,
      padding: 28, width: '100%', alignItems: 'center', gap: 8,
    },
    title: { fontSize: 20, fontWeight: '800', color: theme.color.ink, textAlign: 'center' },
    body:  { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
    // Fixed to the pioneer-gold brand accent, same as elsewhere in the app.
    confirmBtn: {
      width: '100%', height: 54, backgroundColor: Colors.pioneerGold,
      borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    changeBtn: {
      width: '100%', height: 48,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      borderRadius: 5, alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    changeBtnText: { fontSize: 15, fontWeight: '700', color: theme.color.inkMuted },
    dismissBtn: { paddingVertical: 12 },
    dismissBtnText: { fontSize: 14, color: theme.color.inkMuted },
  });
}
