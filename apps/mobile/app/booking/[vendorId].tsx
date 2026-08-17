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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions, FlatList, LayoutAnimation,
  ScrollView, StyleSheet, Text, TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsInput, VarsSurface, VarsSwitch } from '@/components/ui';
import { PhoneInput } from '@/components/PhoneInput';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { Colors, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { fmtPrice, fmtDuration, fmtTime, fmtDate } from '@/lib/format';
import { LightningIcon, PinIcon } from '@/components/icons';
import { BOOKING_STATUS, TRANSPORT_FEE_TIERS, BASE_RADIUS_KM, CountryCode, normalizePhone, isValidPhone } from '@vars/shared';
import * as Haptics from 'expo-haptics';
import { usePostHog, EVENTS } from '@/lib/analytics';
import { LocationPicker, ResolvedLocation, reverseGeocode } from '@/components/LocationPicker';
import { clearPendingReturnTo } from '@/lib/pendingReturnTo';
import { migratePendingLocation } from '@/lib/pendingLocation';

const SCREEN_W = Dimensions.get('window').width;
const BLOCK_MINS = 30;
const CHIP_W = (SCREEN_W - 32 - 8 * 3) / 4;
const CONFIRM_BAR_HEIGHT = 86;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// ── Types ────────────────────────────────────────────────────
interface AccessDetails {
  building: string; // consolidated free-text: address, building, floor, landmarks
  gateCode: string;
}

interface RecipientDetails {
  forSelf: boolean;
  name: string;
  phone: string; // local digits only, see PhoneInput
  phoneCountry: CountryCode;
}

// ── Constants ────────────────────────────────────────────────
const EMPTY_ACCESS: AccessDetails = { building: '', gateCode: '' };
const EMPTY_RECIPIENT: RecipientDetails = { forSelf: true, name: '', phone: '', phoneCountry: '+234' };

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
  return text.replace(/@/g, '').replace(/(\d[\s.\-]{0,2}){7,}/g, '').replace(/\d{7,}/g, '').slice(0, maxLen);
}
function addMinutes(d: Date, m: number) {
  return new Date(d.getTime() + m * 60000);
}

// ── Step indicator ────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  const { theme } = useVarsTheme();
  const sb = useMemo(() => makeStylesSb(theme), [theme]);
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
function makeStylesSb(theme: VarsTheme) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: theme.color.bg, borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint },
    item: { alignItems: 'center', gap: 4 },
    dot: { width: 28, height: 28, borderRadius: 14, borderWidth: BORDER_WIDTH.thick, borderColor: theme.color.inkFaint, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
    dotDone: { backgroundColor: theme.color.accentBlue, borderColor: theme.color.accentBlue },
    dotActive: { borderColor: theme.color.accentBlue },
    dotText: { fontSize: 12, fontWeight: '700', color: theme.color.inkMuted },
    dotTextActive: { color: theme.color.accentBlue },
    label: { fontSize: 11, color: theme.color.inkMuted, fontWeight: '500' },
    labelActive: { color: theme.color.accentBlue, fontWeight: '700' },
    line: { flex: 1, height: 2, backgroundColor: theme.color.inkFaint, marginBottom: 14 },
    lineDone: { backgroundColor: theme.color.accentBlue },
  });
}

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

  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
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

        {/* 14-day horizontal strip — every date shown is always inside the
            bookable window, so there's no "past/disabled week" clutter or
            legend to explain (replaces the flash-calendar month grid). */}
        <FlatList
          horizontal
          data={days}
          keyExtractor={(d) => d.toISOString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.dateStrip}
          renderItem={({ item }) => {
            const isSelected = item.getTime() === selectedDay.getTime();
            const isToday = item.getTime() === days[0].getTime();
            return (
              <TouchableOpacity
                style={[s.dateChip, isSelected && s.dateChipSelected]}
                onPress={() => setSelectedDay(item)}
                activeOpacity={0.85}
              >
                <Text style={[s.dateChipWeekday, isSelected && s.dateChipTextSelected]}>
                  {item.toLocaleDateString('en-NG', { weekday: 'short' })}
                </Text>
                <Text style={[
                  s.dateChipDay,
                  isSelected && s.dateChipTextSelected,
                  !isSelected && isToday && s.dateChipDayToday,
                ]}>
                  {item.getDate()}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {slots.some((sl) => sl.available && sl.autoAccept) && (
          <View style={s.autoAcceptLegend}>
            <Text style={s.autoAcceptLegendText}>⚡ Instant confirm, no waiting</Text>
          </View>
        )}

        {loadingSlots ? (
          <View style={s.centered}><ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>
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
                      {sl.autoAccept && <LightningIcon size={9} color={theme.color.inverseInk} />}
                    </TouchableOpacity>
                  );
                  ci += span;
                } else if (role === 'covered') {
                  let span = 1;
                  while (ci + span < row.length && getSlotRole(row[ci + span].time) === 'covered') span++;
                  const mergedW = CHIP_W * span + 8 * (span - 1);
                  cells.push(
                    <View key={sl.time.toISOString()} style={[s.slot, s.slotCovered, { width: mergedW }]} />
                  );
                  ci += span;
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
              // Pad only a genuinely short row (the last row of the day, when the
              // slot count isn't a multiple of 4) — not based on cells.length, which
              // undercounts once a merged multi-slot pill collapses several slots
              // into a single element.
              for (let p = row.length; p < 4; p++) {
                cells.push(<View key={`pad-${ri}-${p}`} style={{ width: CHIP_W }} />);
              }
              return <View key={ri} style={s.slotRow}>{cells}</View>;
            })}
          </View>
        )}
      </ScrollView>

      {selectedSlot && (
        <View style={s.confirmBar}>
          <VarsButton
            theme={theme}
            onPress={() => onConfirm(selectedSlot, selectedAutoAccept)}
            label={`Confirm ${fmtTime(selectedSlot)} – ${fmtTime(addMinutes(selectedSlot, totalDurationBlocks * BLOCK_MINS))} →`}
          />
        </View>
      )}
    </>
  );
}

