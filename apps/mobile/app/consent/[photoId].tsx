// ============================================================
// VARS — Photo Consent Screen
// Client approves or declines a vendor's photo consent request.
// Deep-linked from push notification: /consent/[photoId]
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { CheckIcon, CloseIcon } from '@/components/icons';

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
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
        <ScissorsLoader size="large" color="dark" />
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
        <View style={styles.doneIcon}>
          {done === 'approved'
            ? <CheckIcon size={48} color={theme.color.accentGreen} />
            : <CloseIcon size={48} color={theme.color.accentRed} />
          }
        </View>
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
            ? 'This photo is already live on their profile.'
            : 'This photo request has already expired.'}
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
      <TouchableOpacity style={styles.navBack} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
        <Text style={styles.navBackText}>‹</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Photo approval</Text>
      <Text style={styles.body}>
        <Text style={styles.vendorName}>{photo.vendor_name}</Text>
        {' '}would like to add this photo from your session to their profile.
        Only you can approve this.
      </Text>

      <Image source={{ uri: publicUrl }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.declineBtn, responding && styles.btnDisabled]}
          onPress={() => respond('declined')}
          disabled={responding}
        >
          {responding
            ? <ScissorsLoader size="small" color="dark" />
            : <Text style={styles.declineBtnText}>Decline</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.approveBtn, responding && styles.btnDisabled]}
          onPress={() => respond('approved')}
          disabled={responding}
        >
          {responding
            ? <ScissorsLoader size="small" color="light" />
            : <Text style={styles.approveBtnText}>Approve</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Declining removes this photo from their profile entirely.
      </Text>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: {
      flex: 1, backgroundColor: theme.color.bg, paddingHorizontal: 24,
    },
    centered: {
      flex: 1, backgroundColor: theme.color.bg,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
    },
    navBack: { marginTop: 8, marginBottom: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    navBackText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    title: { fontSize: 24, fontWeight: '800', color: theme.color.ink, marginBottom: 10 },
    body: { fontSize: 15, color: theme.color.inkMuted, lineHeight: 22, marginBottom: 24 },
    vendorName: { fontWeight: '700', color: theme.color.ink },
    photo: {
      width: '100%', aspectRatio: 1, borderRadius: 5, marginBottom: 28,
    },
    actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    declineBtn: {
      flex: 1, height: 56, borderWidth: 1.5, borderColor: theme.color.accentRed,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
    },
    declineBtnText: { color: theme.color.accentRed, fontSize: 16, fontWeight: '700' },
    approveBtn: {
      flex: 1, height: 56, backgroundColor: theme.color.ink,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
    },
    approveBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.5 },
    hint: { fontSize: 12, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 17 },
    errorText: { fontSize: 16, color: theme.color.ink, textAlign: 'center', marginBottom: 20 },
    backBtn: {
      height: 56, backgroundColor: theme.color.ink, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', marginTop: 8,
    },
    backBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },
    doneIcon: { marginBottom: 16, alignItems: 'center' as const },
    doneTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink, marginBottom: 10, textAlign: 'center' },
    doneBody: { fontSize: 15, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  });
}
