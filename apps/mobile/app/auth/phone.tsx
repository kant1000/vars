// ============================================================
// VARS — Phone Number Collection Screen
// Shown after social login (Google/Facebook) if phone not yet set.
// Per spec §4.4: phone required for ALL auth methods.
// Helper text: "So your vendor can reach you on the day"
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { savePhoneNumber } from '@/lib/auth';

export default function PhoneScreen() {
  const { user, refreshProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid number', 'Please enter a valid phone number.');
      return;
    }

    if (!user) return;
    setIsLoading(true);

    try {
      await savePhoneNumber(user.id, cleaned);
      await refreshProfile();
      // Navigate to tabs — phone is now set
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save phone number.');
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
      <View style={styles.inner}>
        <Text style={styles.wordmark}>VARS</Text>

        <Text style={styles.title}>One last thing.</Text>
        <Text style={styles.subtitle}>
          What's your phone number?
        </Text>
        {/* Helper text from spec §4.4 */}
        <Text style={styles.helper}>So your vendor can reach you on the day.</Text>

        <TextInput
          style={styles.input}
          placeholder="+234 800 000 0000"
          placeholderTextColor={Colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <TouchableOpacity
          style={[styles.button, (!phone.trim() || isLoading) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!phone.trim() || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 100,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -1,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 6,
  },
  helper: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  input: {
    height: 58,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    color: Colors.text,
    marginBottom: 16,
  },
  button: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