// ── Step 2a: Review + details (recipient / location / other) ─
function Step2Review({
  serviceSummary, totalDurationBlocks, totalServiceKobo,
  slot,
  access, setAccess,
  recipient, setRecipient, onToggleForSelf, customerName,
  coords, locAddress, onLocationConfirm,
  onContinue,
}: {
  serviceSummary: string;
  totalDurationBlocks: number;
  totalServiceKobo: number;
  slot: Date;
  access: AccessDetails;
  setAccess: (a: AccessDetails) => void;
  recipient: RecipientDetails;
  setRecipient: (r: RecipientDetails) => void;
  onToggleForSelf: (forSelf: boolean) => void;
  customerName: string;
  coords: { lat: number; lng: number } | null;
  locAddress: string;
  onLocationConfirm: (loc: ResolvedLocation) => void;
  onContinue: () => void;
}) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const recipientReady = recipient.forSelf || (
    recipient.name.trim().length > 0 && isValidPhone(recipient.phone, recipient.phoneCountry)
  );
  // Address details (full address/building/landmarks) are how the stylist
  // actually finds the place — required, and long enough to actually be
  // useful (a single word isn't a findable address). Gate/access code
  // stays optional, most addresses don't have one.
  const ADDRESS_MIN_LENGTH = 10;
  const addressTrimmed = access.building.trim();
  const addressTooShort = addressTrimmed.length > 0 && addressTrimmed.length < ADDRESS_MIN_LENGTH;
  const canContinue = !!coords && recipientReady && addressTrimmed.length >= ADDRESS_MIN_LENGTH;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <Text style={s.stepTitle}>Review your booking</Text>

        <VarsSurface theme={theme} elevation={1} style={s.summaryCard}>
          <Row label="Service" value={serviceSummary} s={s} />
          <Row label="Duration" value={fmtDuration(totalDurationBlocks)} s={s} />
          <Row label="Date" value={fmtDate(slot)} s={s} />
          <Row label="Time" value={`${fmtTime(slot)} – ${fmtTime(addMinutes(slot, totalDurationBlocks * BLOCK_MINS))}`} s={s} />
          <View style={s.divider} />
          <Row label="Total" value={fmtPrice(totalServiceKobo)} bold s={s} />
        </VarsSurface>

        <Text style={s.sectionHeading}>Details (optional)</Text>

        {/* ── Recipient ── */}
        <Text style={s.subHeading}>Recipient</Text>
        <VarsSwitch
          theme={theme}
          label="Booking for yourself?"
          value={recipient.forSelf}
          onChange={onToggleForSelf}
        />
        <VarsInput
          theme={theme}
          label="Name"
          placeholder="Who's this booking for?"
          value={recipient.forSelf ? customerName : recipient.name}
          onChangeText={(t) => setRecipient({ ...recipient, name: sanitize(t, 60) })}
          editable={!recipient.forSelf}
          style={recipient.forSelf ? s.inputDisabled : undefined}
          returnKeyType="next"
        />
        {!recipient.forSelf && (
          <View>
            <Text style={s.fieldLabel}>Phone number</Text>
            <PhoneInput
              value={recipient.phone}
              country={recipient.phoneCountry}
              onChangeValue={(digits) => setRecipient({ ...recipient, phone: digits })}
              onChangeCountry={(c) => setRecipient({ ...recipient, phoneCountry: c })}
            />
          </View>
        )}

        {/* ── Location — pre-filled from the confirmed Discover location when
            booking for yourself; tapping is the only way into the picker. ── */}
        <Text style={s.subHeading}>Location</Text>
        <LocationPicker
          theme={theme}
          value={coords ? { lat: coords.lat, lng: coords.lng, address: locAddress } : null}
          placeholder={recipient.forSelf ? 'Set your location' : "Set the recipient's location"}
          sheetTitle={recipient.forSelf ? 'Where should we send your stylist?' : "Where's this visit?"}
          onConfirm={onLocationConfirm}
        />

        {/* ── Other details ── */}
        <Text style={s.subHeading}>Other details</Text>

        <Text style={s.fieldLabel}>Address details <Text style={s.required}>*</Text></Text>
        <VarsInput
          theme={theme}
          placeholder="e.g. full address, building name, floor, landmarks"
          value={access.building}
          onChangeText={(t) => setAccess({ ...access, building: sanitize(t, 200) })}
          multiline
          style={s.addressDetailsInput}
          error={addressTooShort ? `Please add a bit more detail (min. ${ADDRESS_MIN_LENGTH} characters)` : undefined}
        />

        <View>
          <VarsInput
            theme={theme}
            label="Gate / access code (if needed)"
            placeholder="e.g. 1234"
            value={access.gateCode}
            onChangeText={(t) => setAccess({ ...access, gateCode: sanitize(t, 20) })}
            returnKeyType="done"
          />
          <Text style={s.accessPrivacyText}>
            Access details are only shared with your stylist 15 minutes before their arrival.
          </Text>
        </View>
      </ScrollView>

      <View style={s.payWrap}>
        <VarsButton
          theme={theme}
          disabled={!canContinue}
          onPress={onContinue}
          label="Continue →"
        />
      </View>
    </>
  );
}

