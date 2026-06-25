// ============================================================
// VARS — Booking Flow (V2)
// Receives service_ids[] + total_amount from vendor profile.
// Step 1: Pick date + time slot
// Step 2a: Review + access details
// Step 2b: Location confirmation + pay
//
// Card verification: first-time customers (no stored paystack_authorization_code)
// are shown a one-time, non-refundable ₦50 card verification step before the
// booking is created. Returning customers skip this entirely.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView, StyleSheet, Text, TouchableOpacity,
  View, TextInput, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtDuration, fmtTime, fmtDate } from '@/lib/format';
import { LightningIcon, CheckIcon, PinIcon } from '@/components/icons';
import { Calendar, toDateId, fromDateId } from '@marceloterreiro/flash-calendar';
import { BottomSheetModal, BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { BOOKING_STATUS, TRANSPORT_FEE_TIERS, BASE_RADIUS_KM } from '@vars/shared';
import * as Haptics from 'expo-haptics';
import { usePostHog, EVENTS } from '@/lib/analytics';

const SCREEN_W = Dimensions.get('window').width;
const BLOCK_MINS = 30;
const CHIP_W = (SCREEN_W - 32 - 8 * 3) / 4;
const CONFIRM_BAR_HEIGHT = 86;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ────────────────────────────────────────────────────
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

// ── Haversine distance (km) — client-side preview only ───────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcPreviewSurcharge(
  userLat: number, userLng: number,
  zoneLat: number, zoneLng: number
): number {
  const dist = haversineKm(userLat, userLng, zoneLat, zoneLng);
  const kmOver = Math.max(0, dist - BASE_RADIUS_KM);
  if (kmOver === 0) return 0;
  const tier = TRANSPORT_FEE_TIERS.find((t) => kmOver > t.minKmOver && kmOver <= t.maxKmOver);
  return tier?.feeKobo ?? 0;
}

// ── Helpers ──────────────────────────────────────────────────
function sanitize(text: string, maxLen: number) {
  return text.replace(/@/g, '').replace(/\d{7,}/g, '').slice(0, maxLen);
}
function addMinutes(d: Date, m: number) {
  return new Date(d.getTime() + m * 60000);
}

// ── Step indicator ────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const labels = ['Schedule', 'Review'];
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
            {i < labels.length - 1 && <View style={[sb.line, done && sb.lineDone]} />}
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

