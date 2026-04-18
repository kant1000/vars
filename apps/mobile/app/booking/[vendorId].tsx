// ============================================================
// VARS — Booking Flow
// Step 1: Select service
// Step 2: Pick date + time slot
// Step 3a: Review + access details
// Step 3b: Location confirmation + pay
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Modal, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity,
  View, TextInput, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const SCREEN_W = Dimensions.get('window').width;
const BLOCK_MINS = 30;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ────────────────────────────────────────────────────
interface ServiceOption {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  duration_blocks: number;
  category_name: string;
}

interface AccessDetails {
  building: string;
  floor: string;
  flat: string;
  gateCode: string;
}

// ── Constants ────────────────────────────────────────────────
const FLOOR_OPTIONS = [
  'Ground', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th',
  '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th', 'Penthouse',
];

const EMPTY_ACCESS: AccessDetails = { building: '', floor: '', flat: '', gateCode: '' };

// ── Helpers ──────────────────────────────────────────────────
function sanitize(text: string, maxLen: number) {
  return text.replace(/@/g, '').replace(/\d{7,}/g, '').slice(0, maxLen);
}
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

// ── Step indicator ────────────────────────────────────────────
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

// ── Step 1: Select service ────────────────────────────────────
function Step1({ vendorId, onSelect }: { vendorId: string; onSelect: (s: ServiceOption) => void }) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('vendor_services')
        .select('id, price_kobo, duration_blocks, services(id, name, description, service_categories(name))')
        .eq('vendor_id', vendorId)
        .eq('is_bookable', true);
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

