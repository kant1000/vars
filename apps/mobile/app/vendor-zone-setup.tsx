// ============================================================
// VARS — Vendor Zone Setup
// Vendor sets their operating zone for Auto-Accept.
//
// • Map centred on the vendor's base location (read-only marker)
// • Location is changed through the shared LocationPicker, the same
//   control customers use — base_location is the single vendor location,
//   so there is exactly one editor for it
// • Radius selector: 1 / 1.5 km
// • Toggle to enable/disable auto-accept
// • Save calls vendor-set-zone (radius + toggle only; the centre is owned
//   by vendor-set-base-location)
// • Circle overlay shows the zone boundary
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, LayoutAnimation, StyleSheet, Text,
  TouchableOpacity, View, ScrollView,
} from 'react-native';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VarsSwitch } from '@/components/ui';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_WIDTH } from '@/constants/colors';
import { LocationPicker, ResolvedLocation, reverseGeocode } from '@/components/LocationPicker';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const RADII = [1, 1.5] as const;
type RadiusKm = typeof RADII[number];

// Lagos default centre — used if location permission denied
const LAGOS_DEFAULT = { latitude: 6.5244, longitude: 3.3792 };

// ── Effective-day helpers ─────────────────────────────────────
// After the last slot ends at 22:00 the working day is over; treat
// tomorrow as the effective day so setup always targets the next session.
function getEffectiveToday(): Date {
  const now = new Date();
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (now.getHours() >= 22) d.setDate(d.getDate() + 1);
  return d;
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function VendorZoneSetup() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAutoAcceptModal, setShowAutoAcceptModal] = useState(false);
  // Track the value of autoEnabled when this screen was first loaded so we
  // only show the liability modal when the vendor is actively turning it ON.
  const wasAlreadyEnabled = useRef(false);

  const effectiveDay     = getEffectiveToday();
  const effectiveDateKey = toLocalDateStr(effectiveDay);
  const effectiveDateStr = effectiveDay.toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const [pinLat, setPinLat]     = useState(LAGOS_DEFAULT.latitude);
  const [pinLng, setPinLng]     = useState(LAGOS_DEFAULT.longitude);
  const [hasBaseLocation, setHasBaseLocation] = useState(false);
  const [locationLabel, setLocationLabel] = useState('');
  const [radius, setRadius]     = useState<RadiusKm>(1);
  const [autoEnabled, setAutoEnabled] = useState(false);

  // The zone centre is base_location, so there is no GPS read here any more —
  // the vendor's stored location is the single source, and changing it goes
  // through the LocationPicker below like it does on their profile.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: vendor }, { data: base }] = await Promise.all([
        supabase
          .from('vendors')
          .select('auto_accept_zone_radius_km, auto_accept_enabled')
          .eq('id', user.id)
          .single(),
        supabase
          .rpc('get_vendor_base_location', { p_vendor_id: user.id })
          .maybeSingle() as Promise<{ data: { lat: number; lng: number } | null }>,
      ]);

      if (base?.lat != null && base?.lng != null) {
        setPinLat(base.lat);
        setPinLng(base.lng);
        setHasBaseLocation(true);
        setLocationLabel(await reverseGeocode(base.lat, base.lng));
      }
      if (vendor?.auto_accept_zone_radius_km) {
        setRadius(vendor.auto_accept_zone_radius_km as RadiusKm);
      }
      if (vendor?.auto_accept_enabled != null) {
        setAutoEnabled(vendor.auto_accept_enabled);
        wasAlreadyEnabled.current = vendor.auto_accept_enabled;
      }

      setLoading(false);
    })();
  }, []);

  // Persist immediately on confirm, same as the customer's location bar:
  // the picked location is the stored one, no separate save step. The edge
  // function also clears any daily zone confirmation, since the zone has moved.
  const handleLocationConfirm = useCallback(async (loc: ResolvedLocation) => {
    setPinLat(loc.lat);
    setPinLng(loc.lng);
    setHasBaseLocation(true);
    setLocationLabel(loc.address || 'Current area');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-set-base-location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save your location');
    } catch (err: any) {
      Alert.alert('Location not saved', err.message ?? 'Please try again.');
    }
  }, []);

  const handleSave = () => {
    // Auto-accept has no centre to work from without a stored location.
    if (autoEnabled && !hasBaseLocation) {
      Alert.alert('Set your location', 'Choose where you work from before turning on auto-accept.');
      return;
    }
    // Show the liability modal the first time a vendor turns auto-accept on.
    if (autoEnabled && !wasAlreadyEnabled.current) {
      setShowAutoAcceptModal(true);
      return;
    }
    commitSave();
  };

  const commitSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-set-zone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          // No lat/lng: the zone centre is base_location, saved separately by
          // handleLocationConfirm the moment the vendor picks it.
          radius_km: radius,
          auto_accept_enabled: autoEnabled,
          // Pass local date so confirmed_date is written atomically in the same
          // DB update — avoids a race with a separate confirm-zone call.
          effective_date: autoEnabled ? effectiveDateKey : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save zone settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  const region: Region = {
    latitude: pinLat,
    longitude: pinLng,
    latitudeDelta: (radius * 2) / 111 * 1.8,
    longitudeDelta: (radius * 2) / 111 * 1.8,
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(vendor-tabs)/profile')} style={s.backBtn} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Auto-Accept Zone</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Map */}
        <View style={s.mapWrap}>
          <MapView
            ref={mapRef}
            style={s.map}
            region={region}
            onRegionChangeComplete={() => {
              // Don't follow region changes — pin is draggable
            }}
          >
            {/* Zone circle */}
            <Circle
              center={{ latitude: pinLat, longitude: pinLng }}
              radius={radius * 1000} // metres
              fillColor={theme.color.ink + '14'}
              strokeColor={theme.color.ink}
              strokeWidth={BORDER_WIDTH.regular}
            />
            {/* Read-only marker: the centre is base_location, changed through
                the picker below so there is only ever one editor for it. */}
            <Marker
              coordinate={{ latitude: pinLat, longitude: pinLng }}
              title="Your location"
              pinColor={theme.color.ink}
            />
          </MapView>
          <View style={s.mapHint}>
            <Text style={s.mapHintText}>
              {hasBaseLocation ? 'Your zone sits around where you work from' : 'Set where you work from below'}
            </Text>
          </View>
        </View>

        <View style={s.controls}>
          {/* Location — same control customers use to set theirs */}
          <Text style={s.sectionLabel}>Where you work from</Text>
          <LocationPicker
            theme={theme}
            value={hasBaseLocation ? { lat: pinLat, lng: pinLng, address: locationLabel } : null}
            onConfirm={handleLocationConfirm}
            placeholder="Set where you work from"
            sheetTitle="Where should clients find you?"
            sheetSubtitle="This sets your place in search results, your travel fees, and the centre of your auto-accept zone."
          />

          {/* Active date */}
          <View style={s.dateRow}>
            <Text style={s.dateLabelText}>⚡ Auto-accept for</Text>
            <Text style={s.dateValueText}>{effectiveDateStr}</Text>
          </View>

          {/* Radius selector */}
          <Text style={s.sectionLabel}>Zone radius</Text>
          <View style={s.radiusRow}>
            {RADII.map((r) => (
              <TouchableOpacity
                key={r}
                style={[s.radiusChip, radius === r && s.radiusChipActive]}
                onPress={() => setRadius(r)}
              >
                <Text style={[s.radiusChipText, radius === r && s.radiusChipTextActive]}>
                  {r} km
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Auto-accept toggle */}
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Enable auto-accept</Text>
              <Text style={s.toggleSub}>
                Bookings in your zone will be instantly confirmed.
                You'll have 5 minutes to cancel if needed.
              </Text>
            </View>
            <VarsSwitch
              value={autoEnabled}
              onChange={(v) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAutoEnabled(v); }}
              theme={theme}
            />
          </View>

          {/* Info note */}
          {autoEnabled && (
            <Text style={s.infoText}>
              Bookings in your zone will be instantly confirmed. You have 5 minutes to cancel penalty-free.
            </Text>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, saving && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
              : <Text style={s.saveBtnText}>Save zone settings</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showAutoAcceptModal}
        title="You're going live on auto-accept"
        body={
          `Bookings in your zone for ${effectiveDateStr} are yours instantly. No review needed, just show up.\n\nYour schedule handles the spacing. No two jobs will ever overlap.\n\nYou have 5 minutes to cancel any auto-accepted booking, penalty-free.`
        }
        confirmLabel="Turn on auto-accept"
        dismissLabel="Not yet"
        onConfirm={() => { setShowAutoAcceptModal(false); commitSave(); }}
        onDismiss={() => setShowAutoAcceptModal(false)}
      />
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText:    { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },

    mapWrap: { position: 'relative' },
    map: { width: '100%', height: 300 },
    mapHint: {
      position: 'absolute', bottom: 8, left: 0, right: 0,
      alignItems: 'center',
    },
    mapHintText: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      color: '#FFF', fontSize: 12, fontWeight: '600',
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5,
      overflow: 'hidden',
    },

    controls: { padding: 20, gap: 20 },

    dateRow: { backgroundColor: theme.color.ink, borderRadius: 5, padding: 14 },
    dateLabelText: {
      fontSize: 11, fontWeight: '700', color: theme.color.inverseInk + 'A6',
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
    },
    dateValueText: { fontSize: 18, fontWeight: '800', color: theme.color.inverseInk },

    sectionLabel: {
      fontSize: 13, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: -12,
    },
    radiusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    radiusChip: {
      paddingHorizontal: 16, paddingVertical: 10,
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
    },
    radiusChipActive: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    radiusChipText:   { fontSize: 14, fontWeight: '700', color: theme.color.inkMuted },
    radiusChipTextActive: { color: theme.color.inverseInk },

    toggleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: 'transparent', borderRadius: 5, padding: 16,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.ink,
    },
    toggleLabel: { fontSize: 15, fontWeight: '700', color: theme.color.ink, marginBottom: 3 },
    toggleSub:   { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },

    infoBox: {
      backgroundColor: 'transparent', borderRadius: 5, padding: 14,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
    },
    infoTitle: { fontSize: 13, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    infoText:  { fontSize: 13, color: theme.color.inkMuted, lineHeight: 20 },

    saveBtn: {
      height: 56, backgroundColor: theme.color.ink,
      borderRadius: 5, alignItems: 'center', justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.5 },
    saveBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '800' },
  });
}
