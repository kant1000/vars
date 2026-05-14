// ============================================================
// VARS — Vendor Onboarding Step 5: Pending Review (§6.1)
// Shown after KYC + bank submission. Vendor waits for VARS approval.
// kyc_status: 'pending' → 'verified' or 'rejected' via Youverify webhook.
// Polls every 8 seconds and navigates once a terminal status is reached.
// ============================================================
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const POLL_INTERVAL_MS = 8000;

export default function Step5Pending() {
  const { user } = useAuth();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!user) return;

    const poll = async () => {
      const { data } = await supabase
        .from('vendors')
        .select('kyc_status')
        .eq('id', user.id)
        .single();

      if (data?.kyc_status === 'verified') {
        router.replace('/(vendor-tabs)');
      } else if (data?.kyc_status === 'rejected') {
        router.replace('/vendor-onboarding/step-4-kyc');
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <View style={styles.container}>
      {/* Animated dot */}
      <Animated.View style={[styles.orb, { transform: [{ scale: pulse }] }]} />

      <Text style={styles.title}>You're in the queue.</Text>
      <Text style={styles.body}>
        We're reviewing your profile and verification. Most vendors go live within 24 hours.
        We'll send you a notification the moment you're approved.
      </Text>

      <View style={styles.steps}>
        <Row icon="✓" text="Profile submitted" done />
        <Row icon="✓" text="Services set" done />
        <Row icon="✓" text="Portfolio uploaded" done />
        <Row icon="✓" text="Identity & bank verified" done />
        <Row icon="⏳" text="VARS review — in progress" />
      </View>

      <Text style={styles.note}>
        While you wait, make sure your phone is on and notifications are enabled.
        Your first client could be right around the corner.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.replace('/')}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
}

function Row({ icon, text, done }: { icon: string; text: string; done?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowIcon, done && styles.rowIconDone]}>{icon}</Text>
      <Text style={[styles.rowText, done && styles.rowTextDone]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.background,
    paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center',
    paddingBottom: 40,
  },
  orb: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, opacity: 0.15,
    marginBottom: 28,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  steps: {
    width: '100%', backgroundColor: Colors.surface,
    borderRadius: 16, padding: 20, gap: 14, marginBottom: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  rowIconDone: { color: Colors.success },
  rowText: { fontSize: 15, color: Colors.textMuted, fontWeight: '500' },
  rowTextDone: { color: Colors.text },
  note: {
    fontSize: 13, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 19, marginBottom: 32,
  },
  button: {
    height: 56, backgroundColor: Colors.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, width: '100%',
  },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