// ── Step 1: Date + time picker ────────────────────────────────
function Step1({
  vendorId, totalDurationBlocks, onConfirm,
}: {
  vendorId: string;
  totalDurationBlocks: number;
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
      .in('status', [BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED])
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString());

    const generated: { time: Date; available: boolean; autoAccept: boolean }[] = [];
    let cursor = new Date(dayStart);
    const now = new Date();
    const BLOCK_MS = BLOCK_MINS * 60 * 1000;
    const nextSlotStart = new Date(Math.floor(now.getTime() / BLOCK_MS) * BLOCK_MS + BLOCK_MS);

    while (cursor < dayEnd) {
      const slotStart = new Date(cursor);
      const slotEnd = addMinutes(slotStart, totalDurationBlocks * BLOCK_MINS);

      let available = true;
      let autoAccept = false;

      if (slotStart <= nextSlotStart) { available = false; }

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
  }, [vendorId, totalDurationBlocks]);

  useEffect(() => { loadSlots(selectedDay); }, [selectedDay, loadSlots]);

  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [selectedAutoAccept, setSelectedAutoAccept] = useState(false);

  useEffect(() => { setSelectedSlot(null); setSelectedAutoAccept(false); }, [selectedDay]);

  const selectedEnd = selectedSlot
    ? addMinutes(selectedSlot, totalDurationBlocks * BLOCK_MINS)
    : null;

  const getSlotRole = (t: Date): 'start' | 'covered' | null => {
    if (!selectedSlot || !selectedEnd) return null;
    if (t.getTime() === selectedSlot.getTime()) return 'start';
    if (t > selectedSlot && t < selectedEnd) return 'covered';
    return null;
  };

  const slotRows: typeof slots[] = [];
  for (let i = 0; i < slots.length; i += 4) slotRows.push(slots.slice(i, i + 4));

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: selectedSlot ? CONFIRM_BAR_HEIGHT + 16 : 40 }}>
        <Text style={[s.stepTitle, { margin: 16 }]}>When works for you?</Text>

        <Calendar
          calendarMonthId={toDateId(new Date(days[0].getFullYear(), days[0].getMonth(), 1))}
          calendarMinDateId={toDateId(days[0])}
          calendarMaxDateId={toDateId(days[days.length - 1])}
          calendarActiveDateRanges={[{
            startId: toDateId(selectedDay),
            endId: toDateId(selectedDay),
          }]}
          onCalendarDayPress={(dateId) => setSelectedDay(fromDateId(dateId))}
          theme={{
            itemDay: {
              active: () => ({
                container: { backgroundColor: Colors.primary },
                content: { color: '#FFF' },
              }),
              today: () => ({
                content: { color: Colors.primary, fontWeight: '700' },
              }),
            },
            rowMonth: {
              content: { color: Colors.text, fontWeight: '700', fontSize: 15 },
            },
          }}
        />

        {slots.some((sl) => sl.available && sl.autoAccept) && (
          <View style={s.autoAcceptLegend}>
            <Text style={s.autoAcceptLegendText}>⚡ Instant confirm — no waiting</Text>
          </View>
        )}

        {loadingSlots ? (
          <View style={s.centered}><ScissorsLoader size="small" color="dark" /></View>
        ) : (
          <View style={s.slotGrid}>
            {slotRows.map((row, ri) => {
              const cells: React.ReactNode[] = [];
              let ci = 0;
              while (ci < row.length) {
                const sl = row[ci];
                const role = getSlotRole(sl.time);
                if (role === 'start') {
                  let span = 1;
                  while (ci + span < row.length && getSlotRole(row[ci + span].time) === 'covered') span++;
                  const mergedW = CHIP_W * span + 8 * (span - 1);
                  cells.push(
                    <TouchableOpacity
                      key={sl.time.toISOString()}
                      style={[s.slot, s.slotSelected, { width: mergedW }]}
                      onPress={() => { setSelectedSlot(null); setSelectedAutoAccept(false); }}
                      activeOpacity={0.85}
                    >
                      <Text style={[s.slotText, s.slotTextSelected]}>{fmtTime(sl.time)}</Text>
                      {sl.autoAccept && <LightningIcon size={9} color="#FFF" />}
                    </TouchableOpacity>
                  );
                  ci += span;
                } else if (role === 'covered') {
                  cells.push(
                    <View key={sl.time.toISOString()} style={[s.slot, s.slotCovered, { width: CHIP_W }]} />
                  );
                  ci++;
                } else {
                  cells.push(
                    <TouchableOpacity
                      key={sl.time.toISOString()}
                      style={[s.slot, { width: CHIP_W }, !sl.available && s.slotUnavailable, sl.available && sl.autoAccept && s.slotAutoAccept]}
                      onPress={() => { if (sl.available) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedSlot(sl.time); setSelectedAutoAccept(sl.autoAccept); } }}
                      disabled={!sl.available}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.slotText, !sl.available && s.slotTextUnavailable, sl.available && sl.autoAccept && s.slotTextAutoAccept]}>
                        {fmtTime(sl.time)}
                      </Text>
                      {sl.available && sl.autoAccept && <LightningIcon size={9} color={Colors.pioneerGold} />}
                    </TouchableOpacity>
                  );
                  ci++;
                }
              }
              while (cells.length < 4) {
                cells.push(<View key={`pad-${ri}-${cells.length}`} style={{ width: CHIP_W }} />);
              }
              return <View key={ri} style={s.slotRow}>{cells}</View>;
            })}
          </View>
        )}
      </ScrollView>

      {selectedSlot && (
        <View style={s.confirmBar}>
          <TouchableOpacity
            style={s.confirmBtn}
            onPress={() => onConfirm(selectedSlot, selectedAutoAccept)}
            activeOpacity={0.88}
          >
            <Text style={s.confirmBtnText}>
              Confirm {fmtTime(selectedSlot)} – {fmtTime(addMinutes(selectedSlot, totalDurationBlocks * BLOCK_MINS))} →
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

// ── Step 2a: Review + access details ─────────────────────────
function Step2Review({
  serviceSummary, totalDurationBlocks, totalServiceKobo,
  slot, isAutoAccept,
  access, setAccess,
  onConfirmLocation, locating, locError,
}: {
  serviceSummary: string;
  totalDurationBlocks: number;
  totalServiceKobo: number;
  slot: Date;
  isAutoAccept: boolean;
  access: AccessDetails;
  setAccess: (a: AccessDetails) => void;
  onConfirmLocation: () => void;
  locating: boolean;
  locError: string | null;
}) {
  const floorSheetRef = useRef<BottomSheetModal>(null);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <Text style={s.stepTitle}>Review your booking</Text>

        <View style={s.summaryCard}>
          <Row label="Service" value={serviceSummary} />
          <Row label="Duration" value={fmtDuration(totalDurationBlocks)} />
          <Row label="Date" value={fmtDate(slot)} />
          <Row label="Time" value={`${fmtTime(slot)} – ${fmtTime(addMinutes(slot, totalDurationBlocks * BLOCK_MINS))}`} />
          <View style={s.divider} />
          <Row label="Total" value={fmtPrice(totalServiceKobo)} bold />
        </View>

        <Text style={s.sectionHeading}>Access details <Text style={s.optionalTag}>(optional)</Text></Text>
        <Text style={s.accessHint}>Help your vendor find you faster.</Text>

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

        <View>
          <Text style={s.fieldLabel}>Floor</Text>
          <TouchableOpacity
            style={[s.textInput, s.pickerRow]}
            onPress={() => floorSheetRef.current?.present()}
            activeOpacity={0.8}
          >
            <Text style={access.floor ? s.pickerValue : s.pickerPlaceholder}>
              {access.floor || 'Select floor'}
            </Text>
            <Text style={s.pickerChevron}>›</Text>
          </TouchableOpacity>
        </View>

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

        <View>
          <Text style={s.fieldLabel}>Gate / access code</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. 1234"
            placeholderTextColor={Colors.textMuted}
            value={access.gateCode}
            onChangeText={(t) => setAccess({ ...access, gateCode: sanitize(t, 20) })}
            returnKeyType="done"
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
            ? <ScissorsLoader size="small" color="light" />
            : <Text style={s.payBtnText}>Confirm location →</Text>
          }
        </TouchableOpacity>
      </View>

      <BottomSheetModal ref={floorSheetRef} snapPoints={['50%']} enableDynamicSizing={false}>
        <Text style={[s.pickerTitle, { paddingHorizontal: 16, paddingTop: 8 }]}>Select floor</Text>
        <BottomSheetFlatList
          data={FLOOR_OPTIONS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.pickerOption}
              onPress={() => { setAccess({ ...access, floor: item }); floorSheetRef.current?.dismiss(); }}
              activeOpacity={0.7}
            >
              <Text style={[s.pickerOptionText, access.floor === item && s.pickerOptionSelected]}>
                {item}
              </Text>
              {access.floor === item && <CheckIcon size={16} color={Colors.primary} />}
            </TouchableOpacity>
          )}
        />
      </BottomSheetModal>
    </>
  );
}

