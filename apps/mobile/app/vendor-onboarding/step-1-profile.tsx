// ============================================================
// VARS — Vendor Onboarding Step 1: Profile (§6.1)
// Display name, phone, base location, bio (optional, 150 char).
// Field order: name → phone → location → bio (required before optional).
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
  const [bio, setBio] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Pre-fill from vendor row — trigger may have copied data from vendor_leads
  useEffect(() => {
    if (!user) return;
    supabase
      .from('vendors')
      .select('full_name, phone_number')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setDisplayName(data.full_name);
        if (data?.phone_number) setPhone(data.phone_number);
      });
  }, [user]);

  const handleDetectLocation = async () => {
    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access to set your base area.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync(loc.coords);
      const label = [geo.district ?? geo.subregion, geo.city ?? geo.region]
        .filter(Boolean).join(', ');
      setLocationLabel(label || 'Current location');
      setLocationCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      Alert.alert('Error', 'Could not detect location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleNext = async () => {
    if (!displayName.trim()) return Alert.alert('Required', 'Please enter your display name.');
    if (!phone.trim()) return Alert.alert('Required', 'Please enter your phone number.');
    if (!locationCoords) return Alert.alert('Required', 'Please set your base location.');
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          full_name: displayName.trim(),
          phone_number: phone.trim(),
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
          {/* Display name */}
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

          {/* Phone */}
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {/* Base location */}
          <TouchableOpacity style={styles.locationButton} onPress={handleDetectLocation}>
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
  fieldCaption: { fontSize: 12, color: Colors.textMuted, marginTop: 6, lineHeight: 16 },
  bioInput: { height: 90, paddingTop: 14, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  locationButton: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BORDER_RADIUS, paddingHorizontal: 16, justifyContent: 'center',
  },
  locationSet: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  locationUnset: { fontSize: 16, color: Colors.primary, fontWeight: '500' },
  locationHelper: { fontSize: 13, color: Colors.textSecondary, marginTop: -4, marginLeft: 4 },
  button: {
    height: 56, backgroundColor: Colors.primary, borderRadius: BORDER_RADIUS,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
