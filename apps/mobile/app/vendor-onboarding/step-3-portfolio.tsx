// ============================================================
// VARS — Vendor Onboarding Step 3: Portfolio Upload (§6.1)
// Min 1 photo required. Max 3 unverified photos at onboarding.
// Photos stored in 'portfolio' bucket; DB record has storage_path + consent_state='unverified'.
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { pickAndUploadPortfolioPhotos, PortfolioUpload } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { CloseIcon } from '@/components/icons';

const MAX_UNVERIFIED = 3;

export default function Step3Portfolio() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<PortfolioUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const remaining = MAX_UNVERIFIED - photos.length;

  const handleAddPhotos = async () => {
    if (!user || remaining <= 0) return;
    setIsUploading(true);
    try {
      const uploads = await pickAndUploadPortfolioPhotos(user.id, photos.length, remaining);
      if (uploads.length) setPhotos((prev) => [...prev, ...uploads]);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = (path: string) => {
    setPhotos((prev) => prev.filter((p) => p.path !== path));
  };

  const handleNext = async () => {
    if (photos.length === 0) {
      return Alert.alert('Required', 'Please add at least one portfolio photo.');
    }
    if (!consentChecked) {
      return Alert.alert('Required', 'Please confirm these are photos of your own work.');
    }
    if (!user) return;

    setIsSaving(true);
    try {
      const rows = photos.map((p) => ({
        vendor_id: user.id,
        storage_path: p.path,
        consent_state: 'unverified',
      }));
      const { error } = await supabase.from('portfolio_photos').insert(rows);
      if (error) throw error;
      router.push('/vendor-onboarding/step-4-kyc');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const canContinue = photos.length > 0 && consentChecked && !isSaving && !isUploading;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Show your work.</Text>
      <Text style={styles.sub}>
        Add at least one photo so clients know what to expect. Up to {MAX_UNVERIFIED} photos.
      </Text>

      {/* Guidance card */}
      <View style={styles.guidanceCard}>
        <Text style={styles.guidanceText}>
          Upload photos of your work — results on real clients, before/after shots, finished styles. No selfies or stock images.
        </Text>
      </View>

      <View style={styles.grid}>
        {photos.map((p) => (
          <View key={p.path} style={styles.photoWrapper}>
            <Image source={{ uri: p.url }} style={styles.photo} contentFit="cover" />
            <TouchableOpacity style={styles.removeButton} onPress={() => removePhoto(p.path)}>
              <CloseIcon size={11} color="#FFF" />
            </TouchableOpacity>
          </View>
        ))}

        {remaining > 0 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddPhotos}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            {isUploading ? (
              <ScissorsLoader size="small" color="dark" />
            ) : (
              <>
                <Text style={styles.addIcon}>+</Text>
                <Text style={styles.addLabel}>Add photos</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          After each booking, you can ask clients to verify a photo from your session. Verified photos carry the most weight on your profile.
        </Text>
      </View>

      {/* Consent checkbox */}
      <TouchableOpacity
        style={styles.consentRow}
        onPress={() => setConsentChecked((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, consentChecked && styles.checkboxChecked]}>
          {consentChecked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.consentLabel}>These are photos of my own professional work</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, !canContinue && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={!canContinue}
        activeOpacity={0.85}
      >
        {isSaving
          ? <ScissorsLoader size="small" color="light" />
          : <Text style={styles.buttonText}>Continue</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 16 },

  guidanceCard: {
    backgroundColor: Colors.surface,
    borderRadius: BORDER_RADIUS,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guidanceText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  photoWrapper: { position: 'relative', width: '30%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS },
  removeButton: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  addButton: {
    width: '30%', aspectRatio: 1, borderRadius: BORDER_RADIUS,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addIcon: { fontSize: 28, color: Colors.primary, fontWeight: '300' },
  addLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  note: { backgroundColor: Colors.surface, borderRadius: BORDER_RADIUS, padding: 14, marginBottom: 20 },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  consentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 28,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  consentLabel: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20 },

  button: { height: 56, backgroundColor: Colors.primary, borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
