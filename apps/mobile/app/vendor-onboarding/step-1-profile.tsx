// ============================================================
// VARS — Vendor Onboarding Step 1: Basic Registration (§6.1)
// Full name, phone, email, profile photo, bio (150 char), base location
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { pickAndUploadImage } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

export default function Step1Profile() {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(authProfile?.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const handlePickPhoto = async () => {
    if (!user) return;
    try {
      const url = await pickAndUploadImage({
        bucket: 'avatars',
        path: `vendors/${user.id}/avatar`,
        aspect: [1, 1],
      });
      if (url) setPhotoUrl(url);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    }
  };

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
    } catch (err: any) {
      Alert.alert('Error', 'Could not detect location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleNext = async () => {
    if (!fullName.trim()) return Alert.alert('Required', 'Please enter your full name.');
    if (!phone.trim()) return Alert.alert('Required', 'Please enter your phone number.');
    if (!locationCoords) return Alert.alert('Required', 'Please set your base location.');
    if (!user) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          full_name: fullName.trim(),
          phone_number: phone.trim(),
          bio: bio.trim() || null,
          profile_photo_url: photoUrl,
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

        {/* Profile photo */}
        <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>Add photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={Colors.textMuted}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          {/* Bio — 150 char max per spec §4.3 */}
          <View>
            <TextInput
              style={[styles.input, styles.bioInput]}
              placeholder="Short bio — what makes you great? (optional)"
              placeholderTextColor={Colors.textMuted}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, 150))}
              multiline
              maxLength={150}
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
          </View>

          {/* Base location */}
          <TouchableOpacity style={styles.locationButton} onPress={handleDetectLocation}>
            {isLocating ? (
              <ActivityIndicator color={Colors.primary} />
            ) : (
              <Text style={locationCoords ? styles.locationSet : styles.locationUnset}>
                {locationCoords ? `📍 ${locationLabel}` : 'Set your base location'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.locationHelper}>
            Your primary operating area. Clients nearby will discover you.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.buttonText}>Next — Choose your services</Text>}
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
  photoButton: { alignSelf: 'center', marginBottom: 28 },
  photo: { width: 100, height: 100, borderRadius: 50 },
  photoPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.surface, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoPlaceholderText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  form: { gap: 12, marginBottom: 28 },
  input: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: Colors.text,
  },
  bioInput: { height: 90, paddingTop: 14, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
  locationButton: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center',
  },
  locationSet: { fontSize: 16, color: Colors.text, fontWeight: '500' },
  locationUnset: { fontSize: 16, color: Colors.primary, fontWeight: '500' },
  locationHelper: { fontSize: 13, color: Colors.textSecondary, marginTop: -4, marginLeft: 4 },
  button: {
    height: 56, backgroundColor: Colors.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
