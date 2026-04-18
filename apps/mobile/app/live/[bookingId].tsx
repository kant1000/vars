// ============================================================
// VARS — Live Experience Screen (Phase 8)
// Route: /live/[bookingId]
// Real-time booking status tracker for the customer.
// Supabase Realtime subscription on bookings + vendors (live_location).
// Status flow: pending → accepted → on_way → arrived
//              → service_rendered → completed | cancelled | expired | disputed
// Phone reveal 15 min before scheduled_at once booking is accepted.
// "Confirm service rendered" → calls paystack-settle edge fn.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtTime, fmtDateTime } from '@/lib/format';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ───────────────────────────────────────────────────
type BookingStatus =
  | 'pending' | 'accepted' | 'on_way' | 'arrived'
  | 'service_rendered' | 'completed' | 'cancelled' | 'expired' | 'disputed';

interface BookingData {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  service_duration_blocks: number;
  scheduled_at: string;
  user_location_address: string | null;
  phone_revealed: boolean;
  phone_reveal_at: string | null;
  auto_release_at: string | null;
  accepted_at: string | null;
  on_way_at: string | null;
  arrived_at: string | null;
  service_rendered_at: string | null;
  completed_at: string | null;
  vendor_id: string;
  vendor_name: string;
  vendor_phone: string | null;
  vendor_live_lat: number | null;
  vendor_live_lng: number | null;
}

// ── Status config ────────────────────────────────────────────
const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; emoji: string }> = {
  pending:          { label: 'Awaiting vendor',      color: Colors.statusPending,   emoji: '⏳' },
  accepted:         { label: 'Booking confirmed',    color: Colors.statusAccepted,  emoji: '✅' },
  on_way:           { label: 'Vendor on their way',  color: Colors.statusOnWay,     emoji: '🚗' },
  arrived:          { label: 'Vendor has arrived',   color: Colors.statusArrived,   emoji: '📍' },
  service_rendered: { label: 'Service complete',     color: Colors.primary,         emoji: '🎉' },
  completed:        { label: 'All done',             color: Colors.statusCompleted, emoji: '⭐' },
  cancelled:        { label: 'Cancelled',            color: Colors.statusCancelled, emoji: '✕' },
  expired:          { label: 'Expired',              color: Colors.statusExpired,   emoji: '⏱' },
  disputed:         { label: 'Under review',         color: Colors.statusDisputed,  emoji: '⚠️' },
};

const STATUS_ORDER: BookingStatus[] = [
  'pending', 'accepted', 'on_way', 'arrived', 'service_rendered', 'completed',
];

// ── Helpers ─────────────────────────────────────────────────
function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

