// ============================================================
// VARS — Vendor Onboarding Step 1: Profile (§6.1)
// Display name, base location, bio (optional, 150 char).
// Phone and email are pre-filled and read-only — sourced from
// the vendor_leads registration and cannot be changed here.
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';

export default function Step1Profile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

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
    }
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
            <TextInput
              style={styles.input}
              placeholder="Display name"
              placeholderTextColor={Colors.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
            />
            <Text style={styles.fieldCaption}>
              This is how you'll appear to customers. Your legal name is confirmed during identity verification.
            </Text>
          </View>

          {/* Phone — read-only */}
          <View>
            <View style={[styles.input, styles.lockedField]}>
              <Text style={phone ? styles.lockedText : styles.lockedPlaceholder}>
                {phone || 'Phone number'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </View>
            <Text style={styles.fieldCaption}>
              Phone used to sign in — contact us if this needs updating.
            </Text>
          </View>

          {/* Email — read-only */}
          <View>
            <View style={[styles.input, styles.lockedField]}>
              <Text style={email ? styles.lockedText : styles.lockedPlaceholder}>
                {email || 'Email'}
              </Text>
              <Text style={styles.lockBadge}>Locked</Text>
            </View>
            <Text style={styles.fieldCaption}>
              Email from your registration — contact us if this needs updating.
            </Text>
          </View>

          {/* Base location */}
          <TouchableOpacity style={styles.locationButton} onPress={handleDetectLocation} disabled={isLocating} activeOpacity={0.85}>
            {isLocating ? (
              <ScissorsLoader size="small" color="dark" />
            ) : (
              <Text style={locationCoords ? styles.locationSet : styles.locationUnset}>
                {locationCoords ? `📍 ${locationLabel}` : 'Set your base location'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.locationHelper}>
            Your primary operating area. Clients nearby will discover you.
          </Text>

          {/* Bio — optional, 150 char max per spec §4.3 */}
          <View>
            <Text style={styles.fieldLabel}>
              Bio <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              placeholder="What makes you great?"
              placeholderTextColor={Colors.textMuted}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 150))}
              multiline
              maxLength={150}
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading
            ? <ScissorsLoader size="small" color="light" />
            : <Text style={styles.buttonText}>Continue</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 28 },
  form: { gap: 12, marginBottom: 28 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6 },
  optional: { fontWeight: '400', color: Colors.textMuted },
  input: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BORDER_RADIUS, paddingHorizontal: 16, fontSize: 16, color: Colors.text,
  },
  lockedField: {
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedText: { fontSize: 16, color: Colors.text, flex: 1 },
  lockedPlaceholder: { fontSize: 16, color: Colors.textMuted, flex: 1 },
  lockBadge: {
    fontSize: 11, fontWeight: '600', color: Colors.textMuted,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BORDER_RADIUS,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  fieldCaption: { fontSize: 12, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
  bioInput: { height: 90, paddingTop: 14, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  locationButton: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BORDER_RADIUS, paddingHorizontal: 16, justifyContent: 'center',
  },
  locationSet: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  locationUnset: { fontSize: 16, color: Colors.ink, fontWeight: '500' },
  locationHelper: { fontSize: 13, color: Colors.textSecondary, marginTop: -4, marginLeft: 4 },
  button: {
    height: 56, backgroundColor: Colors.ink, borderRadius: BORDER_RADIUS,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
