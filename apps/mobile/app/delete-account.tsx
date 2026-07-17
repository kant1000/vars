// ============================================================
// VARS — Delete Account
// Two-step: info screen → type DELETE confirmation.
// Calls delete-user-account edge function, then signs out.
// ============================================================
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { signOut } from '@/lib/auth';

const EDGE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user-account`
  : '';

type Step = 'info' | 'confirm';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const [step,    setStep]    = useState<Step>('info');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (confirm !== 'DELETE') return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Session expired', 'Please sign in again.');
        router.replace('/auth/login' as any);
        return;
      }

      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert(
          'Cannot delete account',
          err.error ?? 'Something went wrong. Please try again.',
        );
        return;
      }

      // Sign out and return to auth screen
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Delete account</Text>
        <View style={{ width: 36 }} />
      </View>

      {step === 'info' ? (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.sectionTitle}>What happens when you delete your account</Text>

          <View style={s.infoBlock}>
            <Text style={s.infoItem}>• Your personal information (name, phone, photo) is permanently removed</Text>
            <Text style={s.infoItem}>• Your reviews are anonymised to "VARS Customer"</Text>
            <Text style={s.infoItem}>• Your booking history is kept for 6 years as required by Nigerian tax law (CITA), but your personal details are removed from it</Text>
            <Text style={s.infoItem}>• Your login is permanently disabled</Text>
          </View>

          <Text style={s.sectionTitle}>Before you continue</Text>
          <View style={s.infoBlock}>
            <Text style={s.infoItem}>• You cannot have any bookings in progress</Text>
            <Text style={s.infoItem}>• You cannot have any open disputes</Text>
            <Text style={s.infoItem}>• If you are a vendor: all outstanding payouts must have settled</Text>
          </View>

          <Text style={s.note}>
            This action is permanent. There is no recovery option once your account is deleted.
          </Text>

          <Text style={s.note}>
            Prefer to take a break instead? You can simply stop using the app — your data stays safe until you return.
          </Text>

          <TouchableOpacity
            style={s.continueBtn}
            onPress={() => setStep('confirm')}
            activeOpacity={0.85}
          >
            <Text style={s.continueBtnText}>Continue to deletion</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <Text style={s.confirmPrompt}>
            Type{' '}
            <Text style={{ fontWeight: '800', color: theme.color.ink }}>DELETE</Text>
            {' '}to permanently delete your account.
          </Text>

          <TextInput
            style={s.confirmInput}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type DELETE here"
            placeholderTextColor={theme.color.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
          />

          <TouchableOpacity
            style={[s.deleteBtn, (confirm !== 'DELETE' || loading) && s.deleteBtnDisabled]}
            onPress={handleDelete}
            disabled={confirm !== 'DELETE' || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={theme.color.inverseInk} />
            ) : (
              <Text style={s.deleteBtnText}>Delete my account permanently</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelLink} onPress={() => setStep('info')}>
            <Text style={s.cancelLinkText}>Go back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.inkFaint,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    scroll: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 60 },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.color.ink,
      marginBottom: 12,
      marginTop: 8,
    },
    infoBlock: {
      backgroundColor: theme.color.surface2,
      borderRadius: BORDER_RADIUS,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: theme.color.inkFaint,
    },
    infoItem: {
      fontSize: 14,
      color: theme.color.inkMuted,
      lineHeight: 22,
      marginBottom: 8,
    },
    note: {
      fontSize: 13,
      color: theme.color.inkMuted,
      lineHeight: 20,
      marginBottom: 16,
    },
    continueBtn: {
      marginTop: 8,
      height: 52,
      borderWidth: 1.5,
      borderColor: theme.color.accentRed,
      borderRadius: BORDER_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
    },
    continueBtnText: { fontSize: 15, fontWeight: '700', color: theme.color.accentRed },
    confirmPrompt: {
      fontSize: 16,
      color: theme.color.inkMuted,
      lineHeight: 24,
      marginBottom: 20,
    },
    confirmInput: {
      height: 56,
      borderWidth: 1.5,
      borderColor: theme.color.accentRed,
      borderRadius: BORDER_RADIUS,
      paddingHorizontal: 16,
      fontSize: 18,
      fontWeight: '700',
      color: theme.color.ink,
      marginBottom: 20,
      letterSpacing: 2,
    },
    deleteBtn: {
      height: 56,
      backgroundColor: theme.color.accentRed,
      borderRadius: BORDER_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    deleteBtnDisabled: { opacity: 0.4 },
    deleteBtnText: { color: theme.color.inverseInk, fontSize: 15, fontWeight: '700' },
    cancelLink: { alignItems: 'center', paddingVertical: 12 },
    cancelLinkText: { fontSize: 14, color: theme.color.inkMuted, textDecorationLine: 'underline' },
  });
}
