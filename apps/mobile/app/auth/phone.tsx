// ============================================================
// VARS — Phone Number Collection Screen
// Shown after social login (Google/Facebook) if phone not yet set.
// Per spec §4.4: phone required for ALL auth methods.
// Helper text: "So your stylist can reach you on the day"
// ============================================================

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router } from 'expo-router';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { savePhoneNumber } from '@/lib/auth';
import { hasAcceptedCurrentTerms } from '@/lib/termsGate';

export default function PhoneScreen() {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
      // Terms gate — new OAuth customers haven't seen the acceptance screen yet
      const termsOk = await hasAcceptedCurrentTerms(user.id, 'customer');
      if (!termsOk) {
        router.replace({
          pathname: '/terms-acceptance',
          params: { userType: 'customer', destination: '/(tabs)' },
        } as any);
        return;
      }
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
      <StatusBar barStyle={theme.appearance === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={styles.inner}>
        <Text style={styles.wordmark}>VARS</Text>

        <Text style={styles.title}>One last thing.</Text>
        <Text style={styles.subtitle}>
          What's your phone number?
        </Text>
        {/* Helper text from spec §4.4 */}
        <Text style={styles.helper}>So your stylist can reach you on the day.</Text>

        <TextInput
          style={styles.input}
          placeholder="+234 800 000 0000"
          placeholderTextColor={theme.color.inkMuted}
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
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.color.bg,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 100,
    },
    wordmark: {
      fontSize: 32,
      fontWeight: '800',
      color: theme.color.accentBlue,
      letterSpacing: -1,
      marginBottom: 40,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.color.ink,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 18,
      fontWeight: '500',
      color: theme.color.ink,
      marginBottom: 6,
    },
    helper: {
      fontSize: 15,
      color: theme.color.inkMuted,
      marginBottom: 32,
    },
    input: {
      height: 58,
      borderWidth: 1.5,
      borderColor: theme.color.inkFaint,
      borderRadius: 5,
      paddingHorizontal: 16,
      fontSize: 18,
      color: theme.color.ink,
      marginBottom: 16,
    },
    button: {
      height: 56,
      backgroundColor: theme.color.accentBlue,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: theme.color.inverseInk,
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
