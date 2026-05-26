// ============================================================
// VARS — Dev Mode Split Screen
// Only rendered when EXPO_PUBLIC_VENDOR_TEST_MODE=true.
// Top half: auto-logs in as the test vendor → /vendor-tabs/
// Bottom half: navigates to /onboarding (customer entry point)
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ScissorsLoader } from '@/components/ScissorsLoader';

export function DevModeSplitScreen() {
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  async function handleVendorPress() {
    setVendorError(null);
    setVendorLoading(true);

    const email    = process.env.EXPO_PUBLIC_DEV_VENDOR_EMAIL    ?? '';
    const password = process.env.EXPO_PUBLIC_DEV_VENDOR_PASSWORD ?? '';

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setVendorLoading(false);
      setVendorError('Test login failed — check .env');
      return;
    }

    router.replace('/vendor-tabs/');
  }

  function handleCustomerPress() {
    router.replace('/onboarding');
  }

  return (
    <View style={styles.container}>
      {/* Vendor half — dark */}
      <TouchableOpacity
        style={styles.vendorHalf}
        onPress={handleVendorPress}
        activeOpacity={0.85}
        disabled={vendorLoading}
      >
        {vendorLoading ? (
          <ScissorsLoader size="large" color="light" />
        ) : (
          <>
            <Text style={styles.vendorLabel}>Vendor</Text>
            {vendorError ? (
              <Text style={styles.errorText}>{vendorError}</Text>
            ) : null}
          </>
        )}
      </TouchableOpacity>

      {/* Customer half — light */}
      <TouchableOpacity
        style={styles.customerHalf}
        onPress={handleCustomerPress}
        activeOpacity={0.85}
      >
        <Text style={styles.customerLabel}>Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  vendorHalf: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerHalf: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorLabel: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
  },
  customerLabel: {
    color: '#1A1A1A',
    fontSize: 32,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});
