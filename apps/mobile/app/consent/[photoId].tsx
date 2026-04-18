// ============================================================
// VARS — Photo Consent Screen
// Client approves or declines a vendor's photo consent request.
// Deep-linked from push notification: /consent/[photoId]
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

interface ConsentPhoto {
  id: string;
  storage_path: string;
  consent_state: string;
  vendor_name: string;
}

export default function ConsentScreen() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  const insets = useSafeAreaInsets();

  const [photo, setPhoto] = useState<ConsentPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState<'approved' | 'declined' | null>(null);

  const load = useCallback(async () => {
    if (!photoId) return;
    setLoading(true);

    const { data } = await supabase
      .from('portfolio_photos')
      .select('id, storage_path, consent_state, vendor_id')
      .eq('id', photoId)
      .single();

    if (!data) { setLoading(false); return; }

    const { data: vendor } = await supabase
      .from('vendors')
      .select('full_name')
      .eq('id', data.vendor_id)
      .single();

    setPhoto({
      id: data.id,
      storage_path: data.storage_path,
      consent_state: data.consent_state,
      vendor_name: vendor?.full_name ?? 'Your vendor',
    });
    setLoading(false);
  }, [photoId]);

  useEffect(() => { load(); }, [load]);

  const respond = async (response: 'approved' | 'declined') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert('Sign in required', 'Please sign in to respond to this request.');
      return;
    }

    setResponding(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/photo-consent-respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ photo_id: photoId, response }),
      });

      if (!res.ok) {
        const d = await res.json();
        Alert.alert('Error', d.error ?? 'Something went wrong.');
        return;
      }

      setDone(response);
    } catch {
      Alert.alert('Error', 'Could not reach server. Please try again.');
    } finally {
      setResponding(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!photo) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Photo not found or request has expired.</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.doneIcon}>{done === 'approved' ? '✓' : '✕'}</Text>
        <Text style={styles.doneTitle}>
          {done === 'approved' ? 'Photo approved' : 'Photo declined'}
        </Text>
        <Text style={styles.doneBody}>
          {done === 'approved'
            ? `The photo will now appear on ${photo.vendor_name}'s profile.`
            : `The photo has been removed. ${photo.vendor_name} has been notified.`}
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (photo.consent_state !== 'pending') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>
          {photo.consent_state === 'approved'
            ? 'You have already approved this photo.'
            : 'This photo request is no longer active.'}
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { data: { publicUrl } } = supabase.storage.from('portfolio').getPublicUrl(photo.storage_path);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.navBack} onPress={() => router.back()}>
        <Text style={styles.navBackText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Photo approval</Text>
      <Text style={styles.body}>
        <Text style={styles.vendorName}>{photo.vendor_name}</Text>
        {' '}would like to add this photo from your session to their profile.
        Only you can approve this.
      </Text>

      <Image source={{ uri: publicUrl }} style={styles.photo} resizeMode="cover" />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.declineBtn, responding && styles.btnDisabled]}
          onPress={() => respond('declined')}
          disabled={responding}
        >
          {responding
            ? <ActivityIndicator color={Colors.error} size="small" />
            : <Text style={styles.declineBtnText}>Decline</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.approveBtn, responding && styles.btnDisabled]}
          onPress={() => respond('approved')}
          disabled={responding}
        >
          {responding
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Text style={styles.approveBtnText}>Approve</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        If you decline, the photo is deleted permanently and won't appear anywhere.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24,
  },
  centered: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  navBack: { marginTop: 8, marginBottom: 20 },
  navBackText: { fontSize: 16, color: Colors.primary, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  body: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  vendorName: { fontWeight: '700', color: Colors.text },
  photo: {
    width: '100%', aspectRatio: 1, borderRadius: 16, marginBottom: 28,
  },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  declineBtn: {
    flex: 1, height: 54, borderWidth: 1.5, borderColor: Colors.error,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  declineBtnText: { color: Colors.error, fontSize: 16, fontWeight: '700' },
  approveBtn: {
    flex: 1, height: 54, backgroundColor: Colors.primary,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  approveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  hint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 17 },
  errorText: { fontSize: 16, color: Colors.text, textAlign: 'center', marginBottom: 20 },
  backBtn: {
    height: 50, backgroundColor: Colors.primary, borderRadius: 14,
    paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  backBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  doneIcon: { fontSize: 48, marginBottom: 16 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  doneBody: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
});