// ── Step 2b: Location confirmation + pay ─────────────────────
function Step2Location({
  serviceSummary, totalDurationBlocks, totalServiceKobo,
  slot, isAutoAccept,
  coords, locAddress, access,
  vendorZone,
  onPay, paying,
}: {
  serviceSummary: string;
  totalDurationBlocks: number;
  totalServiceKobo: number;
  slot: Date;
  isAutoAccept: boolean;
  coords: { lat: number; lng: number };
  locAddress: string;
  access: AccessDetails;
  vendorZone: { lat: number; lng: number } | null;
  onPay: () => void;
  paying: boolean;
}) {
  const [mapReady, setMapReady] = useState(false);

  const hasAccess = access.building || access.floor || access.flat || access.gateCode;

  const transportFeeKobo =
    vendorZone != null
      ? calcPreviewSurcharge(coords.lat, coords.lng, vendorZone.lat, vendorZone.lng)
      : 0;
  const totalKobo = totalServiceKobo + transportFeeKobo;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
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
          <View style={s.addressRow}>
            <PinIcon size={16} color={Colors.text} />
            <Text style={s.addressText} numberOfLines={2}>{locAddress || 'Your current location'}</Text>
          </View>

          {hasAccess && (
            <View style={s.accessSummaryCard}>
              <Text style={s.accessSummaryTitle}>Access details</Text>
              {access.building ? <AccessRow label="Building" value={access.building} /> : null}
              {access.floor ? <AccessRow label="Floor" value={access.floor} /> : null}
              {access.flat ? <AccessRow label="Flat/unit" value={access.flat} /> : null}
              {access.gateCode ? <AccessRow label="Gate code" value={access.gateCode} /> : null}
            </View>
          )}

          <View style={s.summaryCard}>
            <Row label="Service" value={serviceSummary} />
            <Row label="Date" value={fmtDate(slot)} />
            <Row label="Time" value={`${fmtTime(slot)} – ${fmtTime(addMinutes(slot, totalDurationBlocks * BLOCK_MINS))}`} />
            <View style={s.divider} />
            <Row label="Total" value={fmtPrice(totalKobo)} bold />
            {transportFeeKobo > 0 && (
              <Text style={s.transportNote}>
                Your stylist is travelling further to reach you — this price reflects that.
              </Text>
            )}
          </View>

          <View style={[s.infoBox, isAutoAccept && s.infoBoxAutoAccept]}>
            <Text style={[s.infoText, isAutoAccept && s.infoTextAutoAccept]}>
              {isAutoAccept
                ? '⚡ Instant confirm — your booking is confirmed right away.'
                : 'Your payment will be taken when your vendor sets off to you, not before.'}
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
            ? <ScissorsLoader size="small" color="light" />
            : <Text style={s.payBtnText}>Confirm booking — {fmtPrice(totalKobo)}</Text>
          }
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── Card Verification (one-time, ₦50, non-refundable) ────────
type CardVerifyPhase = 'disclosure' | 'webview' | 'polling' | 'failed';

