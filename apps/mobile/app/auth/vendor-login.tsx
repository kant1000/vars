// ============================================================
// VARS — Vendor Sign Up / Login
// Separate auth flow for beauty professionals.
// Sets user_type: 'vendor' in metadata so the DB trigger
// creates a vendors row instead of profiles.
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
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signInWithEmail } from '@/lib/auth';
import { Colors } from '@/constants/colors';

type Mode = 'signin' | 'signup';

export default function VendorLoginScreen() {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    if (mode === 'signup') {
      if (!fullName.trim()) return Alert.alert('Required', 'Please enter your full name.');
      if (!phone.trim()) return Alert.alert('Required', 'Please enter your phone number.');
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone_number: phone,
              user_type: 'vendor', // triggers vendors row creation
            },
          },
        });
        if (error) throw error;
        // Proceed directly to onboarding
        router.replace('/vendor-onboarding/step-1-profile');
      } else {
        await signInWithEmail(email, password);
        // Sign in — check if onboarding is complete
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Login failed');
        const { data: vendor } = await supabase
          .from('vendors')
          .select('is_active, kyc_status')
          .eq('id', user.id)
          .single();

        if (!vendor) {
          // Not a vendor — wrong screen
          Alert.alert('Error', 'No vendor account found. Please sign up.');
          return;
        }
        if (vendor.kyc_status === 'pending') {
          router.replace('/vendor-onboarding/step-5-pending');
        } else if (vendor.kyc_status === 'rejected') {
          router.replace('/vendor-onboarding/step-4-kyc');
        } else {
          router.replace('/(vendor-tabs)');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
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
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/auth/login')}>
            <Text style={styles.customerLinkText}>CUSTOMER LOGIN  ›</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.wordmark}>VARS</Text>
        <Text style={styles.title}>
          {mode === 'signup' ? 'Join as a professional.' : 'Welcome back.'}
        </Text>
        <Text style={styles.sub}>
          {mode === 'signup'
            ? 'Start earning on your own terms.'
            : 'Sign in to your vendor account.'}
        </Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
            onPress={() => setMode('signup')}
          >
            <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>
              Sign up
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'signin' && styles.modeButtonActive]}
            onPress={() => setMode('signin')}
          >
            <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>
              Sign in
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={Colors.textMuted}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
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
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType={mode === 'signup' ? 'next' : 'done'}
            onSubmitEditing={mode === 'signin' ? handleSubmit : undefined}
          />
          {mode === 'signup' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <Text style={styles.helper}>So clients can reach you on the day.</Text>
            </>
          )}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ScissorsLoader size="small" color="light" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signup' ? 'Get started' : 'Sign in'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  backText: { fontSize: 16, color: Colors.primary, fontWeight: '500' },
  customerLinkText: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: Colors.text },
  wordmark: { fontSize: 36, fontWeight: '800', color: Colors.primary, letterSpacing: -1, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 16, color: Colors.textSecondary, marginBottom: 32 },
  modeToggle: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 5, padding: 4, marginBottom: 24 },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 5, alignItems: 'center' },
  modeButtonActive: { backgroundColor: Colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  modeText: { fontSize: 15, fontWeight: '500', color: Colors.textSecondary },
  modeTextActive: { color: Colors.text, fontWeight: '600' },
  form: { gap: 12 },
  input: { height: 54, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 5, paddingHorizontal: 16, fontSize: 16, color: Colors.text },
  helper: { fontSize: 13, color: Colors.textSecondary, marginTop: -4, marginLeft: 4 },
  button: { height: 54, backgroundColor: Colors.primary, borderRadius: 5, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
