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
import { uploadSinglePortfolioPhoto, PortfolioUpload } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsCheckbox, VarsSurface } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { CloseIcon } from '@/components/icons';

const MAX_UNVERIFIED = 3;

export default function Step3Portfolio() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const [photos, setPhotos] = useState<PortfolioUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const remaining = MAX_UNVERIFIED - photos.length;

  const handleAddPhotos = async () => {
    if (!user || remaining <= 0) return;
    setIsUploading(true);
    try {
      const upload = await uploadSinglePortfolioPhoto(user.id);
      if (upload) setPhotos((prev) => [...prev, upload]);
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
      <VarsSurface theme={theme} elevation={1} style={styles.guidanceCard}>
        <Text style={styles.guidanceText}>
          Upload photos of your work — results on real clients, before/after shots, finished styles. No selfies or stock images.
        </Text>
      </VarsSurface>

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

      <VarsSurface theme={theme} elevation={1} style={styles.note}>
        <Text style={styles.noteText}>
          After each booking, you can ask clients to verify a photo from your session. Verified photos carry the most weight on your profile.
        </Text>
      </VarsSurface>

      {/* Consent checkbox */}
      <VarsCheckbox
        theme={theme}
        checked={consentChecked}
        onChange={setConsentChecked}
        label="These are photos of my own professional work"
      />

      <VarsButton
        theme={theme}
        loading={isSaving}
        onPress={handleNext}
        disabled={!canContinue}
        label="Continue"
        style={styles.buttonSpacing}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 16 },

  guidanceCard: { padding: 14, marginBottom: 20 },
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
  addIcon: { fontSize: 28, color: Colors.ink, fontWeight: '300' },
  addLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  note: { padding: 14, marginBottom: 20 },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },

  buttonSpacing: { marginTop: 28 },
});
