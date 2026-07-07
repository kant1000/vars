// ============================================================
// VARS — Vendor Sign In / Sign Up
// Flow:
//   1. Enter email (default) or phone (coming soon)
//   2. Identity check via vendor-check-identity edge function:
//      has_account  → password screen
//      lead_only    → OTP flow → create password → onboarding
//      not_found    → error with link to bookwithvars.com
// Returning vendor who forgets password: "Send me a code instead"
// on the password screen sends an OTP and logs them in directly.
// ============================================================

import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, BORDER_RADIUS } from '@/constants/colors';

type Screen = 'entry' | 'password' | 'otp_input' | 'create_password' | 'not_found';
type IdentifierType = 'email' | 'phone';
type IdentityStatus = 'has_account' | 'lead_only' | 'not_found';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LANDING_URL = 'https://www.bookwithvars.com';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return '+234' + digits.slice(1);
  if (digits.startsWith('234') && digits.length === 13) return '+' + digits;
  if (raw.trim().startsWith('+')) return raw.trim();
  return raw.trim();
}

export default function VendorLoginScreen() {
  const [screen, setScreen] = useState<Screen>('entry');
  const [identifierType, setIdentifierType] = useState<IdentifierType>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Tracks whether OTP was triggered from "forgot password" on the password screen
  const forgotMode = useRef(false);

  const canonical = identifierType === 'email'
    ? identifier.trim().toLowerCase()
    : normalizePhone(identifier);

  // ── Identity check ────────────────────────────────────────

  const handleCheckIdentity = async () => {
    if (!identifier.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/vendor-check-identity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ identifier: canonical, type: identifierType }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? json.message ?? 'Identity check failed.');

      const status = json.status as IdentityStatus;
      if (status === 'has_account') {
        setScreen('password');
      } else if (status === 'lead_only') {
        forgotMode.current = false;
        await sendOtp();
      } else {
        setScreen('not_found');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── OTP ───────────────────────────────────────────────────

  const sendOtp = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: canonical,
        options: {
          // user_type ensures fn_handle_new_user creates a vendors row on first sign-up
          data: { user_type: 'vendor' },
        },
      });
      if (error) throw error;
      setOtpCode('');
      setScreen('otp_input');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to send code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) {
      return Alert.alert('Required', 'Enter the 6-digit code from your email.');
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: canonical,
        token: otpCode.trim(),
        type: 'email',
      });
      if (error) throw error;

      if (forgotMode.current) {
        // Already authenticated — route directly to vendor state
        await AsyncStorage.setItem('vars_onboarding_done', 'true');
        await routeToVendorState();
      } else {
        // New vendor — collect password
        setScreen('create_password');
      }
    } catch (err: any) {
      Alert.alert('Incorrect code', err.message ?? 'The code was wrong or expired. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Password flows ────────────────────────────────────────

  const handlePasswordSignIn = async () => {
    if (!password.trim()) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: canonical,
        password,
      });
      if (error) throw error;
      await AsyncStorage.setItem('vars_onboarding_done', 'true');
      await routeToVendorState();
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message ?? 'Check your password and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    forgotMode.current = true;
    await sendOtp();
  };

  const handleCreatePassword = async () => {
    if (newPassword.length < 8) {
      return Alert.alert('Too short', 'Password must be at least 8 characters.');
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('Mismatch', 'Passwords do not match.');
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await AsyncStorage.setItem('vars_onboarding_done', 'true');
      router.replace('/vendor-onboarding/step-1-profile');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not set password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Post-auth routing ─────────────────────────────────────

  const routeToVendorState = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/auth/vendor-login'); return; }

    const [{ data: vendor }, { count: serviceCount }] = await Promise.all([
      supabase
        .from('vendors')
        .select('phone_number, paystack_subaccount_code, kyc_status')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('vendor_services')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', user.id),
    ]);

    if (!vendor) {
      Alert.alert('Error', 'No vendor account found. Please contact support.');
      return;
    }

    if (!vendor.phone_number) {
      router.replace('/vendor-onboarding/step-1-profile'); return;
    }
    if (!serviceCount) {
      router.replace('/vendor-onboarding/step-2-services'); return;
    }
    if (vendor.kyc_status === 'pending' || vendor.kyc_status === 'needs_review') {
      router.replace('/vendor-onboarding/step-5-pending'); return;
    }
    if (!vendor.paystack_subaccount_code || !vendor.kyc_status || vendor.kyc_status === 'rejected') {
      router.replace('/vendor-onboarding/step-4-kyc'); return;
    }
    if (vendor.kyc_status !== 'verified') {
      router.replace('/vendor-onboarding/step-5-pending'); return;
    }
    router.replace('/(vendor-tabs)/profile');
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => {
            if (screen !== 'entry') { setScreen('entry'); setPassword(''); setOtpCode(''); }
            else router.back();
          }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/auth/login')}>
            <Text style={styles.customerLinkText}>CUSTOMER LOGIN  ›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.wordmark}>VARS</Text>

        {/* ── Entry screen ── */}
        {screen === 'entry' && (
          <>
            <Text style={styles.title}>Welcome back, professional.</Text>
            <Text style={styles.sub}>Sign in to your VARS account or set one up.</Text>

            {/* Identifier type tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, identifierType === 'email' && styles.tabActive]}
                onPress={() => { setIdentifierType('email'); setIdentifier(''); }}
              >
                <Text style={[styles.tabText, identifierType === 'email' && styles.tabTextActive]}>
                  Email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, styles.tabDisabled]}
                onPress={() => setIdentifierType('phone')}
                activeOpacity={0.6}
              >
                <Text style={[styles.tabText, styles.tabTextDisabled]}>Phone</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Soon</Text>
                </View>
              </TouchableOpacity>
            </View>

            {identifierType === 'email' ? (
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.textMuted}
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleCheckIdentity}
              />
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.textMuted}
                  value={identifier}
                  onChangeText={setIdentifier}
                  keyboardType="phone-pad"
                  editable={false}
                />
                <Text style={styles.comingSoonHelper}>
                  SMS verification is coming soon. Please use email for now.
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                (!identifier.trim() || isLoading || identifierType === 'phone') && styles.buttonDisabled,
              ]}
              onPress={handleCheckIdentity}
              disabled={!identifier.trim() || isLoading || identifierType === 'phone'}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={styles.buttonText}>Continue</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Password screen (returning vendor) ── */}
        {screen === 'password' && (
          <>
            <Text style={styles.title}>Welcome back.</Text>
            <Text style={styles.sub}>{identifier.trim()}</Text>

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handlePasswordSignIn}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, (!password.trim() || isLoading) && styles.buttonDisabled]}
              onPress={handlePasswordSignIn}
              disabled={!password.trim() || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={styles.buttonText}>Sign in</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={handleForgotPassword}
              disabled={isLoading}
            >
              <Text style={styles.secondaryActionText}>
                {isLoading ? 'Sending…' : 'Forgot password? Send me a code instead'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── OTP input screen ── */}
        {screen === 'otp_input' && (
          <>
            <Text style={styles.title}>Check your email.</Text>
            <Text style={styles.sub}>
              We sent a 6-digit code to{'\n'}{identifier.trim()}.
            </Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="000000"
              placeholderTextColor={Colors.textMuted}
              value={otpCode}
              onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={handleVerifyOtp}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, (otpCode.length !== 6 || isLoading) && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={otpCode.length !== 6 || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={sendOtp}
              disabled={isLoading}
            >
              <Text style={styles.secondaryActionText}>Resend code</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Create password screen (new vendor, after OTP) ── */}
        {screen === 'create_password' && (
          <>
            <Text style={styles.title}>Create your password.</Text>
            <Text style={styles.sub}>
              You're almost set. Create a password so you can sign in quickly next time.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="New password (min. 8 characters)"
              placeholderTextColor={Colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={Colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleCreatePassword}
            />

            <TouchableOpacity
              style={[
                styles.button,
                (newPassword.length < 8 || newPassword !== confirmPassword || isLoading) && styles.buttonDisabled,
              ]}
              onPress={handleCreatePassword}
              disabled={newPassword.length < 8 || newPassword !== confirmPassword || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={styles.buttonText}>Set password and continue</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Not found screen ── */}
        {screen === 'not_found' && (
          <>
            <Text style={styles.title}>We don't recognise this {identifierType}.</Text>
            <Text style={styles.sub}>
              Double-check it's the one you used to register your interest, or join the waitlist first.
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={() => Linking.openURL(LANDING_URL)}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Register at bookwithvars.com →</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => { setIdentifier(''); setScreen('entry'); }}
            >
              <Text style={styles.secondaryActionText}>Try a different email</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

  topRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 32,
  },
  backText: { fontSize: 16, color: Colors.ink, fontWeight: '500' },
  customerLinkText: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: Colors.text },

  wordmark: {
    fontSize: 36, fontWeight: '800', color: Colors.ink,
    letterSpacing: -1, marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 28, lineHeight: 22 },

  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: BORDER_RADIUS, padding: 4, marginBottom: 20,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: BORDER_RADIUS,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.background,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  tabDisabled: { opacity: 0.5 },
  tabText: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  tabTextActive: { color: Colors.text, fontWeight: '600' },
  tabTextDisabled: { color: Colors.textMuted },

  comingSoonBadge: {
    backgroundColor: Colors.border,
    borderRadius: BORDER_RADIUS, paddingHorizontal: 5, paddingVertical: 2,
  },
  comingSoonText: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.3 },
  comingSoonHelper: {
    fontSize: 13, color: Colors.textMuted, marginTop: -10, marginBottom: 24, marginLeft: 2,
  },

  input: {
    height: 54, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BORDER_RADIUS, paddingHorizontal: 16,
    fontSize: 16, color: Colors.text, marginBottom: 14,
    backgroundColor: Colors.background,
  },
  inputDisabled: { backgroundColor: Colors.surface, color: Colors.textMuted },
  otpInput: { textAlign: 'center', fontSize: 24, fontWeight: '700', letterSpacing: 6 },

  button: {
    height: 54, backgroundColor: Colors.ink,
    borderRadius: BORDER_RADIUS, alignItems: 'center',
    justifyContent: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  secondaryAction: { alignItems: 'center', paddingVertical: 16 },
  secondaryActionText: { fontSize: 14, color: Colors.ink, fontWeight: '500' },
});
