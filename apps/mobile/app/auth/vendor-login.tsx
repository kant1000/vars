// ============================================================
// VARS — Vendor Sign In / Sign Up
// Both email and phone are full, symmetric identifiers: either one can
// start a signup (lead_only) or a login (has_account), and once an account
// exists it can always be reached by either channel.
// Flow (email or phone):
//   1. Enter identifier → vendor-check-identity
//      has_account  → email: password screen (forgot → OTP → dashboard)
//                     phone: WhatsApp OTP → dashboard
//      lead_only    → OTP → create password → onboarding
//      not_found    → error with link to bookwithvars.com
// OTP delivery: email (via Resend) + WhatsApp (via 360dialog hook)
// ============================================================

import React, { useMemo, useRef, useState } from 'react';
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
import { PhoneInput } from '@/components/PhoneInput';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { CountryCode, normalizePhone } from '@vars/shared';
import { getVendorOnboardingStep, resumeOnboardingAt } from '@/lib/vendorOnboarding';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';

type Screen = 'entry' | 'password' | 'otp_input' | 'create_password' | 'not_found';
type IdentifierType = 'email' | 'phone';
type IdentityStatus = 'has_account' | 'lead_only' | 'not_found';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const LANDING_URL = 'https://www.bookwithvars.com';