// ── Step 2: Date + time picker ────────────────────────────────
function Step2({
  vendorId, service, onConfirm,
}: {
  vendorId: string;
  service: ServiceOption;
  onConfirm: (slot: Date, isAutoAccept: boolean) => void;
}) {
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

    const { data: calBlocks } = await supabase
      .from('vendor_calendar')
      .select('start_time, end_time, block_state')
      .eq('vendor_id', vendorId)
      .lt('start_time', dayEnd.toISOString())
      .gt('end_time', dayStart.toISOString());

    const { data: booked } = await supabase
      .from('bookings')
      .select('scheduled_at, service_duration_blocks')
      .eq('vendor_id', vendorId)
      .in('status', ['pending', 'accepted', 'on_way', 'arrived'])
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString());

    const generated: { time: Date; available: boolean; autoAccept: boolean }[] = [];
    let cursor = new Date(dayStart);
    const now = new Date();

    while (cursor < dayEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = addMinutes(slotStart, service.duration_blocks * BLOCK_MINS);

      let available = true;
      let autoAccept = false;

      if (slotStart <= now) { available = false; }

      if (available) {
        for (const b of calBlocks ?? []) {
          if (b.block_state !== 'unavailable' && b.block_state !== 'transport_buffer') continue;
          const bStart = new Date(b.start_time), bEnd = new Date(b.end_time);
          if (slotStart < bEnd && slotEnd > bStart) { available = false; break; }
        }
      }

      if (available) {
        autoAccept = (calBlocks ?? []).some((b) => {
          if (b.block_state !== 'auto_accept') return false;
          return slotStart >= new Date(b.start_time) && slotStart < new Date(b.end_time);
        });
      }

      if (available) {
        for (const b of booked ?? []) {
          const bStart = new Date(b.scheduled_at);
          const bEnd = addMinutes(bStart, b.service_duration_blocks * BLOCK_MINS);
          if (slotStart < bEnd && slotEnd > bStart) { available = false; break; }
        }
      }

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        {days.map((d) => {
          const active = sameDay(d, selectedDay);
          return (
            <TouchableOpacity key={d.toISOString()} style={[s.dayChip, active && s.dayChipActive]} onPress={() => setSelectedDay(d)}>
              <Text style={[s.dayChipWeekday, active && s.dayChipTextActive]}>
                {d.toLocaleDateString('en-NG', { weekday: 'short' })}
              </Text>
              <Text style={[s.dayChipNum, active && s.dayChipTextActive]}>{d.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {slots.some((sl) => sl.available && sl.autoAccept) && (
        <View style={s.autoAcceptLegend}>
          <Text style={s.autoAcceptLegendText}>⚡ Instant confirm — no waiting</Text>
        </View>
      )}

      {loadingSlots ? (
        <View style={s.centered}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <View style={s.slotGrid}>
          {slots.map((slot) => (
            <TouchableOpacity
              key={slot.time.toISOString()}
              style={[s.slot, !slot.available && s.slotUnavailable, slot.available && slot.autoAccept && s.slotAutoAccept]}
              onPress={() => slot.available && onConfirm(slot.time, slot.autoAccept)}
              disabled={!slot.available}
              activeOpacity={0.8}
            >
              <Text style={[s.slotText, !slot.available && s.slotTextUnavailable, slot.available && slot.autoAccept && s.slotTextAutoAccept]}>
                {fmtTime(slot.time)}
              </Text>
              {slot.available && slot.autoAccept && <Text style={s.slotAutoIcon}>⚡</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── Step 3a: Review + access details ─────────────────────────
function Step3Review({
  service, slot, isAutoAccept,
  access, setAccess,
  onConfirmLocation, locating, locError,
}: {
  service: ServiceOption;
  slot: Date;
  isAutoAccept: boolean;
  access: AccessDetails;
  setAccess: (a: AccessDetails) => void;
  onConfirmLocation: () => void;
  locating: boolean;
  locError: string | null;
}) {
  const [showFloorPicker, setShowFloorPicker] = useState(false);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <Text style={s.stepTitle}>Review your booking</Text>

        <View style={s.summaryCard}>
          <Row label="Service" value={service.name} />
          <Row label="Duration" value={fmtDuration(service.duration_blocks)} />
          <Row label="Date" value={fmtDate(slot)} />
          <Row label="Time" value={fmtTime(slot)} />
          <View style={s.divider} />
          <Row label="Total" value={fmtPrice(service.price_kobo)} bold />
        </View>

        <Text style={s.sectionHeading}>Access details <Text style={s.optionalTag}>(optional)</Text></Text>
        <Text style={s.accessHint}>Help your vendor find you faster.</Text>

        {/* Building name */}
        <View>
          <Text style={s.fieldLabel}>Building / estate name</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. Palm Spring Residences"
            placeholderTextColor={Colors.textMuted}
            value={access.building}
            onChangeText={(t) => setAccess({ ...access, building: sanitize(t, 60) })}
            returnKeyType="next"
          />
        </View>

        {/* Floor */}
        <View>
          <Text style={s.fieldLabel}>Floor</Text>
          <TouchableOpacity
            style={[s.textInput, s.pickerRow]}
            onPress={() => setShowFloorPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={access.floor ? s.pickerValue : s.pickerPlaceholder}>
              {access.floor || 'Select floor'}
            </Text>
            <Text style={s.pickerChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Flat / unit */}
        <View>
          <Text style={s.fieldLabel}>Flat / unit number</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. 4B"
            placeholderTextColor={Colors.textMuted}
            value={access.flat}
            onChangeText={(t) => setAccess({ ...access, flat: sanitize(t, 20) })}
            returnKeyType="next"
          />
        </View>

        {/* Gate code */}
        <View>
          <Text style={s.fieldLabel}>Gate / access code</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. 1234"
            placeholderTextColor={Colors.textMuted}
            value={access.gateCode}
            onChangeText={(t) => setAccess({ ...access, gateCode: sanitize(t, 20) })}
            returnKeyType="done"
            secureTextEntry={false}
          />
        </View>

        <View style={s.accessPrivacyNote}>
          <Text style={s.accessPrivacyText}>
            Access details are only shared with your vendor 15 minutes before their arrival.
          </Text>
        </View>

        {locError && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{locError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={s.payWrap}>
        <TouchableOpacity
          style={[s.payBtn, locating && s.payBtnDisabled]}
          onPress={onConfirmLocation}
          disabled={locating}
          activeOpacity={0.88}
        >
          {locating
            ? <ActivityIndicator color="#FFF" />
            : <Text style={s.payBtnText}>Confirm location →</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Floor picker modal */}
      <Modal visible={showFloorPicker} transparent animationType="slide">
        <Pressable style={s.modalOverlay} onPress={() => setShowFloorPicker(false)}>
          <Pressable style={s.pickerSheet} onPress={() => {}}>
            <View style={s.pickerHandle} />
            <Text style={s.pickerTitle}>Select floor</Text>
            <FlatList
              data={FLOOR_OPTIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.pickerOption}
                  onPress={() => { setAccess({ ...access, floor: item }); setShowFloorPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerOptionText, access.floor === item && s.pickerOptionSelected]}>
                    {item}
                  </Text>
                  {access.floor === item && <Text style={s.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Step 3b: Location confirmation + pay ─────────────────────
function Step3Location({
  service, slot, isAutoAccept,
  coords, locAddress, access,
  onPay, paying,
}: {
  service: ServiceOption;
  slot: Date;
  isAutoAccept: boolean;
  coords: { lat: number; lng: number };
  locAddress: string;
  access: AccessDetails;
  onPay: () => void;
  paying: boolean;
}) {
  const [mapReady, setMapReady] = useState(false);

  const hasAccess = access.building || access.floor || access.flat || access.gateCode;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Map thumbnail */}
        <MapView
          style={s.mapThumb}
          provider={PROVIDER_DEFAULT}
          region={{
            latitude: coords.lat,
            longitude: coords.lng,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onMapReady={() => setMapReady(true)}
          liteMode={Platform.OS === 'android'}
        >
          <Marker coordinate={{ latitude: coords.lat, longitude: coords.lng }} />
        </MapView>

        <View style={{ padding: 20, gap: 16 }}>
          {/* Detected address */}
          <View style={s.addressRow}>
            <Text style={s.addressIcon}>📍</Text>
            <Text style={s.addressText} numberOfLines={2}>{locAddress || 'Your current location'}</Text>
          </View>

          {/* Access details summary */}
          {hasAccess && (
            <View style={s.accessSummaryCard}>
              <Text style={s.accessSummaryTitle}>Access details</Text>
              {access.building ? <AccessRow label="Building" value={access.building} /> : null}
              {access.floor ? <AccessRow label="Floor" value={access.floor} /> : null}
              {access.flat ? <AccessRow label="Flat/unit" value={access.flat} /> : null}
              {access.gateCode ? <AccessRow label="Gate code" value={access.gateCode} /> : null}
            </View>
          )}

          {/* Summary */}
          <View style={s.summaryCard}>
            <Row label="Service" value={service.name} />
            <Row label="Date" value={fmtDate(slot)} />
            <Row label="Time" value={fmtTime(slot)} />
            <View style={s.divider} />
            <Row label="Total" value={fmtPrice(service.price_kobo)} bold />
          </View>

          <View style={[s.infoBox, isAutoAccept && s.infoBoxAutoAccept]}>
            <Text style={[s.infoText, isAutoAccept && s.infoTextAutoAccept]}>
              {isAutoAccept
                ? '⚡ Instant confirm — your booking is confirmed immediately after payment.'
                : 'Payment is held securely by VARS until your service is complete. Your vendor has 1 hour to accept.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.payWrap}>
        <TouchableOpacity
          style={[s.payBtn, (!mapReady || paying) && s.payBtnDisabled]}
          onPress={onPay}
          disabled={!mapReady || paying}
          activeOpacity={0.88}
        >
          {paying
            ? <ActivityIndicator color="#FFF" />
            : <Text style={s.payBtnText}>Pay {fmtPrice(service.price_kobo)} securely</Text>
          }
        </TouchableOpacity>
      </View>
    </>
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

function AccessRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.accessDetailRow}>
      <Text style={s.accessDetailLabel}>{label}</Text>
      <Text style={s.accessDetailValue}>{value}</Text>
    </View>
  );
}

// ── Root component ────────────────────────────────────────────
export default function BookingFlow() {
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [step, setStep] = useState(1);
  const [service, setService] = useState<ServiceOption | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [slotIsAutoAccept, setSlotIsAutoAccept] = useState(false);

  // Step 3 state
  const [step3View, setStep3View] = useState<'review' | 'location'>('review');
  const [access, setAccess] = useState<AccessDetails>(EMPTY_ACCESS);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locAddress, setLocAddress] = useState('');

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
    setStep3View('review');
    setAccess(EMPTY_ACCESS);
    setLocError(null);
    setCoords(null);
    setLocAddress('');
    setStep(3);
  };

  const handleBack = () => {
    if (step === 3 && step3View === 'location') {
      setStep3View('review');
      return;
    }
    if (step > 1) { setStep(step - 1); return; }
    router.back();
  };

  const handleConfirmLocation = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Location permission is required to book a visit. Please enable it in Settings.');
        setLocating(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;

      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const parts = [geo?.name, geo?.street, geo?.city ?? geo?.region].filter(Boolean);
      const address = parts.join(', ');

      setCoords({ lat: latitude, lng: longitude });
      setLocAddress(address);
      setStep3View('location');
    } catch (err: any) {
      setLocError('Could not get your location. Please try again.');
    } finally {
      setLocating(false);
    }
  };

  const handlePay = async () => {
    if (!service || !slot || !session || !coords) return;
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
          vendor_service_id: service.id,
          scheduled_at: slot.toISOString(),
          user_location_lat: coords.lat,
          user_location_lng: coords.lng,
          user_location_address: locAddress || null,
          access_building: access.building || null,
          access_floor: access.floor || null,
          access_flat: access.flat || null,
          access_code: access.gateCode || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Payment initialisation failed');

      setPaystackUrl(`https://checkout.paystack.com/${data.access_code}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  const handleWebViewNav = (url: string) => {
    if (url.startsWith('https://checkout.paystack.com/')) return true;
    if (url.includes('cancel') || url.includes('declined') || url.includes('close')) {
      setPaystackUrl(null);
      setError('Payment was cancelled.');
      return false;
    }
    // Any redirect away from Paystack checkout = payment complete
    setPaystackUrl(null);
    router.replace('/(tabs)/bookings');
    return false;
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerBack}>
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
      {step === 3 && service && slot && step3View === 'review' && (
        <Step3Review
          service={service}
          slot={slot}
          isAutoAccept={slotIsAutoAccept}
          access={access}
          setAccess={setAccess}
          onConfirmLocation={handleConfirmLocation}
          locating={locating}
          locError={locError}
        />
      )}
      {step === 3 && service && slot && step3View === 'location' && coords && (
        <Step3Location
          service={service}
          slot={slot}
          isAutoAccept={slotIsAutoAccept}
          coords={coords}
          locAddress={locAddress}
          access={access}
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

  // Review / summary
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: -8 },
  optionalTag: { fontSize: 13, fontWeight: '400', color: Colors.textMuted },
  accessHint: { fontSize: 13, color: Colors.textSecondary, marginTop: -8 },
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
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerValue: { fontSize: 15, color: Colors.text },
  pickerPlaceholder: { fontSize: 15, color: Colors.textMuted },
  pickerChevron: { fontSize: 20, color: Colors.textMuted },
  accessPrivacyNote: {
    backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 12,
  },
  accessPrivacyText: { fontSize: 13, color: Colors.primary, lineHeight: 18 },

  // Floor picker modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 40, maxHeight: '70%',
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginVertical: 12,
  },
  pickerTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.text,
    marginBottom: 12, textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pickerOptionText: { fontSize: 16, color: Colors.text },
  pickerOptionSelected: { color: Colors.primary, fontWeight: '700' },
  pickerCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700' },

  // Map + location
  mapThumb: { width: SCREEN_W, height: 200 },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  addressIcon: { fontSize: 16, lineHeight: 22 },
  addressText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20, fontWeight: '500' },

  // Access summary card (Step 3b)
  accessSummaryCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  accessSummaryTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  accessDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  accessDetailLabel: { fontSize: 13, color: Colors.textSecondary },
  accessDetailValue: { fontSize: 13, fontWeight: '600', color: Colors.text },

  // Info box
  infoBox: { backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 14 },
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
