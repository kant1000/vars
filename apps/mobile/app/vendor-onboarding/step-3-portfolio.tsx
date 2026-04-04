// ============================================================
// VARS — Vendor Onboarding Step 3: Portfolio Upload (§6.1)
// Min 1 photo required. Photos saved to Supabase Storage.
// Note about client-tagged photos shown at bottom.
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { pickAndUploadPortfolioPhotos } from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

export default function Step3Portfolio() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddPhotos = async () => {
    if (!user) return;
    setIsUploading(true);
    try {
      const urls = await pickAndUploadPortfolioPhotos(user.id, photos.length);
      if (urls.length) setPhotos((prev) => [...prev, ...urls]);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => prev.filter((p) => p !== url));
  };

  const handleNext = async () => {
    // Min 1 photo required per spec §6.1 Step 3
    if (photos.length === 0) {
      return Alert.alert('Required', 'Please add at least one portfolio photo.');
    }
    if (!user) return;

    setIsSaving(true);
    try {
      // Save photo records to DB
      const rows = photos.map((url) => ({
        vendor_id: user.id,
        photo_url: url,
        is_consented: true,
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Show your work.</Text>
      <Text style={styles.sub}>
        Add at least one photo so clients know what to expect.
      </Text>

      {/* Photo grid */}
      <View style={styles.grid}>
        {photos.map((url) => (
          <View key={url} style={styles.photoWrapper}>
            <Image source={{ uri: url }} style={styles.photo} />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removePhoto(url)}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Add photo button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddPhotos}
          disabled={isUploading}
          activeOpacity={0.8}
        >
          {isUploading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <Text style={styles.addIcon}>+</Text>
              <Text style={styles.addLabel}>Add photos</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Client consent note per spec §6.1 */}
      <View style={styles.note}>
        <Text style={styles.noteText}>
          Photos you're tagged in by clients will also appear here once they approve.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, (isSaving || isUploading) && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={isSaving || isUploading}
        activeOpacity={0.85}
      >
        {isSaving
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.buttonText}>Next — Verify your identity</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  photoWrapper: { position: 'relative', width: '30%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%', borderRadius: 10 },
  removeButton: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  addButton: {
    width: '30%', aspectRatio: 1, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addIcon: { fontSize: 28, color: Colors.primary, fontWeight: '300' },
  addLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  note: {
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 28,
  },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  button: { height: 56, backgroundColor: Colors.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