export default function VendorLoginScreen() {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [screen, setScreen] = useState<Screen>('entry');
  const [identifierType, setIdentifierType] = useState<IdentifierType>('email');
  const [identifier, setIdentifier] = useState('');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('+234');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Tracks whether the current OTP flow is for an existing account (login) or
  // a lead_only signup — decides shouldCreateUser on send and the post-verify
  // route (dashboard vs create_password), symmetrically for email and phone.
  const isExistingAccount = useRef(false);

  const normalizedPhone = normalizePhone(phoneLocal, phoneCountry);
  const canonical = identifierType === 'email'
    ? identifier.trim().toLowerCase()
    : (normalizedPhone ?? '');
  const canSubmitIdentity = identifierType === 'email' ? !!identifier.trim() : !!normalizedPhone;

  // ── Identity check ────────────────────────────────────────

  const handleCheckIdentity = async () => {
    if (!canSubmitIdentity) return;
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
        if (identifierType === 'phone') {
          isExistingAccount.current = true;
          await sendOtp();
        } else {
          setScreen('password');
        }
      } else if (status === 'lead_only') {
        isExistingAccount.current = false;
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
      if (identifierType === 'phone') {
        // shouldCreateUser mirrors isExistingAccount: has_account vendors get
        // false (a phone that doesn't yet match an existing auth.users.phone
        // must fail loudly, not silently create a second, disconnected auth
        // identity), while lead_only vendors get true plus user_type metadata
        // so this becomes a real signup, same as the email branch below. See
        // supabase/migrations/20260815*.sql and 20260816000001*.sql for the
        // identity-sync fixes this depends on (auth.users.phone/email,
        // phone_confirmed_at/email_confirmed_at, and matching auth.identities
        // rows, digits-only phone with no leading '+', for GoTrue to
        // recognize an existing vendor by either channel).
        const { error } = await supabase.auth.signInWithOtp({
          phone: canonical,
          options: isExistingAccount.current
            ? { shouldCreateUser: false }
            : { shouldCreateUser: true, data: { user_type: 'vendor' } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email: canonical,
          options: {
            // user_type ensures fn_handle_new_user creates a vendors row on first sign-up
            data: { user_type: 'vendor' },
          },
        });
        if (error) throw error;
      }
      setOtpCode('');
      setScreen('otp_input');
    } catch (err: any) {
      // fn_sync_phone_identity_registry (see
      // supabase/migrations/20260816201838_phone_identity_registry.sql)
      // rejects a phone already claimed by any other account, customer or
      // vendor; GoTrue wraps that trigger failure as a generic "Database
      // error saving new user". Kept role-agnostic since the collision could
      // be with either account type.
      const msg = (err.message ?? '').toLowerCase().includes('database error saving new user')
        ? "This phone number's already on VARS, try logging in instead."
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
      if (identifierType === 'phone') {
        const { error } = await supabase.auth.verifyOtp({
          phone: canonical,
          token: otpCode.trim(),
          type: 'sms',
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.verifyOtp({
          email: canonical,
          token: otpCode.trim(),
          type: 'email',
        });
        if (error) throw error;
      }

      if (isExistingAccount.current) {
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
    isExistingAccount.current = true;
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
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        Alert.alert('Session expired', 'Your session expired. Please sign in again.');
        setScreen('entry');
        setOtpCode('');
        return;
      }
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
        .select('phone_number, paystack_subaccount_code, kyc_status, kyc_submitted_at')
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

    const onboardingStep = getVendorOnboardingStep(vendor, !!serviceCount);
    if (onboardingStep) {
      resumeOnboardingAt(onboardingStep);
      return;
    }
    router.replace('/(vendor-tabs)/profile');
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
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => {
            if (screen !== 'entry') { setScreen('entry'); setPassword(''); setOtpCode(''); }
            else router.back();
          }} hitSlop={8} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Text style={styles.backText}>‹</Text>
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
                style={[styles.tab, identifierType === 'phone' && styles.tabActive]}
                onPress={() => { setIdentifierType('phone'); setPhoneLocal(''); }}
              >
                <Text style={[styles.tabText, identifierType === 'phone' && styles.tabTextActive]}>Phone</Text>
              </TouchableOpacity>
            </View>

            {identifierType === 'email' ? (
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={theme.color.inkMuted}
                value={identifier}
                onChangeText={setIdentifier}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="done"
                onSubmitEditing={handleCheckIdentity}
              />
            ) : (
              <View style={styles.phoneInputWrap}>
                <PhoneInput
                  value={phoneLocal}
                  country={phoneCountry}
                  onChangeValue={setPhoneLocal}
                  onChangeCountry={setPhoneCountry}
                />
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                (!canSubmitIdentity || isLoading) && styles.buttonDisabled,
              ]}
              onPress={handleCheckIdentity}
              disabled={!canSubmitIdentity || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
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
              style={[styles.button, (!password.trim() || isLoading) && styles.buttonDisabled]}
              onPress={handlePasswordSignIn}
              disabled={!password.trim() || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
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
            <Text style={styles.title}>
              {identifierType === 'phone' ? 'Check your WhatsApp.' : 'Check your email.'}
            </Text>
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
              style={[styles.button, (otpCode.length !== 6 || isLoading) && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={otpCode.length !== 6 || isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
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
              placeholderTextColor={theme.color.inkMuted}
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
              placeholderTextColor={theme.color.inkMuted}
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
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
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
              onPress={() => { setIdentifier(''); setPhoneLocal(''); setScreen('entry'); }}
            >
              <Text style={styles.secondaryActionText}>
                Try a different {identifierType === 'phone' ? 'number' : 'email'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },

    topRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 32,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    customerLinkText: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: theme.color.ink },

    wordmark: {
      fontSize: 36, fontWeight: '800', color: theme.color.ink,
      letterSpacing: -1, marginBottom: 12,
    },
    title: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    sub: { fontSize: 15, color: theme.color.inkMuted, marginBottom: 28, lineHeight: 22 },

    tabRow: {
      flexDirection: 'row', backgroundColor: theme.color.surface2,
      borderRadius: BORDER_RADIUS, padding: 4, marginBottom: 20,
    },
    tab: {
      flex: 1, paddingVertical: 10, borderRadius: BORDER_RADIUS,
      alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
    },
    tabActive: {
      backgroundColor: theme.color.bg,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    },
    tabText: { fontSize: 15, fontWeight: '500', color: theme.color.inkMuted },
    tabTextActive: { color: theme.color.ink, fontWeight: '600' },

    input: {
      height: 54, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS, paddingHorizontal: 16,
      fontSize: 16, color: theme.color.ink, marginBottom: 14,
      backgroundColor: theme.color.bg,
    },
    inputDisabled: { backgroundColor: theme.color.surface2, color: theme.color.inkMuted },
    phoneInputWrap: { marginBottom: 14 },
    otpInput: { textAlign: 'center', fontSize: 24, fontWeight: '700', letterSpacing: 6 },

    button: {
      height: 54, backgroundColor: theme.color.ink,
      borderRadius: BORDER_RADIUS, alignItems: 'center',
      justifyContent: 'center', marginTop: 4,
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },

    secondaryAction: { alignItems: 'center', paddingVertical: 16 },
    secondaryActionText: { fontSize: 14, color: theme.color.ink, fontWeight: '500' },
  });
}