// ── Step 2b: Location confirmation + pay ─────────────────────
function Step2Location({
  serviceSummary, totalDurationBlocks, totalServiceKobo,
  slot, isAutoAccept,
  coords, locAddress, access, recipient,
  vendorBaseLocation,
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
  recipient: RecipientDetails;
  vendorBaseLocation: { lat: number; lng: number } | null;
  onPay: () => void;
  paying: boolean;
}) {
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const hasAccess = access.building || access.gateCode;

  const transportFeeKobo =
    vendorBaseLocation != null
      ? calcPreviewSurcharge(coords.lat, coords.lng, vendorBaseLocation.lat, vendorBaseLocation.lng)
      : 0;
  const totalKobo = totalServiceKobo + transportFeeKobo;

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ padding: 20, gap: 16 }}>
          <VarsSurface theme={theme} elevation={1} style={s.addressRow}>
            <PinIcon size={16} color={theme.color.ink} />
            <Text style={s.addressText} numberOfLines={2}>{locAddress || 'Your current location'}</Text>
          </VarsSurface>

          {!recipient.forSelf && (
            <VarsSurface theme={theme} elevation={1} style={s.accessSummaryCard}>
              <Text style={s.accessSummaryTitle}>Recipient</Text>
              <AccessRow label="Name" value={recipient.name} s={s} />
              <AccessRow label="Phone" value={`${recipient.phoneCountry} ${recipient.phone}`} s={s} />
            </VarsSurface>
          )}

          {hasAccess && (
            <VarsSurface theme={theme} elevation={1} style={s.accessSummaryCard}>
              {access.building ? <AccessRow label="Address details" value={access.building} s={s} /> : null}
              {access.gateCode ? <AccessRow label="Gate code" value={access.gateCode} s={s} /> : null}
            </VarsSurface>
          )}

          <VarsSurface theme={theme} elevation={1} style={s.summaryCard}>
            <Row label="Service" value={serviceSummary} s={s} />
            <Row label="Date" value={fmtDate(slot)} s={s} />
            <Row label="Time" value={`${fmtTime(slot)} – ${fmtTime(addMinutes(slot, totalDurationBlocks * BLOCK_MINS))}`} s={s} />
            <View style={s.divider} />
            <Row label="Total" value={fmtPrice(totalKobo)} bold s={s} />
            {transportFeeKobo > 0 && (
              <Text style={s.transportNote}>
                Your stylist is travelling further to reach you, this price reflects that.
              </Text>
            )}
          </VarsSurface>

          <View style={[s.infoBox, isAutoAccept && s.infoBoxAutoAccept]}>
            <Text style={[s.infoText, isAutoAccept && s.infoTextAutoAccept]}>
              {isAutoAccept
                ? '⚡ Instant confirm: your booking is confirmed right away.'
                : 'Your payment will be taken when your stylist sets off to you, not before.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.payWrap}>
        <VarsButton
          theme={theme}
          loading={paying}
          onPress={onPay}
          disabled={paying}
          label={`Confirm booking · ${fmtPrice(totalKobo)}`}
        />
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
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  if (phase === 'disclosure') {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 20, justifyContent: 'center' }}>
        <Text style={[s.stepTitle, { textAlign: 'center' }]}>Card verification</Text>
        <Text style={{ fontSize: 15, color: theme.color.inkMuted, lineHeight: 23, textAlign: 'center' }}>
          To protect you and your stylist, VARS requires a one-time, non-refundable{' '}
          <Text style={{ fontWeight: '800', color: theme.color.ink }}>{fmtPrice(amountKobo)}</Text>{' '}
          card verification. This confirms your card is active before your stylist travels to you.
        </Text>
        <Text style={{ fontSize: 13, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 19 }}>
          This is charged once per account, not per booking. It is not refundable.
        </Text>
        <VarsButton
          theme={theme}
          onPress={onStart}
          label={`Verify card · ${fmtPrice(amountKobo)}`}
          style={{ marginTop: 8 }}
        />
        <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 12 }} activeOpacity={0.7}>
          <Text style={{ fontSize: 14, color: theme.color.inkMuted }}>Cancel</Text>
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
              <ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
            </View>
          )}
        />
      </View>
    );
  }

  if (phase === 'polling') {
    return (
      <View style={[{ flex: 1 }, s.centered]}>
        <ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
        <Text style={{ fontSize: 14, color: theme.color.inkMuted, marginTop: 20, textAlign: 'center', paddingHorizontal: 32 }}>
          Verifying your card, this only takes a moment.
        </Text>
      </View>
    );
  }

  // failed
  return (
    <View style={[{ flex: 1, padding: 32 }, s.centered, { gap: 16 }]}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: theme.color.ink, textAlign: 'center' }}>
        Verification timed out
      </Text>
      <Text style={{ fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 21 }}>
        If you completed the payment, your verification should land shortly. Tap below to check.
      </Text>
      <VarsButton theme={theme} onPress={onRetry} label="Check again" />
      <TouchableOpacity onPress={onCancel} style={{ alignItems: 'center', paddingVertical: 12 }} activeOpacity={0.7}>
        <Text style={{ fontSize: 14, color: theme.color.inkMuted }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value, bold, s }: { label: string; value: string; bold?: boolean; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, bold && s.summaryValueBold]}>{value}</Text>
    </View>
  );
}

