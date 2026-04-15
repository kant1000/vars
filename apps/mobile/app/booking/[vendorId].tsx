// ============================================================
// VARS — Booking Flow (Phase 7)
// Route: /booking/[vendorId]
// Step 1: Select service
// Step 2: Pick date + time slot (30-min blocks)
// Step 3: Review & pay → calls paystack-initialize edge fn
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Modal, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity,
  View, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const SCREEN_W = Dimensions.get('window').width;
const BLOCK_MINS = 30;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// ── Types ───────────────────────────────────────────────────
interface ServiceOption {
  id: string;           // vendor_services.id
  service_id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  duration_blocks: number;
  category_name: string;
}

// ── Helpers ─────────────────────────────────────────────────
function fmtPrice(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}
function fmtDuration(blocks: number) {
  const m = blocks * BLOCK_MINS;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}hr ${rem}min` : `${h}hr`;
}
function fmtTime(date: Date) {
  return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(date: Date) {
  return date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
}
function addMinutes(d: Date, m: number) {
  return new Date(d.getTime() + m * 60000);
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── Step indicator ───────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const labels = ['Service', 'Schedule', 'Review'];
  return (
    <View style={sb.wrap}>
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < step, active = n === step;
        return (
          <React.Fragment key={l}>
            <View style={sb.item}>
              <View style={[sb.dot, done && sb.dotDone, active && sb.dotActive]}>
                <Text style={[sb.dotText, (done || active) && sb.dotTextActive]}>
                  {done ? '✓' : n}
                </Text>
              </View>
              <Text style={[sb.label, active && sb.labelActive]}>{l}</Text>
            </View>
            {i < 2 && <View style={[sb.line, done && sb.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.border },
  item: { alignItems: 'center', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  dotDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotActive: { borderColor: Colors.primary },
  dotText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  dotTextActive: { color: Colors.primary },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '500' },
  labelActive: { color: Colors.primary, fontWeight: '700' },
  line: { flex: 1, height: 2, backgroundColor: Colors.border, marginBottom: 14 },
  lineDone: { backgroundColor: Colors.primary },
});

// ── Step 1: Select service ───────────────────────────────────
function Step1({ vendorId, onSelect }: { vendorId: string; onSelect: (s: ServiceOption) => void }) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('vendor_services')
        .select('id, price_kobo, duration_blocks, services(id, name, description, service_categories(name))')
        .eq('vendor_id', vendorId);
      setServices((data ?? []).map((vs: any) => ({
        id: vs.id,
        service_id: vs.services?.id,
        name: vs.services?.name ?? '',
        description: vs.services?.description ?? null,
        price_kobo: vs.price_kobo,
        duration_blocks: vs.duration_blocks,
        category_name: vs.services?.service_categories?.name ?? '',
      })));
      setLoading(false);
    })();
  }, [vendorId]);

  if (loading) return <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={s.stepTitle}>What do you need done?</Text>
      {services.map((svc) => (
        <TouchableOpacity key={svc.id} style={s.serviceCard} onPress={() => onSelect(svc)} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <Text style={s.serviceName}>{svc.name}</Text>
            {svc.description ? <Text style={s.serviceDesc} numberOfLines={2}>{svc.description}</Text> : null}
            <Text style={s.serviceMeta}>{fmtDuration(svc.duration_blocks)} · {svc.category_name}</Text>
          </View>
          <View style={s.priceCol}>
            <Text style={s.price}>{fmtPrice(svc.price_kobo)}</Text>
            <Text style={s.arrow}>›</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── Step 2: Date + time picker ───────────────────────────────
function Step2({
  vendorId, service, onConfirm,
}: {
  vendorId: string;
  service: ServiceOption;
  onConfirm: (slot: Date, isAutoAccept: boolean) => void;
}) {
  // Generate next 14 days (excluding today before current time)
  const today = new Date();
  const days: Date[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [selectedDay, setSelectedDay] = useState<Date>(days[0]);
  const [slots, setSlots] = useState<{ time: Date; available: boolean; autoAccept: boolean }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const loadSlots = useCallback(async (day: Date) => {
    setLoadingSlots(true);
    const dayStart = new Date(day); dayStart.setHours(8, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(22, 0, 0, 0);

    // Fetch vendor calendar blocks
    const { data: calBlocks } = await supabase
      .from('vendor_calendar')
      .select('start_time, end_time, block_state')
      .eq('vendor_id', vendorId)
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString());

    // Fetch existing accepted/pending bookings
    const { data: booked } = await supabase
      .from('bookings')
      .select('scheduled_at, service_duration_blocks')
      .eq('vendor_id', vendorId)
      .in('status', ['pending', 'accepted', 'vendor_on_way', 'vendor_arrived'])
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString());

    // Build 30-min slots from 08:00–22:00
    const generated: { time: Date; available: boolean; autoAccept: boolean }[] = [];
    let cursor = new Date(dayStart);
    const now = new Date();

    while (cursor < dayEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = addMinutes(slotStart, service.duration_blocks * BLOCK_MINS);

      let available = true;
      let autoAccept = false;

      // Past slots
      if (slotStart <= now) { available = false; }

      // Conflicts with calendar blocks (unavailable or transport_buffer = blocked)
      if (available) {
        for (const b of calBlocks ?? []) {
          if (b.block_state !== 'unavailable' && b.block_state !== 'transport_buffer') continue;
          const bStart = new Date(b.start_time), bEnd = new Date(b.end_time);
          if (slotStart < bEnd && slotEnd > bStart) { available = false; break; }
        }
      }

      // Check if slot start is auto_accept
      if (available) {
        autoAccept = (calBlocks ?? []).some((b) => {
          if (b.block_state !== 'auto_accept') return false;
          return slotStart >= new Date(b.start_time) && slotStart < new Date(b.end_time);
        });
      }

      // Conflicts with existing bookings
      if (available) {
        for (const b of booked ?? []) {
          const bStart = new Date(b.scheduled_at);
          const bEnd = addMinutes(bStart, b.service_duration_blocks * BLOCK_MINS);
          if (slotStart < bEnd && slotEnd > bStart) { available = false; break; }
        }
      }

      // Don't show slot if service would run past end of day
      if (slotEnd > dayEnd) { available = false; }

      generated.push({ time: slotStart, available, autoAccept });
      cursor = addMinutes(cursor, BLOCK_MINS);
    }

    setSlots(generated);
    setLoadingSlots(false);
  }, [vendorId, service.duration_blocks]);

  useEffect(() => { loadSlots(selectedDay); }, [selectedDay, loadSlots]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={[s.stepTitle, { margin: 16 }]}>When works for you?</Text>

      {/* Day selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        {days.map((d) => {
          const active = sameDay(d, selectedDay);
          return (
            <TouchableOpacity key={d.toISOString()} style={[s.dayChip, active && s.dayChipActive]} onPress={() => setSelectedDay(d)}>
              <Text style={[s.dayChipWeekday, active && s.dayChipTextActive]}>
                {d.toLocaleDateString('en-NG', { weekday: 'short' })}
              </Text>
              <Text style={[s.dayChipNum, active && s.dayChipTextActive]}>
                {d.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Auto-accept legend if any slots show it */}
      {slots.some((sl) => sl.available && sl.autoAccept) && (
        <View style={s.autoAcceptLegend}>
          <Text style={s.autoAcceptLegendText}>⚡ Instant confirm — no waiting</Text>
        </View>
      )}

      {/* Time slots */}
      {loadingSlots ? (
        <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <View style={s.slotGrid}>
          {slots.map((slot) => (
            <TouchableOpacity
              key={slot.time.toISOString()}
              style={[
                s.slot,
                !slot.available && s.slotUnavailable,
                slot.available && slot.autoAccept && s.slotAutoAccept,
              ]}
              onPress={() => slot.available && onConfirm(slot.time, slot.autoAccept)}
              disabled={!slot.available}
              activeOpacity={0.8}
            >
              <Text style={[
                s.slotText,
                !slot.available && s.slotTextUnavailable,
                slot.available && slot.autoAccept && s.slotTextAutoAccept,
              ]}>
                {fmtTime(slot.time)}
              </Text>
              {slot.available && slot.autoAccept && (
                <Text style={s.slotAutoIcon}>⚡</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Step 3: Review & pay ─────────────────────────────────────
function Step3({
  vendorId, service, slot, isAutoAccept, onPay, paying,
}: {
  vendorId: string;
  service: ServiceOption;
  slot: Date;
  isAutoAccept: boolean;
  onPay: (address: string, notes: string) => void;
  paying: boolean;
}) {
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const canPay = address.trim().length >= 5;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <Text style={s.stepTitle}>Review your booking</Text>

        {/* Summary card */}
        <View style={s.summaryCard}>
          <Row label="Service" value={service.name} />
          <Row label="Duration" value={fmtDuration(service.duration_blocks)} />
          <Row label="Date" value={fmtDate(slot)} />
          <Row label="Time" value={fmtTime(slot)} />
          <View style={s.divider} />
          <Row label="Total" value={fmtPrice(service.price_kobo)} bold />
        </View>

        {/* Address */}
        <View>
          <Text style={s.fieldLabel}>Your address <Text style={s.required}>*</Text></Text>
          <TextInput
            style={s.textInput}
            placeholder="Where should your vendor come to?"
            placeholderTextColor={Colors.textMuted}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Notes */}
        <View>
          <Text style={s.fieldLabel}>Notes for your vendor <Text style={s.optional}>(optional)</Text></Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. Ring the gate, 2nd floor, etc."
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
        </View>

        <View style={[s.infoBox, isAutoAccept && s.infoBoxAutoAccept]}>
          <Text style={[s.infoText, isAutoAccept && s.infoTextAutoAccept]}>
            {isAutoAccept
              ? '⚡ This slot is instant-confirm. Your booking will be confirmed immediately after payment.'
              : 'Payment is held securely by VARS until your service is complete. Your vendor has 2 hours to accept this booking.'}
          </Text>
        </View>
      </ScrollView>

      {/* Pay button */}
      <View style={s.payWrap}>
        <TouchableOpacity
          style={[s.payBtn, (!canPay || paying) && s.payBtnDisabled]}
          onPress={() => canPay && !paying && onPay(address, notes)}
          disabled={!canPay || paying}
          activeOpacity={0.88}
        >
          {paying
            ? <ActivityIndicator color="#FFF" />
            : <Text style={s.payBtnText}>Pay {fmtPrice(service.price_kobo)} securely</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, bold && s.summaryValueBold]}>{value}</Text>
    </View>
  );
}

// ── Root component ───────────────────────────────────────────
export default function BookingFlow() {
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const insets = useSafeAreaInsets();
  const { user, session } = useAuth();

  const [step, setStep] = useState(1);
  const [service, setService] = useState<ServiceOption | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [slotIsAutoAccept, setSlotIsAutoAccept] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelectService = (svc: ServiceOption) => {
    setService(svc);
    setStep(2);
  };

  const handleSelectSlot = (s: Date, isAutoAccept: boolean) => {
    setSlot(s);
    setSlotIsAutoAccept(isAutoAccept);
    setStep(3);
  };

  const handlePay = async (address: string, notes: string) => {
    if (!service || !slot || !session) return;
    setPaying(true);
    setError(null);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          vendor_id: vendorId,
          vendor_service_id: service.id,
          scheduled_at: slot.toISOString(),
          customer_address: address,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Payment initialisation failed');

      // Open Paystack checkout in WebView modal
      setPaystackUrl(data.authorization_url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleWebViewNav = (url: string) => {
    // Paystack redirects to callback_url after payment
    if (url.includes('paystack') && (url.includes('callback') || url.includes('success') || url.includes('cancel'))) {
      setPaystackUrl(null);
      if (url.includes('cancel')) {
        setError('Payment was cancelled.');
      } else {
        // Navigate to bookings tab
        router.replace('/(tabs)/bookings');
      }
      return false;
    }
    return true;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => step > 1 ? setStep(step - 1) : router.back()} style={s.headerBack}>
          <Text style={s.headerBackText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Book a visit</Text>
        <View style={{ width: 36 }} />
      </View>

      <StepBar step={step} />

      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {step === 1 && (
        <Step1 vendorId={vendorId!} onSelect={handleSelectService} />
      )}
      {step === 2 && service && (
        <Step2 vendorId={vendorId!} service={service} onConfirm={handleSelectSlot} />
      )}
      {step === 3 && service && slot && (
        <Step3
          vendorId={vendorId!}
          service={service}
          slot={slot}
          isAutoAccept={slotIsAutoAccept}
          onPay={handlePay}
          paying={paying}
        />
      )}

      {/* Paystack WebView modal */}
      <Modal visible={!!paystackUrl} animationType="slide">
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={s.webviewHeader}>
            <TouchableOpacity onPress={() => setPaystackUrl(null)} style={s.webviewClose}>
              <Text style={s.webviewCloseText}>✕</Text>
            </TouchableOpacity>
            <Text style={s.webviewTitle}>Secure payment</Text>
            <View style={{ width: 36 }} />
          </View>
          {paystackUrl && (
            <WebView
              source={{ uri: paystackUrl }}
              onShouldStartLoadWithRequest={(req) => handleWebViewNav(req.url)}
              startInLoadingState
              renderLoading={() => (
                <View style={s.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerBackText: { fontSize: 28, color: Colors.primary, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  stepTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  errorBanner: { backgroundColor: Colors.error + '15', paddingHorizontal: 16, paddingVertical: 10 },
  errorText: { fontSize: 13, color: Colors.error, fontWeight: '500' },

  // Services
  serviceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  serviceName: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  serviceDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  serviceMeta: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  priceCol: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 16, fontWeight: '800', color: Colors.text },
  arrow: { fontSize: 20, color: Colors.textMuted },

  // Day chips
  dayChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, minWidth: 52,
  },
  dayChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayChipWeekday: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  dayChipNum: { fontSize: 18, fontWeight: '800', color: Colors.text },
  dayChipTextActive: { color: '#FFF' },

  // Slots
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginTop: 16 },
  slot: {
    width: (SCREEN_W - 32 - 24) / 4, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center',
  },
  slotUnavailable: { borderColor: Colors.border, backgroundColor: Colors.surface },
  slotAutoAccept: { borderColor: '#D4A017', backgroundColor: '#FFF8E6' },
  slotText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  slotTextUnavailable: { color: Colors.textMuted },
  slotTextAutoAccept: { color: '#A07010' },
  slotAutoIcon: { fontSize: 9, color: '#D4A017', marginTop: 1 },
  autoAcceptLegend: {
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    backgroundColor: '#FFF8E6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#D4A01730',
  },
  autoAcceptLegendText: { fontSize: 12, color: '#A07010', fontWeight: '600' },

  // Review
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  summaryValueBold: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  required: { color: Colors.error },
  optional: { color: Colors.textMuted, fontWeight: '400' },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: Colors.text, minHeight: 52,
  },
  infoBox: {
    backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 14,
  },
  infoBoxAutoAccept: { backgroundColor: '#FFF8E6' },
  infoText: { fontSize: 13, color: Colors.primary, lineHeight: 19, fontWeight: '500' },
  infoTextAutoAccept: { color: '#A07010' },

  // Pay button
  payWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 20,
  },
  payBtn: {
    height: 58, backgroundColor: Colors.primary,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  payBtnDisabled: { backgroundColor: Colors.textMuted },
  payBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },

  // Paystack WebView
  webviewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  webviewClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  webviewCloseText: { fontSize: 18, color: Colors.text },
  webviewTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
});