// ── Status timeline ──────────────────────────────────────────
function Timeline({ current }: { current: BookingStatus }) {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1) return null;
  return (
    <View style={tl.wrap}>
      {STATUS_ORDER.map((s, i) => {
        const done = i < idx, active = i === idx;
        const cfg = STATUS_CONFIG[s];
        return (
          <View key={s} style={tl.row}>
            <View style={tl.left}>
              <View style={[tl.dot, done && tl.dotDone, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}>
                <Text style={[tl.dotText, (done || active) && tl.dotTextActive]}>
                  {done ? '✓' : cfg.emoji}
                </Text>
              </View>
              {i < STATUS_ORDER.length - 1 && (
                <View style={[tl.connector, done && tl.connectorDone]} />
              )}
            </View>
            <Text style={[tl.label, active && { color: cfg.color, fontWeight: '700' }, done && tl.labelDone]}>
              {cfg.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
const tl = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 44 },
  left: { alignItems: 'center', marginRight: 12, width: 28 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotText: { fontSize: 11 },
  dotTextActive: { color: '#FFF' },
  connector: { width: 2, flex: 1, backgroundColor: Colors.border, minHeight: 16 },
  connectorDone: { backgroundColor: Colors.primary },
  label: { fontSize: 14, color: Colors.textMuted, paddingTop: 4 },
  labelDone: { color: Colors.textSecondary },
});

// ── Dispute modal ────────────────────────────────────────────
type DisputeCategory =
  | 'vendor_no_show' | 'vendor_very_late' | 'service_not_completed'
  | 'service_quality_poor' | 'wrong_service' | 'other';

const DISPUTE_CATEGORIES: { value: DisputeCategory; label: string }[] = [
  { value: 'vendor_no_show',          label: 'Vendor didn\'t show up' },
  { value: 'vendor_very_late',        label: 'Vendor arrived very late' },
  { value: 'service_not_completed',   label: 'Service was not completed' },
  { value: 'service_quality_poor',    label: 'Service quality was poor' },
  { value: 'wrong_service',           label: 'Wrong service was performed' },
  { value: 'other',                   label: 'Other' },
];

function DisputeModal({
  visible, bookingId, onClose,
}: {
  visible: boolean;
  bookingId: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<DisputeCategory | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasonRequired = category === 'other';
  const canSubmit = !!category && (!reasonRequired || reason.trim().length >= 5) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/dispute-raise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          booking_id: bookingId,
          category,
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        Alert.alert('Error', d.error ?? 'Could not raise dispute. Please try again.');
        return;
      }
    } catch {
      Alert.alert('Error', 'Could not reach server. Please check your connection.');
      return;
    } finally {
      setSubmitting(false);
    }
    onClose();
    Alert.alert('Dispute raised', 'Our team will review this within 24 hours. Payment is held until resolved.');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={dm.overlay}>
        <View style={dm.sheet}>
          <Text style={dm.title}>Raise a dispute</Text>
          <Text style={dm.body}>Tell us what went wrong. Our team reviews all disputes within 24 hours.</Text>

          <View style={dm.categories}>
            {DISPUTE_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[dm.categoryRow, category === c.value && dm.categoryRowSelected]}
                onPress={() => setCategory(c.value)}
                activeOpacity={0.7}
              >
                <View style={[dm.radio, category === c.value && dm.radioSelected]} />
                <Text style={[dm.categoryLabel, category === c.value && dm.categoryLabelSelected]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {category && (
            <TextInput
              style={[dm.input, { marginTop: 14 }]}
              placeholder={reasonRequired ? 'Describe the issue… (required)' : 'Add more details (optional)'}
              placeholderTextColor={Colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />
          )}

          <View style={dm.btns}>
            <TouchableOpacity style={dm.cancel} onPress={onClose}><Text style={dm.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[dm.submit, !canSubmit && dm.submitDisabled]}
              onPress={submit}
              disabled={!canSubmit}
            >
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={dm.submitText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  body: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  categories: { gap: 8 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  categoryRowSelected: { borderColor: Colors.error, backgroundColor: Colors.error + '0D' },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.border,
  },
  radioSelected: { borderColor: Colors.error, backgroundColor: Colors.error },
  categoryLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  categoryLabelSelected: { fontWeight: '600', color: Colors.error },
  input: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.text, minHeight: 80,
  },
  btns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancel: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  submit: { flex: 2, height: 48, backgroundColor: Colors.error, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { backgroundColor: Colors.textMuted },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});

// ── Root component ───────────────────────────────────────────
export default function LiveScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [disputeVisible, setDisputeVisible] = useState(false);
  const mapRef = useRef<MapView>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id, status, service_name, service_price_kobo, service_duration_blocks,
        scheduled_at, user_location_address,
        phone_revealed, phone_reveal_at, auto_release_at,
        accepted_at, on_way_at, arrived_at, service_rendered_at, completed_at,
        vendor_id,
        vendors(full_name, phone_number, live_location)
      `)
      .eq('id', bookingId)
      .single();

    if (error || !data) { setLoading(false); return; }

    const v = data as any;
    const vendor = v.vendors;
    let vendorLat: number | null = null;
    let vendorLng: number | null = null;
    if (vendor?.live_location) {
      // PostGIS geography comes back as GeoJSON
      try {
        const geo = typeof vendor.live_location === 'string'
          ? JSON.parse(vendor.live_location)
          : vendor.live_location;
        vendorLat = geo?.coordinates?.[1] ?? null;
        vendorLng = geo?.coordinates?.[0] ?? null;
      } catch { /* ignore */ }
    }

    setBooking({
      id: v.id,
      status: v.status,
      service_name: v.service_name,
      service_price_kobo: v.service_price_kobo,
      service_duration_blocks: v.service_duration_blocks,
      scheduled_at: v.scheduled_at,
      user_location_address: v.user_location_address,
      phone_revealed: v.phone_revealed,
      phone_reveal_at: v.phone_reveal_at,
      auto_release_at: v.auto_release_at,
      accepted_at: v.accepted_at,
      on_way_at: v.on_way_at,
      arrived_at: v.arrived_at,
      service_rendered_at: v.service_rendered_at,
      completed_at: v.completed_at,
      vendor_id: v.vendor_id,
      vendor_name: vendor?.full_name ?? 'Your vendor',
      vendor_phone: vendor?.phone_number ?? null,
      vendor_live_lat: vendorLat,
      vendor_live_lng: vendorLng,
    });
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: booking status changes
  useEffect(() => {
    const channel = supabase
      .channel(`booking:${bookingId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: `id=eq.${bookingId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId, load]);

  // Realtime: vendor live_location changes
  useEffect(() => {
    if (!booking?.vendor_id) return;
    const channel = supabase
      .channel(`vendor_loc:${booking.vendor_id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'vendors',
        filter: `id=eq.${booking.vendor_id}`,
      }, (payload) => {
        const loc = (payload.new as any)?.live_location;
        if (!loc) return;
        try {
          const geo = typeof loc === 'string' ? JSON.parse(loc) : loc;
          const lat = geo?.coordinates?.[1];
          const lng = geo?.coordinates?.[0];
          if (lat && lng) {
            setBooking((prev) => prev ? { ...prev, vendor_live_lat: lat, vendor_live_lng: lng } : prev);
            mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 800);
          }
        } catch { /* ignore */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [booking?.vendor_id]);

  const cancelBooking = () => {
    if (!session || !booking) return;
    // Cancellation is only permitted while pending or accepted — not once vendor is on their way
    if (!['pending', 'accepted'].includes(booking.status)) return;

    Alert.alert(
      'Cancel booking?',
      'A cancellation fee may apply depending on timing. Check the policy in your booking.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const { data: { session: s } } = await supabase.auth.getSession();
              const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-cancel`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${s?.access_token ?? ''}`,
                },
                body: JSON.stringify({ booking_id: booking.id }),
              });
              if (!res.ok) {
                const d = await res.json();
                Alert.alert('Error', d.error ?? 'Could not cancel. Please try again.');
              }
              // Status update comes via Realtime
            } catch {
              Alert.alert('Error', 'Could not reach server. Please check your connection.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const confirmServiceRendered = async () => {
    if (!booking) return;
    setConfirming(true);
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s?.access_token ?? ''}`,
        },
        body: JSON.stringify({ booking_id: booking.id, trigger: 'user_confirm' }),
      });
      if (!res.ok) {
        const d = await res.json();
        Alert.alert('Error', d.error ?? 'Something went wrong. Please try again.');
      }
      // Status update will come via Realtime
    } catch {
      Alert.alert('Error', 'Could not reach server. Please check your connection.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return <View style={s.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }
  if (!booking) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>Booking not found.</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.link}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const cfg = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending;
  const showMap = ['on_way', 'arrived'].includes(booking.status)
    && booking.vendor_live_lat != null && booking.vendor_live_lng != null;

  const minsUntil = minutesUntil(booking.scheduled_at);
  const showPhone = booking.phone_revealed && booking.vendor_phone;
  const showPhoneCountdown = !booking.phone_revealed
    && booking.status === 'accepted'
    && minsUntil > 0 && minsUntil <= 30;

  const canConfirm = booking.status === 'service_rendered';
  // Customer can only cancel before vendor departs — once on_way or later it's locked
  const canCancel  = ['pending', 'accepted'].includes(booking.status);
  const canDispute = ['on_way', 'arrived', 'service_rendered'].includes(booking.status);
  const isTerminal = ['completed', 'cancelled', 'expired', 'disputed'].includes(booking.status);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Live booking</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Status pill */}
        <View style={[s.statusPill, { backgroundColor: cfg.color + '15' }]}>
          <Text style={s.statusEmoji}>{cfg.emoji}</Text>
          <Text style={[s.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>

        {/* Booking summary */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{booking.service_name}</Text>
          <Text style={s.cardMeta}>{fmtDateTime(booking.scheduled_at)}</Text>
          {booking.user_location_address && (
            <Text style={s.cardMeta}>📍 {booking.user_location_address}</Text>
          )}
          <Text style={s.cardPrice}>{fmtPrice(booking.service_price_kobo)}</Text>
        </View>

        {/* Live map */}
        {showMap && (
          <View style={s.mapWrap}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={s.map}
              initialRegion={{
                latitude: booking.vendor_live_lat!,
                longitude: booking.vendor_live_lng!,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              <Marker
                coordinate={{ latitude: booking.vendor_live_lat!, longitude: booking.vendor_live_lng! }}
                title={booking.vendor_name}
                description="Your vendor"
              />
            </MapView>
          </View>
        )}

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
        {booking.status === 'service_rendered' && booking.auto_release_at && (
          <View style={s.autoReleaseBox}>
            <Text style={s.autoReleaseText}>
              Payment auto-releases to your vendor at {fmtTime(booking.auto_release_at)} if you don't confirm.
            </Text>
          </View>
        )}

        {/* Status timeline */}
        <Text style={s.sectionLabel}>Booking progress</Text>
        <Timeline current={booking.status} />
      </ScrollView>

      {/* Action buttons */}
      {!isTerminal && (
        <View style={[s.actions, { paddingBottom: insets.bottom + 12 }]}>
          {canConfirm && (
            <TouchableOpacity
              style={[s.confirmBtn, confirming && s.btnDisabled]}
              onPress={confirmServiceRendered}
              disabled={confirming}
              activeOpacity={0.88}
            >
              {confirming
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.confirmBtnText}>Confirm service done</Text>
              }
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity
              style={[s.cancelBtn, cancelling && s.btnDisabled]}
              onPress={cancelBooking}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator color={Colors.error} size="small" />
                : <Text style={s.cancelBtnText}>Cancel booking</Text>
              }
            </TouchableOpacity>
          )}
          {canDispute && (
            <TouchableOpacity
              style={s.disputeBtn}
              onPress={() => setDisputeVisible(true)}
            >
              <Text style={s.disputeBtnText}>Something's wrong</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Completed CTA */}
      {booking.status === 'completed' && (
        <View style={[s.actions, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={s.confirmBtn}
            onPress={() => router.push({ pathname: '/review/[bookingId]', params: { bookingId: booking.id } })}
          >
            <Text style={s.confirmBtnText}>Leave a review ⭐</Text>
          </TouchableOpacity>
        </View>
      )}

      <DisputeModal
        visible={disputeVisible}
        bookingId={booking.id}
        onClose={() => setDisputeVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  errorText: { fontSize: 16, color: Colors.text, marginBottom: 12 },
  link: { fontSize: 15, color: Colors.primary, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: Colors.primary, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, borderRadius: 16, padding: 14,
  },
  statusEmoji: { fontSize: 20 },
  statusLabel: { fontSize: 17, fontWeight: '800' },

  card: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  cardMeta: { fontSize: 13, color: Colors.textSecondary },
  cardPrice: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: 4 },

  mapWrap: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden', height: 200 },
  map: { flex: 1 },

  phoneCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.success + '15', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.success + '40',
  },
  phoneLabel: { fontSize: 15, fontWeight: '700', color: Colors.success, marginBottom: 2 },
  phoneNum: { fontSize: 18, fontWeight: '800', color: Colors.text },
  phoneCountdown: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.warning + '15', borderRadius: 14, padding: 12,
  },
  phoneCountdownText: { fontSize: 13, color: Colors.warning, fontWeight: '500' },

  autoReleaseBox: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 12,
  },
  autoReleaseText: { fontSize: 13, color: Colors.primary, lineHeight: 18 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginHorizontal: 20, marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  actions: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 16, gap: 10,
  },
  confirmBtn: {
    height: 56, backgroundColor: Colors.primary,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  btnDisabled: { backgroundColor: Colors.textMuted },
  cancelBtn: {
    height: 44, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.error, borderRadius: 12,
  },
  cancelBtnText: { fontSize: 14, color: Colors.error, fontWeight: '700' },
  disputeBtn: {
    height: 44, alignItems: 'center', justifyContent: 'center',
  },
  disputeBtnText: { fontSize: 14, color: Colors.error, fontWeight: '600' },
});