function CardVerifyView({
  accessCode,
  amountKobo,
  phase,
  onStart,
  onNavRequest,
  onCancel,
  onRetry,
}: {
  accessCode: string;
  amountKobo: number;
  phase: CardVerifyPhase;
  onStart: () => void;
  onNavRequest: (url: string) => boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (phase === 'disclosure') {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20, justifyContent: 'center' }}>
        <Text style={[s.stepTitle, { textAlign: 'center' }]}>Card verification</Text>
        <Text style={{ fontSize: 15, color: Colors.textSecondary, lineHeight: 23, textAlign: 'center' }}>
          To protect you and your vendor, VARS requires a one-time, non-refundable{' '}
          <Text style={{ fontWeight: '800', color: Colors.text }}>{fmtPrice(amountKobo)}</Text>{' '}
          card verification. This confirms your card is active before your vendor travels to you.
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 }}>
          This is charged once per account, not per booking. It is not refundable.
        </Text>
        <TouchableOpacity style={[s.payBtn, { marginTop: 8 }]} onPress={onStart} activeOpacity={0.88}>
          <Text style={s.payBtnText}>Verify card — {fmtPrice(amountKobo)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 12 }} activeOpacity={0.7}>
          <Text style={{ fontSize: 14, color: Colors.textSecondary }}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase === 'webview') {
    return (
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: `https://checkout.paystack.com/${accessCode}` }}
          onShouldStartLoadWithRequest={(req) => onNavRequest(req.url)}
          startInLoadingState
          renderLoading={() => (
            <View style={[{ flex: 1 }, s.centered]}>
              <ScissorsLoader size="large" color="dark" />
            </View>
          )}
        />
      </View>
    );
  }

  if (phase === 'polling') {
    return (
      <View style={[{ flex: 1 }, s.centered]}>
        <ScissorsLoader size="large" color="dark" />
        <Text style={{ fontSize: 14, color: Colors.textSecondary, marginTop: 20, textAlign: 'center', paddingHorizontal: 32 }}>
          Verifying your card — this only takes a moment.
        </Text>
      </View>
    );
  }

  // failed
  return (
    <View style={[{ flex: 1, padding: 32 }, s.centered, { gap: 16 }]}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' }}>
        Verification timed out
      </Text>
      <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 }}>
        If you completed the payment, your verification should land shortly. Tap below to check.
      </Text>
      <TouchableOpacity style={s.payBtn} onPress={onRetry} activeOpacity={0.88}>
        <Text style={s.payBtnText}>Check again</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 12 }} activeOpacity={0.7}>
        <Text style={{ fontSize: 14, color: Colors.textSecondary }}>Cancel</Text>
      </TouchableOpacity>
    </View>
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
  const { vendorId, service_ids: serviceIdsParam, total_amount: totalAmountParam } = useLocalSearchParams<{
    vendorId: string;
    service_ids?: string;
    total_amount?: string;
  }>();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();

  // Parse incoming params from vendor profile
  const serviceIds: string[] = serviceIdsParam ? JSON.parse(serviceIdsParam) : [];

  // Fetched service details
  const [loadingServices, setLoadingServices] = useState(true);
  const [totalDurationBlocks, setTotalDurationBlocks] = useState(0);
  const [serviceSummary, setServiceSummary] = useState('');
  const [totalServiceKobo, setTotalServiceKobo] = useState(
    totalAmountParam ? parseInt(totalAmountParam, 10) : 0
  );

  useEffect(() => {
    if (!serviceIds.length) {
      router.back();
      return;
    }
    supabase
      .from('vendor_services')
      .select('id, service_name, price_kobo, duration_blocks')
      .in('id', serviceIds)
      .then(({ data }) => {
        if (!data || data.length === 0) { router.back(); return; }
        const names = data.map((sv) => sv.service_name as string);
        const summary =
          names.length === 1 ? names[0]
          : names.length === 2 ? `${names[0]} + ${names[1]}`
          : `${names[0]} + ${names.length - 1} more`;
        setServiceSummary(summary);
        setTotalDurationBlocks(data.reduce((acc, sv) => acc + (sv.duration_blocks as number), 0));
        setTotalServiceKobo(data.reduce((acc, sv) => acc + (sv.price_kobo as number), 0));
        setLoadingServices(false);
      });
  }, []);

  // Step 1 = Schedule, Step 2 = Review
  const [step, setStep] = useState(1);
  const [slot, setSlot] = useState<Date | null>(null);
  const [slotIsAutoAccept, setSlotIsAutoAccept] = useState(false);
  const [vendorZone, setVendorZone] = useState<{ lat: number; lng: number } | null>(null);

  const [step2View, setStep2View] = useState<'review' | 'location'>('review');
  const [access, setAccess] = useState<AccessDetails>(EMPTY_ACCESS);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locAddress, setLocAddress] = useState('');

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardVerify, setCardVerify] = useState<{
    accessCode: string;
    amountKobo: number;
    phase: CardVerifyPhase;
  } | null>(null);
  const cardVerifyPollingRef = useRef(false);

  useEffect(() => {
    if (!vendorId) return;
    supabase
      .from('vendors')
      .select('auto_accept_zone_lat, auto_accept_zone_lng')
      .eq('id', vendorId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.auto_accept_zone_lat != null && data?.auto_accept_zone_lng != null) {
          setVendorZone({ lat: data.auto_accept_zone_lat, lng: data.auto_accept_zone_lng });
        }
      });
  }, [vendorId]);

  const handleSelectSlot = (s: Date, isAutoAccept: boolean) => {
    posthog?.capture(EVENTS.SLOT_SELECTED, {
      vendor_id: vendorId,
      is_auto_accept: isAutoAccept,
    });
    setSlot(s);
    setSlotIsAutoAccept(isAutoAccept);
    setStep2View('review');
    setAccess(EMPTY_ACCESS);
    setLocError(null);
    setCoords(null);
    setLocAddress('');
    setStep(2);
  };

  const handleBack = () => {
    if (step === 2 && step2View === 'location') {
      setStep2View('review');
      return;
    }
    if (step > 1) { setStep(step - 1); return; }
    router.back();
  };

  const handleConfirmLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      setStep2View('location');
    } catch {
      setLocError('Could not get your location. Please try again.');
    } finally {
      setLocating(false);
    }
  };

  const submitBooking = useCallback(async () => {
    if (!slot || !coords) return;
    setPaying(true);
    setError(null);
    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess) { setError('Session expired. Please sign in again.'); setPaying(false); return; }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/paystack-initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.access_token}` },
        body: JSON.stringify({
          service_ids: serviceIds,
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
      if (!res.ok) throw new Error(data.error ?? 'Booking failed');

      posthog?.capture(EVENTS.PAYMENT_COMPLETED, { vendor_id: vendorId, booking_id: data.booking_id });
      router.replace('/(tabs)/bookings');
    } catch (err: any) {
      setError(err.message);
      setPaying(false);
    }
  }, [slot, coords, serviceIds, locAddress, access, vendorId]);

  const pollForCardVerify = useCallback(async () => {
    if (cardVerifyPollingRef.current) return;
    cardVerifyPollingRef.current = true;
    const { data: { session: sess } } = await supabase.auth.getSession();
    if (!sess) {
      cardVerifyPollingRef.current = false;
      setCardVerify(null);
      setError('Session expired. Please sign in again.');
      return;
    }
    for (let i = 0; i < 15; i++) {
      const { data } = await supabase
        .from('profiles')
        .select('paystack_authorization_code')
        .eq('id', sess.user.id)
        .single();
      if (data?.paystack_authorization_code) {
        cardVerifyPollingRef.current = false;
        setCardVerify(null);
        await submitBooking();
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    cardVerifyPollingRef.current = false;
    setCardVerify((cv) => cv ? { ...cv, phase: 'failed' } : null);
  }, [submitBooking]);

  const handleCardVerifyNav = useCallback((url: string): boolean => {
    if (url.startsWith('https://checkout.paystack.com/')) return true;
    if (url.includes('cancel') || url.includes('declined') || url.includes('close')) {
      setCardVerify((cv) => cv ? { ...cv, phase: 'disclosure' } : null);
      return false;
    }
    if (url === 'vars://card-verify-complete') {
      setCardVerify((cv) => cv ? { ...cv, phase: 'polling' } : null);
      pollForCardVerify();
      return false;
    }
    // Any other URL (3DS, bank OTP page, etc.) — allow through
    return true;
  }, [pollForCardVerify]);

  const handlePay = async () => {
    if (!slot || !coords) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog?.capture(EVENTS.PAYMENT_INITIATED, { vendor_id: vendorId, total_kobo: totalServiceKobo });
    setPaying(true);
    setError(null);

    try {
      const { data: { session: sess } } = await supabase.auth.getSession();
      if (!sess) { setError('Session expired. Please sign in again.'); setPaying(false); return; }

      // Check for stored card authorization
      const { data: profile } = await supabase
        .from('profiles')
        .select('paystack_authorization_code')
        .eq('id', sess.user.id)
        .single();

      if (!profile?.paystack_authorization_code) {
        // First-time customer — initiate ₦50 card verification before booking
        const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/paystack-verify-card`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.access_token}` },
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error ?? 'Could not start card verification');

        if (!verifyData.already_verified) {
          setPaying(false);
          setCardVerify({ accessCode: verifyData.access_code, amountKobo: verifyData.amount_kobo, phase: 'disclosure' });
          return;
        }
        // already_verified returned (race between check and verify call) — fall through
      }

      setPaying(false);
      await submitBooking();
    } catch (err: any) {
      setError(err.message);
      setPaying(false);
    }
  };

  if (loadingServices) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.centered}><ScissorsLoader size="large" color="dark" /></View>
      </View>
    );
  }

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

      {cardVerify ? (
        <CardVerifyView
          accessCode={cardVerify.accessCode}
          amountKobo={cardVerify.amountKobo}
          phase={cardVerify.phase}
          onStart={() => setCardVerify((cv) => cv ? { ...cv, phase: 'webview' } : null)}
          onNavRequest={handleCardVerifyNav}
          onCancel={() => setCardVerify(null)}
          onRetry={() => {
            setCardVerify((cv) => cv ? { ...cv, phase: 'polling' } : null);
            pollForCardVerify();
          }}
        />
      ) : (
        <>
          {step === 1 && (
            <Step1
              vendorId={vendorId!}
              totalDurationBlocks={totalDurationBlocks}
              onConfirm={handleSelectSlot}
            />
          )}
          {step === 2 && slot && step2View === 'review' && (
            <Step2Review
              serviceSummary={serviceSummary}
              totalDurationBlocks={totalDurationBlocks}
              totalServiceKobo={totalServiceKobo}
              slot={slot}
              isAutoAccept={slotIsAutoAccept}
              access={access}
              setAccess={setAccess}
              onConfirmLocation={handleConfirmLocation}
              locating={locating}
              locError={locError}
            />
          )}
          {step === 2 && slot && step2View === 'location' && coords && (
            <Step2Location
              serviceSummary={serviceSummary}
              totalDurationBlocks={totalDurationBlocks}
              totalServiceKobo={totalServiceKobo}
              slot={slot}
              isAutoAccept={slotIsAutoAccept}
              coords={coords}
              locAddress={locAddress}
              access={access}
              vendorZone={vendorZone}
              onPay={handlePay}
              paying={paying}
            />
          )}
        </>
      )}

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

  // Slots
  slotGrid: { paddingHorizontal: 16, gap: 8, marginTop: 16 },
  slotRow: { flexDirection: 'row', gap: 8 },
  slot: {
    paddingVertical: 10,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4,
  },
  slotUnavailable: { borderColor: Colors.border, backgroundColor: Colors.surface },
  slotAutoAccept: { borderColor: Colors.pioneerGold, backgroundColor: Colors.pioneerGoldSurface },
  slotSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotCovered: { backgroundColor: Colors.primary + '22', borderColor: Colors.primary + '55' },
  slotText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  slotTextUnavailable: { color: Colors.textMuted },
  slotTextAutoAccept: { color: Colors.pioneerGoldDark },
  slotTextSelected: { color: '#FFF' },
  autoAcceptLegend: {
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    backgroundColor: Colors.pioneerGoldSurface, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.pioneerGold + '30',
  },
  autoAcceptLegendText: { fontSize: 12, color: Colors.pioneerGoldDark, fontWeight: '600' },

  // Review / summary
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: -8 },
  optionalTag: { fontSize: 13, fontWeight: '400', color: Colors.textMuted },
  accessHint: { fontSize: 13, color: Colors.textSecondary, marginTop: -8 },
  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  summaryValueBold: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  textInput: {
    backgroundColor: Colors.surface, borderRadius: 5,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerValue: { fontSize: 15, color: Colors.text },
  pickerPlaceholder: { fontSize: 15, color: Colors.textMuted },
  pickerChevron: { fontSize: 20, color: Colors.textMuted },
  accessPrivacyNote: { backgroundColor: Colors.primaryLight, borderRadius: 5, padding: 12 },
  accessPrivacyText: { fontSize: 13, color: Colors.primary, lineHeight: 18 },
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

  // Map + location
  mapThumb: { width: SCREEN_W, height: 200 },
  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  addressText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20, fontWeight: '500' },
  accessSummaryCard: {
    backgroundColor: Colors.surface, borderRadius: 5,
    padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4,
  },
  accessSummaryTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  accessDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  accessDetailLabel: { fontSize: 13, color: Colors.textSecondary },
  accessDetailValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  transportNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },
  infoBox: { backgroundColor: Colors.primaryLight, borderRadius: 5, padding: 14 },
  infoBoxAutoAccept: { backgroundColor: Colors.pioneerGoldSurface },
  infoText: { fontSize: 13, color: Colors.primary, lineHeight: 19, fontWeight: '500' },
  infoTextAutoAccept: { color: Colors.pioneerGoldDark },

  // Slot confirm bar
  confirmBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 16,
  },
  confirmBtn: {
    height: 54, backgroundColor: Colors.primary,
    borderRadius: 5, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  // Pay button
  payWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: 20,
  },
  payBtn: {
    height: 58, backgroundColor: Colors.primary,
    borderRadius: 5, alignItems: 'center', justifyContent: 'center',
  },
  payBtnDisabled: { backgroundColor: Colors.textMuted },
  payBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },

});
