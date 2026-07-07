// ============================================================
// VARS — Sign Up / Login Screen (§4.4)
// Triggered ONLY when unauthenticated user taps "Book Now"
// Returns user to same vendor profile on completion — momentum never broken
// Options: Google · Facebook · Email
// Sign up / Sign in: same screen, toggled
// Phone collected after social login if not present
// Design: VARS logo prominent, everything else minimal
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import {
  signInWithGoogle,
  signInWithFacebook,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSuccess = () => {
    // Return user to vendor profile they came from — momentum never broken (§4.4)
    if (returnTo) {
      router.replace(returnTo as any);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleGoogle = async () => {
    setLoadingProvider('google');
    try {
      const completed = await signInWithGoogle();
      if (completed) handleSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleFacebook = async () => {
    setLoadingProvider('facebook');
    try {
      const completed = await signInWithFacebook();
      if (completed) handleSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Sign in failed. Please try again.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleEmailSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }
    if (mode === 'signup' && !phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithEmail({ email, password, fullName, phoneNumber: phone });
        if (needsConfirmation) {
          Alert.alert(
            'Check your email',
            'We sent a confirmation link to ' + email + '. Click it to activate your account, then sign in.',
          );
          setMode('signin');
          setPassword('');
          return;
        }
      } else {
        await signInWithEmail(email, password);
      }
      handleSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
        {/* VARS logo — prominent per spec §4.4 */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>VARS</Text>
          <Text style={styles.tagline}>Beauty at your door.</Text>
        </View>

        {/* Mode toggle: Sign in / Sign up — same screen */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'signin' && styles.modeButtonActive]}
            onPress={() => setMode('signin')}
          >
            <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>
              Sign in
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>
              Sign up
            </Text>
          </TouchableOpacity>
        </View>

        {/* Social auth buttons */}
        <View style={styles.socialButtons}>
          <SocialButton
            label="Continue with Google"
            onPress={handleGoogle}
            isLoading={loadingProvider === 'google'}
            disabled={!!loadingProvider || isLoading}
          />
          <SocialButton
            label="Continue with Facebook"
            onPress={handleFacebook}
            isLoading={loadingProvider === 'facebook'}
            disabled={!!loadingProvider || isLoading}
          />
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with email</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email form */}
        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            returnKeyType={mode === 'signup' ? 'next' : 'done'}
            onSubmitEditing={mode === 'signin' ? handleEmailSubmit : undefined}
          />

          {/* Phone — required at sign-up for all methods (§4.4) */}
          {mode === 'signup' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="done"
                onSubmitEditing={handleEmailSubmit}
              />
              {/* Helper text per spec §4.4 */}
              <Text style={styles.phoneHelper}>So your vendor can reach you on the day</Text>
            </>
          )}

          <TouchableOpacity
            style={[styles.submitButton, (isLoading || !!loadingProvider) && styles.submitDisabled]}
            onPress={handleEmailSubmit}
            disabled={isLoading || !!loadingProvider}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ScissorsLoader size="small" color="light" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing, you agree to VARS' Terms of Service and Privacy Policy.
        </Text>

        {/* Vendor portal cross-link */}
        <TouchableOpacity onPress={() => router.push('/auth/vendor-login')} style={styles.vendorLink}>
          <Text style={styles.vendorLinkText}>STYLIST LOGIN  ›</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Social auth button ----
function SocialButton({
  label,
  onPress,
  isLoading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.socialButton, disabled && styles.socialButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      {isLoading ? (
        <ScissorsLoader size="small" color="dark" />
      ) : (
        <Text style={styles.socialButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
  },
  wordmark: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.ink,
    letterSpacing: -1,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BORDER_RADIUS,
    padding: 4,
    marginBottom: 28,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  modeText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  modeTextActive: {
    color: Colors.text,
    fontWeight: '600',
  },
  socialButtons: {
    gap: 12,
    marginBottom: 28,
  },
  socialButton: {
    height: 54,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonDisabled: {
    opacity: 0.5,
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  form: {
    gap: 12,
    marginBottom: 20,
  },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BORDER_RADIUS,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  phoneHelper: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: -4,
    marginLeft: 4,
  },
  submitButton: {
    height: 54,
    backgroundColor: Colors.ink,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  terms: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  vendorLink: {
    alignItems: 'center',
    marginTop: 28,
    paddingVertical: 14,
  },
  vendorLinkText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Colors.text,
  },
});
