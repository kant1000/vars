// ============================================================
// VARS — Customer Sign In / Sign Up
// WhatsApp-first: phone number is the only identifier. No email/social
// login for customers (matches the vendor side, which never had social
// auth either) — email is optional profile metadata only, collected in
// finish_account, never used to identify or log in to an account.
// Flow:
//   1. Enter WhatsApp number → customer-check-identity
//      has_account + password set → password screen (forgot → OTP → signed in)
//      has_account, no password yet (abandoned an earlier signup) → OTP → finish_account
//      not_found → OTP → finish_account (name + password + optional email)
// Customers have no waitlist/lead concept, so not_found always means
// "let's create your account" — never an error screen.
// profiles.phone_number is populated only by a DB trigger syncing a
// confirmed auth.users.phone (see supabase/migrations/20260819010001) —
// this screen never writes it directly.
// ============================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { PhoneInput } from '@/components/PhoneInput';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CountryCode, normalizePhone } from '@vars/shared';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { finishCustomerSignup } from '@/lib/auth';
import { hasAcceptedCurrentTerms } from '@/lib/termsGate';
import { getPendingReturnTo } from '@/lib/pendingReturnTo';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type Screen = 'entry' | 'password' | 'otp_input' | 'finish_account';

export default function LoginScreen() {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { refreshProfile } = useAuth();

  const [screen, setScreen] = useState<Screen>('entry');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('+234');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // accountExistsRef drives shouldCreateUser on OTP send.
  // otpPurposeRef decides what happens right after a successful verify:
  // 'recover' = existing account with a password, just proving identity
  //   via "forgot password" → sign them straight in.
  // 'signup' = either a brand-new account or an existing one that never
  //   finished setting a name/password the first time around → collect
  //   the rest in finish_account.
  const accountExistsRef = useRef(false);
  const otpPurposeRef = useRef<'signup' | 'recover'>('signup');

  // ── finish_account fields ──
  const [finishFullName, setFinishFullName] = useState('');
  const [finishEmail, setFinishEmail] = useState('');
  const [finishPassword, setFinishPassword] = useState('');
  const [finishConfirmPassword, setFinishConfirmPassword] = useState('');

  const normalizedPhone = normalizePhone(phoneLocal, phoneCountry);
  const canonical = normalizedPhone ?? '';
  const canSubmitIdentity = !!normalizedPhone;

  // ── Post-auth: resolve wherever the guest was trying to go ──
  const finishIfNeeded = async (userId: string) => {
    const pendingReturnTo = await getPendingReturnTo();
    const termsOk = await hasAcceptedCurrentTerms(userId, 'customer');
    if (!termsOk) {
      router.replace({
        pathname: '/terms-acceptance',
        params: { userType: 'customer', destination: pendingReturnTo ?? '/(tabs)' },
      } as any);
      return;
    }
    router.replace((pendingReturnTo ?? '/(tabs)') as any);
  };

  // ── Identity check ────────────────────────────────────────

  const handleCheckIdentity = async () => {
    if (!canSubmitIdentity) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/customer-check-identity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ phone: canonical }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? json.message ?? 'Identity check failed.');

      const status = json.status as 'has_account' | 'not_found';
      const hasPassword = !!json.has_password;
      accountExistsRef.current = status === 'has_account';

      if (status === 'has_account' && hasPassword) {
        setScreen('password');
      } else {
        otpPurposeRef.current = 'signup';
        await sendOtp();
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
        phone: canonical,
        options: accountExistsRef.current
          ? { shouldCreateUser: false }
          : { shouldCreateUser: true, data: { user_type: 'user' } },
      });
      if (error) throw error;
      setOtpCode('');
      setScreen('otp_input');
    } catch (err: any) {
      const msg = (err.message ?? '').toLowerCase().includes('database error saving new user')
        ? "This number's already on VARS, try logging in instead."
        : err.message ?? 'Failed to send code. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) {
      return Alert.alert('Required', 'Enter the 6-digit code.');
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: canonical,
        token: otpCode.trim(),
        type: 'sms',
      });
      if (error) throw error;

      if (otpPurposeRef.current === 'recover') {
        await finishIfNeeded((await supabase.auth.getUser()).data.user?.id ?? '');
      } else {
        setFinishFullName('');
        setFinishEmail('');
        setFinishPassword('');
        setFinishConfirmPassword('');
        setScreen('finish_account');
      }
    } catch (err: any) {
      Alert.alert('Incorrect code', err.message ?? 'The code was wrong or expired. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Password screen (returning account with a password on file) ──

  const handlePasswordSignIn = async () => {
    if (!password.trim()) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        phone: canonical,
        password,
      });
      if (error) throw error;
      await finishIfNeeded((await supabase.auth.getUser()).data.user?.id ?? '');
    } catch (err: any) {
      Alert.alert('Sign in failed', err.message ?? 'Check your password and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    accountExistsRef.current = true;
    otpPurposeRef.current = 'recover';
    await sendOtp();
  };

  // ── finish_account (new signup, or an account that never finished one) ──

  const canSubmitFinish = !!finishFullName.trim()
    && finishPassword.length >= 8
    && finishPassword === finishConfirmPassword;

  const handleFinishAccount = async () => {
    setIsLoading(true);
    try {
      if (!finishFullName.trim()) {
        Alert.alert('Required', 'Please enter your full name.');
        return;
      }
      if (finishPassword.length < 8) {
        Alert.alert('Too short', 'Password must be at least 8 characters.');
        return;
      }
      if (finishPassword !== finishConfirmPassword) {
        Alert.alert('Mismatch', 'Passwords do not match.');
        return;
      }

      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (!freshUser) {
        Alert.alert('Session expired', 'Please start over.');
        setScreen('entry');
        return;
      }

      await finishCustomerSignup({
        userId: freshUser.id,
        fullName: finishFullName.trim(),
        email: finishEmail.trim() ? finishEmail.trim().toLowerCase() : null,
        password: finishPassword,
      });
      await refreshProfile();
      await finishIfNeeded(freshUser.id);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not finish setting up your account.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle={theme.appearance === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.wordmark}>VARS</Text>
          <Text style={styles.tagline}>Beauty at your door.</Text>
        </View>

        {screen !== 'entry' && (
          <TouchableOpacity
            onPress={() => {
              setScreen('entry');
              setPassword('');
              setOtpCode('');
            }}
            hitSlop={8}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
        )}

        {/* ── Entry screen ── */}
        {screen === 'entry' && (
          <>
            <Text style={styles.title}>Continue with your WhatsApp number.</Text>

            <View style={styles.phoneInputWrap}>
              <PhoneInput
                value={phoneLocal}
                country={phoneCountry}
                onChangeValue={setPhoneLocal}
                onChangeCountry={setPhoneCountry}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!canSubmitIdentity || isLoading) && styles.submitDisabled,
              ]}
              onPress={handleCheckIdentity}
              disabled={!canSubmitIdentity || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                : <Text style={styles.submitText}>Continue</Text>}
            </TouchableOpacity>

            <Text style={styles.terms}>
              By continuing, you agree to VARS' Terms of Service and Privacy Policy.
            </Text>

            <TouchableOpacity onPress={() => router.push('/auth/vendor-login')} style={styles.vendorLink}>
              <Text style={styles.vendorLinkText}>STYLIST LOGIN  ›</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Password screen (returning account with a password on file) ── */}
        {screen === 'password' && (
          <>
            <Text style={styles.title}>Welcome back.</Text>
            <Text style={styles.sub}>{canonical}</Text>

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={theme.color.inkMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handlePasswordSignIn}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.submitButton, (!password.trim() || isLoading) && styles.submitDisabled]}
              onPress={handlePasswordSignIn}
              disabled={!password.trim() || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                : <Text style={styles.submitText}>Sign in</Text>}
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
            <Text style={styles.title}>Check your WhatsApp.</Text>
            <Text style={styles.sub}>
              We sent a 6-digit code to{'\n'}{canonical}.
            </Text>

            <TextInput
              style={[styles.input, styles.otpInput]}
              placeholder="000000"
              placeholderTextColor={theme.color.inkMuted}
              value={otpCode}
              onChangeText={(t) => setOtpCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={handleVerifyOtp}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.submitButton, (otpCode.length !== 6 || isLoading) && styles.submitDisabled]}
              onPress={handleVerifyOtp}
              disabled={otpCode.length !== 6 || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                : <Text style={styles.submitText}>Verify</Text>}
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

        {/* ── finish_account: new signup, or an account that never finished one ── */}
        {screen === 'finish_account' && (
          <>
            <Text style={styles.title}>You're almost set.</Text>
            <Text style={styles.sub}>Finish setting up your account.</Text>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={theme.color.inkMuted}
              value={finishFullName}
              onChangeText={setFinishFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor={theme.color.inkMuted}
              value={finishEmail}
              onChangeText={setFinishEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
            />

            <TextInput
              style={styles.input}
              placeholder="Password (min. 8 characters)"
              placeholderTextColor={theme.color.inkMuted}
              value={finishPassword}
              onChangeText={setFinishPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="next"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={theme.color.inkMuted}
              value={finishConfirmPassword}
              onChangeText={setFinishConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
              returnKeyType="done"
              onSubmitEditing={handleFinishAccount}
            />

            <TouchableOpacity
              style={[styles.submitButton, (!canSubmitFinish || isLoading) && styles.submitDisabled]}
              onPress={handleFinishAccount}
              disabled={!canSubmitFinish || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                : <Text style={styles.submitText}>Continue</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.color.bg,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 32,
    },
    wordmark: {
      fontSize: 40,
      fontWeight: '800',
      color: theme.color.ink,
      letterSpacing: -1,
      marginBottom: 4,
    },
    tagline: {
      fontSize: 16,
      color: theme.color.inkMuted,
    },
    backBtn: {
      marginBottom: 20,
    },
    backText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.color.ink,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: theme.color.ink,
      marginBottom: 6,
    },
    sub: {
      fontSize: 15,
      color: theme.color.inkMuted,
      marginBottom: 28,
      lineHeight: 22,
    },
    input: {
      height: 54,
      borderWidth: BORDER_WIDTH.regular,
      borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS,
      paddingHorizontal: 16,
      fontSize: 16,
      color: theme.color.ink,
      marginBottom: 14,
      backgroundColor: theme.color.bg,
    },
    phoneInputWrap: {
      marginTop: 24,
      marginBottom: 14,
    },
    otpInput: {
      textAlign: 'center',
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: 6,
    },
    submitButton: {
      height: 54,
      backgroundColor: theme.color.ink,
      borderRadius: BORDER_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    submitDisabled: {
      opacity: 0.5,
    },
    submitText: {
      color: theme.color.inverseInk,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryAction: { alignItems: 'center', paddingVertical: 16 },
    secondaryActionText: { fontSize: 14, color: theme.color.ink, fontWeight: '500' },
    terms: {
      fontSize: 12,
      color: theme.color.inkMuted,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 16,
    },
    vendorLink: {
      alignItems: 'center',
      marginTop: 20,
      paddingVertical: 14,
    },
    vendorLinkText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: theme.color.ink,
    },
  });
}
