// ============================================================
// VARS — Vendor Onboarding Step 1: Profile (§6.1)
// Display name, base location, bio (optional, 150 char).
// Phone and email are pre-filled and read-only — sourced from
// the vendor_leads registration and cannot be changed here.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsInput, VarsSurface } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { sanitizeContent } from '@/lib/format';

// Same area names as the landing page's "Area you operate in" select
// (apps/landing/src/components/PioneerSection.tsx), minus "Other" (no
// coordinate to map it to). Coordinates are approximate neighborhood
// centroids, not precise addresses — consistent with the app's existing
// center + radius zone model (see vendor-zone-setup.tsx), not a street-level
// pin. Used as the fallback picker when GPS detection isn't usable (indoors,
// permission denied, wrong location) — no Google Places/Geocoding API
// involved, fully static.
const LAGOS_AREAS: { name: string; lat: number; lng: number }[] = [
  { name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
  { name: 'Lekki', lat: 6.4698, lng: 3.5852 },
  { name: 'Ikoyi', lat: 6.4541, lng: 3.4316 },
  { name: 'Ajah', lat: 6.4698, lng: 3.6015 },
  { name: 'Surulere', lat: 6.5059, lng: 3.3629 },
  { name: 'Yaba', lat: 6.5158, lng: 3.3707 },
  { name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
  { name: 'Gbagada', lat: 6.5533, lng: 3.3891 },
  { name: 'Ogba', lat: 6.6280, lng: 3.3459 },
  { name: 'Maryland', lat: 6.5700, lng: 3.3667 },
  { name: 'Magodo', lat: 6.6167, lng: 3.3833 },
  { name: 'Mushin', lat: 6.5333, lng: 3.3500 },
  { name: 'Festac', lat: 6.4667, lng: 3.2833 },
  { name: 'Isolo', lat: 6.5333, lng: 3.3167 },
  { name: 'Ikorodu', lat: 6.6194, lng: 3.5106 },
  { name: 'Alimosho', lat: 6.5833, lng: 3.2500 },
  { name: 'Agege', lat: 6.6167, lng: 3.3167 },
  { name: 'Oshodi', lat: 6.5500, lng: 3.3500 },
];

export default function Step1Profile() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [hasTriedDetect, setHasTriedDetect] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  // Pre-fill from vendor row — trigger copies data from vendor_leads at registration
  useEffect(() => {
    if (!user) return;
    supabase
      .from('vendors')
      .select('full_name, phone_number, email')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setDisplayName(data.full_name);
        if (data?.phone_number) setPhone(data.phone_number);
        if (data?.email) setEmail(data.email);
      });
  }, [user]);

  const handleDetectLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access to set your base area.');
        return;
      }
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      );
      const getPos = async () => {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: 200 });
        if (last) return last;
        return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      };
      const loc = await Promise.race([getPos(), timeoutPromise]);
      const [geo] = await Location.reverseGeocodeAsync(loc.coords);
      const label = [geo.district ?? geo.subregion, geo.city ?? geo.region]
        .filter(Boolean).join(', ');
      setLocationLabel(label || 'Current location');
      setLocationCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (err: any) {
      Alert.alert('Error', err.message === 'timeout' ? 'Location timed out. Try again.' : 'Could not detect location.');
    } finally {
      setIsLocating(false);
      setHasTriedDetect(true);
    }
  };

  // First tap auto-detects via GPS. Once that's been tried (success or not),
  // further taps open the area picker instead — lets a vendor correct a bad
  // GPS read or set up from somewhere other than their actual base.
  const handleLocationPress = () => {
    if (!hasTriedDetect) {
      handleDetectLocation();
    } else {
      setShowAreaPicker((v) => !v);
    }
  };

  const handleSelectArea = (area: { name: string; lat: number; lng: number }) => {
    setLocationLabel(area.name);
    setLocationCoords({ lat: area.lat, lng: area.lng });
    setShowAreaPicker(false);
  };

  const handleNext = async () => {
    if (!displayName.trim()) return Alert.alert('Required', 'Please enter your display name.');
    if (!locationCoords) return Alert.alert('Required', 'Please set your base location.');
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          full_name: displayName.trim(),
          bio: bio.trim() || null,
          base_location: `POINT(${locationCoords.lng} ${locationCoords.lat})`,
        })
        .eq('id', user.id);

      if (error) throw error;
      router.push('/vendor-onboarding/step-2-services');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell us about yourself.</Text>
        <Text style={styles.sub}>This is what clients will see on your profile.</Text>

        <View style={styles.form}>
          {/* Display name — editable */}
          <View>
            <VarsInput
              theme={theme}
              placeholder="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              maxLength={25}
            />
            <Text style={styles.fieldCaption}>
              This is how you'll appear to customers.
            </Text>
          </View>

          {/* Phone — read-only */}
          <View>
            <VarsSurface theme={theme} elevation={1} style={styles.lockedField}>
              <Text style={phone ? styles.lockedText : styles.lockedPlaceholder}>
                {phone || 'Phone number'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </VarsSurface>
            <Text style={styles.fieldCaption}>
              Phone used to sign in. Contact us if this needs updating.
            </Text>
          </View>

          {/* Email — read-only */}
          <View>
            <VarsSurface theme={theme} elevation={1} style={styles.lockedField}>
              <Text style={email ? styles.lockedText : styles.lockedPlaceholder}>
                {email || 'Email'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </VarsSurface>
            <Text style={styles.fieldCaption}>
              Email from your registration. Contact us if this needs updating.
            </Text>
          </View>

          {/* Base location */}
          <VarsButton
            theme={theme}
            variant="secondary"
            size="lg"
            loading={isLocating}
            onPress={handleLocationPress}
            label={locationCoords ? `📍 ${locationLabel}` : 'Set your base location'}
          />
          <Text style={styles.locationHelper}>
            Your primary operating area.
          </Text>

          {showAreaPicker && (
            <VarsSurface theme={theme} elevation={1} style={styles.areaPicker}>
              {LAGOS_AREAS.map((area) => (
                <TouchableOpacity
                  key={area.name}
                  style={styles.areaRow}
                  onPress={() => handleSelectArea(area)}
                >
                  <Text style={styles.areaRowText}>{area.name}</Text>
                </TouchableOpacity>
              ))}
            </VarsSurface>
          )}

          {/* Bio — optional, 150 char max per spec §4.3 */}
          <View>
            <VarsInput
              theme={theme}
              label="Bio (optional)"
              placeholder="What makes you great?"
              value={bio}
              onChangeText={(t) => setBio(sanitizeContent(t, 150))}
              multiline
              maxLength={150}
              style={styles.bioInput}
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <VarsButton
          theme={theme}
          size="lg"
          loading={isLoading}
          onPress={handleNext}
          label="Continue"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
    title: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    sub: { fontSize: 15, color: theme.color.inkMuted, marginBottom: 20 },
    form: { gap: 12 },
    footer: {
      borderTopWidth: BORDER_WIDTH.thin, borderTopColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
      paddingHorizontal: 24, paddingTop: 12,
    },
    lockedField: {
      height: 54, paddingHorizontal: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    lockedText: { fontSize: 16, color: theme.color.ink, flex: 1 },
    lockedPlaceholder: { fontSize: 16, color: theme.color.inkMuted, flex: 1 },
    lockBadge: {
      fontSize: 11, fontWeight: '600', color: theme.color.inkMuted,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 6, paddingVertical: 2,
    },
    fieldCaption: { fontSize: 12, color: theme.color.inkMuted, marginTop: 6, lineHeight: 16 },
    bioInput: {
      height: 90, paddingTop: 12, paddingBottom: 12, lineHeight: 20,
      textAlignVertical: 'top', includeFontPadding: false,
    },
    charCount: { fontSize: 12, color: theme.color.inkMuted, textAlign: 'right', marginTop: 4 },
    locationHelper: { fontSize: 13, color: theme.color.inkMuted, marginTop: -4, marginLeft: 4 },
    areaPicker: { marginTop: -4, overflow: 'hidden' },
    areaRow: {
      height: 48, paddingHorizontal: 16, justifyContent: 'center',
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    areaRowText: { fontSize: 15, color: theme.color.ink },
  });
}
