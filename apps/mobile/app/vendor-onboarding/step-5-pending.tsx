// ============================================================
// VARS — Vendor Onboarding Step 5: Pending Review (§6.1)
// Shown after KYC + bank submission. Polls kyc_status on mount
// and every 8s. Copy is split by status: pending / needs_review / verified.
// ============================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsSurface } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VarsTheme } from '@/constants/visualSystem';
import { hasAcceptedCurrentTerms } from '@/lib/termsGate';

const POLL_INTERVAL_MS = 8000;

type KycStatus = 'pending' | 'needs_review' | 'verified' | 'rejected';

export default function Step5Pending() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [status, setStatus] = useState<KycStatus>('pending');

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

      const s = data?.kyc_status as KycStatus | undefined;
      if (!s) return;

      if (s === 'verified') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus('verified');
      } else if (s === 'rejected') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.replace('/vendor-onboarding/step-4-kyc');
      } else if (s === 'needs_review') {
        setStatus('needs_review');
      }
    };

    // Check immediately on mount — don't wait for the first interval tick
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    intervalRef.current = interval;
    return () => clearInterval(interval);
  }, [user]);

  const isLive = status === 'verified';
  const isReview = status === 'needs_review';

  const title = isLive ? 'You\'re live on VARS.' : isReview ? 'Confirming your details.' : 'Checking your identity...';

  const body = isLive
    ? 'Your profile and portfolio are now visible to customers. Time to get your first booking.'
    : isReview
    ? 'Our team is reviewing your details. Most stylists are confirmed within 24 hours. We\'ll notify you the moment you\'re approved.'
    : 'This usually takes under a minute. Stay on this screen.';

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.orb, { transform: [{ scale: pulse }] }]} />

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      <VarsSurface theme={theme} elevation={1} style={styles.checklist}>
        <CheckRow label="Profile submitted" done />
        <CheckRow label="Services set" done />
        <CheckRow label="Portfolio uploaded" done />
        <CheckRow label="Identity & bank verified" done />
        <CheckRow label={isLive ? 'You\'re live on VARS' : 'Going live on VARS...'} done={isLive} pulse={!isLive} />
      </VarsSurface>

      {!isReview && !isLive && (
        <Text style={styles.note}>
          Make sure notifications are on. We'll let you know the moment you're approved.
        </Text>
      )}

      {isLive && (
        <Text style={styles.note}>
          Your first client could find you today. Make sure notifications are on.
        </Text>
      )}

      <VarsButton
        theme={theme}
        style={styles.button}
        onPress={async () => {
          if (!isLive) { router.replace('/'); return; }
          // Terms gate — newly verified vendors haven't seen the acceptance screen yet
          const userId = user?.id;
          if (userId) {
            const termsOk = await hasAcceptedCurrentTerms(userId, 'vendor');
            if (!termsOk) {
              router.replace({
                pathname: '/terms-acceptance',
                params: { userType: 'vendor', destination: '/(vendor-tabs)/profile' },
              } as any);
              return;
            }
          }
          router.replace('/(vendor-tabs)/profile');
        }}
        label={isLive ? 'Let\'s go' : 'Back to home'}
      />
    </View>
  );
}

function CheckRow({ label, done, pulse: shouldPulse }: { label: string; done?: boolean; pulse?: boolean }) {
  const { theme } = useVarsTheme();
  const rowStyles = useMemo(() => makeRowStyles(theme), [theme]);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!shouldPulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shouldPulse]);

  return (
    <View style={rowStyles.row}>
      <Animated.View
        style={[
          rowStyles.dot,
          done ? rowStyles.dotDone : rowStyles.dotPending,
          { transform: [{ scale }] },
        ]}
      />
      <Text style={[rowStyles.label, done && rowStyles.labelDone]}>{label}</Text>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: {
      flex: 1, backgroundColor: theme.color.bg,
      paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center',
      paddingBottom: 40,
    },
    orb: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: theme.color.ink, opacity: 0.15,
      marginBottom: 28,
    },
    title: { fontSize: 28, fontWeight: '800', color: theme.color.ink, marginBottom: 12, textAlign: 'center' },
    body: { fontSize: 15, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
    checklist: {
      width: '100%', padding: 20, gap: 16, marginBottom: 24,
    },
    note: {
      fontSize: 13, color: theme.color.inkMuted,
      textAlign: 'center', lineHeight: 19, marginBottom: 32,
    },
    button: { width: '100%' },
  });
}

function makeRowStyles(theme: VarsTheme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    dotDone: { backgroundColor: theme.color.accentGreen },
    dotPending: { borderWidth: 2, borderColor: theme.color.inkFaint, backgroundColor: 'transparent' },
    label: { fontSize: 15, color: theme.color.inkMuted, fontWeight: '500', flex: 1 },
    labelDone: { color: theme.color.ink },
  });
}