function AccessRow({ label, value, s }: { label: string; value: string; s: ReturnType<typeof makeStyles> }) {
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
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const posthog = usePostHog();
  const { profile, user } = useAuth();

  // Parse incoming params from vendor profile
  const serviceIds: string[] = serviceIdsParam ? JSON.parse(serviceIdsParam) : [];

  // Whatever path got a guest here (direct, or via login → phone → terms),
  // this is the screen they were trying to reach — consume it here so it
  // doesn't linger for a future, unrelated login.
  useEffect(() => { clearPendingReturnTo(); }, []);

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
    // Mount-only by design: serviceIds is derived fresh from route params on every
    // render, and this is the booking flow — refetching on every render (rather than
    // once on entry) is not a change to make in a lint-only pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1 = Schedule, Step 2 = Review
  const [step, setStep] = useState(1);
  const [slot, setSlot] = useState<Date | null>(null);
  const [slotIsAutoAccept, setSlotIsAutoAccept] = useState(false);
  const [vendorBaseLocation, setVendorBaseLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [step2View, setStep2View] = useState<'review' | 'location'>('review');
  const [access, setAccess] = useState<AccessDetails>(EMPTY_ACCESS);
  const [recipient, setRecipient] = useState<RecipientDetails>(EMPTY_RECIPIENT);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locAddress, setLocAddress] = useState('');

  // The location already confirmed on the Discover tab (profiles.session_location) —
  // used to prefill Location here when booking for yourself. Booking for someone
  // else starts empty on purpose (their location, not necessarily the customer's own).
  const [defaultLocation, setDefaultLocation] = useState<ResolvedLocation | null>(null);
  useEffect(() => {
    (async () => {
      try {
        // A location confirmed as a guest on the Discover tab, then landed
        // straight here via the deferred-login route (pendingReturnTo) —
        // this screen may be the very first one to mount post-signup, so
        // it can't assume the Discover tab already migrated it.
        if (user?.id) {
          const migrated = await migratePendingLocation(user.id);
          if (migrated) {
            setDefaultLocation(migrated);
            return;
          }
        }
        const res = await supabase.rpc('get_my_session_location').maybeSingle();
        const data = res.data as { lat: number; lng: number } | null;
        if (data?.lat == null || data?.lng == null) return;
        const address = await reverseGeocode(data.lat, data.lng);
        setDefaultLocation({ lat: data.lat, lng: data.lng, address });
      } catch (err) {
        console.warn('[BookingFlow] failed to load session location', err);
      }
    })();
  }, [user?.id]);

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
      .rpc('get_vendor_base_location', { p_vendor_id: vendorId })
      .maybeSingle()
      .then(({ data }) => {
        if (data?.lat != null && data?.lng != null) {
          setVendorBaseLocation({ lat: data.lat, lng: data.lng });
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
    setRecipient(EMPTY_RECIPIENT);
    if (defaultLocation) {
      setCoords({ lat: defaultLocation.lat, lng: defaultLocation.lng });
      setLocAddress(defaultLocation.address);
    } else {
      setCoords(null);
      setLocAddress('');
    }
    setStep(2);
  };

  const handleBack = () => {
    // The header's back button stays mounted above CardVerifyView regardless
    // of phase (disclosure/webview/polling/failed) — without this check it
    // fell through to the step/router logic below, popping the screen stack
    // out from under the still-visible verification view instead of just
    // cancelling it.
    if (cardVerify) {
      setCardVerify(null);
      return;
    }
    if (step === 2 && step2View === 'location') {
      setStep2View('review');
      return;
    }
    if (step > 1) { setStep(step - 1); return; }
    router.back();
  };

  const handleLocationConfirm = (loc: ResolvedLocation) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCoords({ lat: loc.lat, lng: loc.lng });
    setLocAddress(loc.address);
  };

  const handleToggleForSelf = (forSelf: boolean) => {
    setRecipient((prev) => ({ ...prev, forSelf }));
    if (forSelf && defaultLocation) {
      setCoords({ lat: defaultLocation.lat, lng: defaultLocation.lng });
      setLocAddress(defaultLocation.address);
    } else if (!forSelf) {
      // Someone else's visit — don't assume it's at the customer's own location.
      setCoords(null);
      setLocAddress('');
    }
  };

  const handleContinueFromReview = () => {
    setStep2View('location');
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
          access_floor: null,
          access_flat: null,
          access_code: access.gateCode || null,
          recipient_name: recipient.forSelf ? null : recipient.name || null,
          recipient_phone: recipient.forSelf ? null : normalizePhone(recipient.phone, recipient.phoneCountry),
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
    // posthog is deliberately excluded: this is the booking-creation function
    // (submitBooking) — not changing its dependency array in a lint-only pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, coords, serviceIds, locAddress, access, recipient, vendorId]);

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
        <View style={s.centered}><ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerBack} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.headerBackText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Book a visit</Text>
        <View style={{ width: 36 }} />
      </View>

      <StepBar step={step} />

      <View style={{ flex: 1, position: 'relative' }}>
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
              access={access}
              setAccess={setAccess}
              recipient={recipient}
              setRecipient={setRecipient}
              onToggleForSelf={handleToggleForSelf}
              customerName={profile?.full_name ?? ''}
              coords={coords}
              locAddress={locAddress}
              onLocationConfirm={handleLocationConfirm}
              onContinue={handleContinueFromReview}
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
              recipient={recipient}
              vendorBaseLocation={vendorBaseLocation}
              onPay={handlePay}
              paying={paying}
            />
          )}
        </>
      )}
      </View>

    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerBackText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    stepTitle: { fontSize: 20, fontWeight: '800', color: theme.color.ink },
    // Overlay, not a flex sibling — unbounded error text must never push the
    // active step's content down (see PhoneInput's Tier 1 treatment for why).
    errorBanner: {
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      backgroundColor: theme.color.accentRed + '15', paddingHorizontal: 16, paddingVertical: 10,
    },
    errorText: { fontSize: 13, color: theme.color.accentRed, fontWeight: '500' },

    // Date strip
    dateStrip: { paddingHorizontal: 16, gap: 8 },
    dateChip: {
      width: 52, paddingVertical: 10,
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      alignItems: 'center', justifyContent: 'center', gap: 4,
    },
    dateChipSelected: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    dateChipWeekday: { fontSize: 11, fontWeight: '600', color: theme.color.inkMuted },
    dateChipDay: { fontSize: 16, fontWeight: '800', color: theme.color.ink },
    dateChipDayToday: { color: theme.color.accentBlue },
    dateChipTextSelected: { color: theme.color.inverseInk },

    // Slots
    slotGrid: { paddingHorizontal: 16, gap: 8, marginTop: 16 },
    slotRow: { flexDirection: 'row', gap: 8 },
    slot: {
      height: 40,
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4,
    },
    slotUnavailable: { borderColor: theme.color.inkFaint, backgroundColor: theme.color.surface2, opacity: 0.4 },
    slotAutoAccept: { borderColor: Colors.pioneerGold, backgroundColor: Colors.pioneerGoldSurface },
    slotSelected: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    slotCovered: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    slotText: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    slotTextUnavailable: { color: theme.color.inkMuted },
    slotTextAutoAccept: { color: Colors.pioneerGoldDark },
    slotTextSelected: { color: theme.color.inverseInk },
    autoAcceptLegend: {
      marginHorizontal: 16, marginBottom: 8, marginTop: 4,
      backgroundColor: Colors.pioneerGoldSurface, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: BORDER_WIDTH.thin, borderColor: Colors.pioneerGold + '30',
    },
    autoAcceptLegendText: { fontSize: 12, color: Colors.pioneerGoldDark, fontWeight: '600' },

    // Review / summary
    sectionHeading: { fontSize: 16, fontWeight: '700', color: theme.color.ink },
    subHeading: { fontSize: 12, fontWeight: '700', color: theme.color.inkMuted, textTransform: 'uppercase', marginTop: 4 },
    summaryCard: { padding: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    summaryLabel: { fontSize: 14, color: theme.color.inkMuted },
    summaryValue: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    summaryValueBold: { fontSize: 16, fontWeight: '800', color: theme.color.accentBlue },
    divider: { height: BORDER_WIDTH.thin, backgroundColor: theme.color.inkFaint, marginVertical: 6 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: theme.color.ink, marginBottom: 6 },
    required: { color: theme.color.accentRed },
    addressDetailsInput: {
      height: 90, paddingTop: 12, paddingBottom: 12, lineHeight: 20,
      textAlignVertical: 'top', includeFontPadding: false,
    },
    // Plain "VARS speaking" text — no border, no background (never a filled note box).
    accessPrivacyText: { fontSize: 13, color: theme.color.accentBlue, lineHeight: 18, marginTop: 8 },
    inputDisabled: { opacity: 0.5 },

    // Map + location
    addressRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12,
    },
    addressText: { flex: 1, fontSize: 14, color: theme.color.ink, lineHeight: 20, fontWeight: '500' },
    accessSummaryCard: { padding: 14, gap: 4 },
    accessSummaryTitle: { fontSize: 13, fontWeight: '700', color: theme.color.inkMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    accessDetailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    accessDetailLabel: { fontSize: 13, color: theme.color.inkMuted },
    accessDetailValue: { fontSize: 13, fontWeight: '600', color: theme.color.ink },
    transportNote: { fontSize: 12, color: theme.color.inkMuted, marginTop: 6, lineHeight: 17 },
    infoBox: { padding: 14 },
    infoBoxAutoAccept: { backgroundColor: Colors.pioneerGoldSurface, borderRadius: 5 },
    infoText: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 19, fontWeight: '500' },
    infoTextAutoAccept: { color: Colors.pioneerGoldDark },

    // Slot confirm bar
    confirmBar: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.color.bg,
      borderTopWidth: BORDER_WIDTH.thin, borderTopColor: theme.color.inkFaint,
      padding: 16,
    },
    // Pay button
    payWrap: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.color.bg,
      borderTopWidth: BORDER_WIDTH.thin, borderTopColor: theme.color.inkFaint,
      padding: 20,
    },
  });
}
