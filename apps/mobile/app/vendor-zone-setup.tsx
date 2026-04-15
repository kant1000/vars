// ============================================================
// VARS — Vendor Zone Setup
// Vendor sets their operating zone for Auto-Accept.
//
// • Map with draggable pin (react-native-maps)
// • Radius selector: 1 / 2 / 3 / 5 / 10 km
// • Toggle to enable/disable auto-accept
// • Save calls vendor-set-zone edge function
// • Circle overlay shows the zone boundary
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text,
  TouchableOpacity, View, Switch, ScrollView,
} from 'react-native';
import MapView, { Circle, Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const RADII = [1, 2, 3, 5, 10] as const;
type RadiusKm = typeof RADII[number];

// Lagos default centre — used if location permission denied
const LAGOS_DEFAULT = { latitude: 6.5244, longitude: 3.3792 };

export default function VendorZoneSetup() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pinLat, setPinLat]     = useState(LAGOS_DEFAULT.latitude);
  const [pinLng, setPinLng]     = useState(LAGOS_DEFAULT.longitude);
  const [radius, setRadius]     = useState<RadiusKm>(3);
  const [autoEnabled, setAutoEnabled] = useState(false);

  // Load existing zone from DB
  useEffect(() => {
    (async () => {
      // Request location for initial pin placement
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setPinLat(loc.coords.latitude);
        setPinLng(loc.coords.longitude);
      }

      // Fetch existing zone settings
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: vendor } = await supabase
        .from('vendors')
        .select(`
          auto_accept_zone_lat, auto_accept_zone_lng,
          auto_accept_zone_radius_km, auto_accept_enabled
        `)
        .eq('id', user.id)
        .single();

      if (vendor?.auto_accept_zone_lat != null) {
        setPinLat(vendor.auto_accept_zone_lat);
        setPinLng(vendor.auto_accept_zone_lng);
      }
      if (vendor?.auto_accept_zone_radius_km) {
        setRadius(vendor.auto_accept_zone_radius_km as RadiusKm);
      }
      if (vendor?.auto_accept_enabled != null) {
        setAutoEnabled(vendor.auto_accept_enabled);
      }

      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
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
          lat: pinLat,
          lng: pinLng,
          radius_km: radius,
          auto_accept_enabled: autoEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      Alert.alert(
        'Zone saved',
        autoEnabled
          ? 'Your auto-accept zone is set. Confirm it each morning before you start working.'
          : 'Zone saved. Enable auto-accept when you\'re ready to use it.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save zone settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
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
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
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
            onRegionChangeComplete={(r) => {
              // Don't follow region changes — pin is draggable
            }}
          >
            {/* Zone circle */}
            <Circle
              center={{ latitude: pinLat, longitude: pinLng }}
              radius={radius * 1000} // metres
              fillColor="rgba(212, 160, 23, 0.15)"
              strokeColor="#D4A017"
              strokeWidth={2}
            />
            {/* Draggable pin */}
            <Marker
              coordinate={{ latitude: pinLat, longitude: pinLng }}
              draggable
              onDragEnd={(e) => {
                setPinLat(e.nativeEvent.coordinate.latitude);
                setPinLng(e.nativeEvent.coordinate.longitude);
              }}
              title="Zone centre"
              description="Drag to reposition"
              pinColor="#D4A017"
            />
          </MapView>
          <View style={s.mapHint}>
            <Text style={s.mapHintText}>Drag the pin to set your zone centre</Text>
          </View>
        </View>

        <View style={s.controls}>
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
            <Switch
              value={autoEnabled}
              onValueChange={setAutoEnabled}
              trackColor={{ true: '#D4A017', false: Colors.border }}
              thumbColor={autoEnabled ? '#FFF' : Colors.textMuted}
            />
          </View>

          {/* Info box */}
          {autoEnabled && (
            <View style={s.infoBox}>
              <Text style={s.infoTitle}>How auto-accept works</Text>
              <Text style={s.infoText}>
                • Confirm your zone each morning before you start{'\n'}
                • Slots marked ⚡ in your calendar are auto-accepted{'\n'}
                • You get a 5-minute grace period to cancel penalty-free{'\n'}
                • Auto-accept pauses if you move more than {radius + 3} km from your zone centre
              </Text>
            </View>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, saving && s.btnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.saveBtnText}>Save zone settings</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText:    { fontSize: 28, color: Colors.primary, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },

  mapWrap: { position: 'relative' },
  map: { width: '100%', height: 300 },
  mapHint: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    alignItems: 'center',
  },
  mapHintText: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#FFF', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    overflow: 'hidden',
  },

  controls: { padding: 20, gap: 20 },

  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: -12,
  },
  radiusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radiusChip: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
  },
  radiusChipActive: { backgroundColor: '#D4A017', borderColor: '#D4A017' },
  radiusChipText:   { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  radiusChipTextActive: { color: '#FFF' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  toggleSub:   { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  infoBox: {
    backgroundColor: '#FFF8E6', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#D4A01730',
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#A07010', marginBottom: 6 },
  infoText:  { fontSize: 13, color: '#7A6000', lineHeight: 20 },

  saveBtn: {
    height: 56, backgroundColor: Colors.primary,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
