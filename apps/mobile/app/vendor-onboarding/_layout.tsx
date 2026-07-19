// ============================================================
// VARS — Vendor Onboarding Layout
// Shows progress bar across all 5 steps.
// Shows Pioneer banner when vendor.pioneer = TRUE.
// ============================================================
import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VendorOnboardingProvider, useVendorOnboarding } from '@/contexts/VendorOnboardingContext';

const STEPS = [
  'Profile',
  'Services',
  'Portfolio',
  'Verify',
  'Pending',
];

function getStepIndex(segments: string[]): number {
  const last = segments[segments.length - 1];
  if (last?.includes('step-1')) return 0;
  if (last?.includes('step-2')) return 1;
  if (last?.includes('step-3')) return 2;
  if (last?.includes('step-4')) return 3;
  if (last?.includes('step-5')) return 4;
  return 0;
}

function OnboardingHeader() {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const segments = useSegments();
  const { isPioneer } = useVendorOnboarding();
  const current = getStepIndex(segments);
  const total = STEPS.length - 1;
  const showProgress = current < 4;

  return (
    <View style={styles.headerContainer}>
      {isPioneer && (
        <View style={styles.pioneerBanner}>
          <Text style={styles.pioneerText}>VARS Pioneer · 0% commission on your first 3 bookings</Text>
        </View>
      )}
      {showProgress && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>
            Step {current + 1} of {total} · {STEPS[current]}
          </Text>
          <View style={styles.track}>
            {STEPS.slice(0, total).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  i <= current ? styles.segmentFilled : styles.segmentEmpty,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function VendorOnboardingLayout() {
  const { theme } = useVarsTheme();

  return (
    <VendorOnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: () => <OnboardingHeader />,
          headerLeft: () => null,
          headerStyle: { backgroundColor: theme.color.bg },
          headerShadowVisible: false,
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="step-1-profile" options={{ title: '' }} />
        <Stack.Screen name="step-2-services" options={{ title: '' }} />
        <Stack.Screen name="step-3-portfolio" options={{ title: '' }} />
        <Stack.Screen name="step-4-kyc" options={{ title: '' }} />
        <Stack.Screen name="step-5-pending" options={{ title: '', gestureEnabled: false }} />
      </Stack>
    </VendorOnboardingProvider>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    headerContainer: { alignItems: 'center', gap: 6 },

    pioneerBanner: {
      backgroundColor: theme.color.ink,
      borderRadius: BORDER_RADIUS,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    pioneerText: {
      color: theme.color.inverseInk,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.1,
    },

    progressContainer: { alignItems: 'center', paddingVertical: 2 },
    progressLabel: {
      fontSize: 12,
      color: theme.color.inkMuted,
      marginBottom: 6,
      fontWeight: '500',
    },
    track: { flexDirection: 'row', gap: 4, width: 200 },
    segment: { flex: 1, height: 3, borderRadius: BORDER_RADIUS },
    segmentFilled: { backgroundColor: theme.color.ink },
    segmentEmpty: { backgroundColor: theme.color.inkFaint },
  });
}
