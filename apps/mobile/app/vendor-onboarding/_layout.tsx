// ============================================================
// VARS — Vendor Onboarding Layout
// Shows progress bar across all 5 steps
// ============================================================
import { Stack } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSegments } from 'expo-router';
import { Colors } from '@/constants/colors';

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

function ProgressBar() {
  const segments = useSegments();
  const current = getStepIndex(segments);
  const total = STEPS.length - 1; // step-5 is not a real progress step

  if (current >= 4) return null; // hide on pending screen

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressLabel}>
        Step {current + 1} of {total} — {STEPS[current]}
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
  );
}

export default function VendorOnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <ProgressBar />,
        headerLeft: () => null,
        headerStyle: { backgroundColor: Colors.background },
        headerShadowVisible: false,
        gestureEnabled: false, // prevent accidental back swipe mid-onboarding
      }}
    >
      <Stack.Screen name="step-1-profile" options={{ title: '' }} />
      <Stack.Screen name="step-2-services" options={{ title: '' }} />
      <Stack.Screen name="step-3-portfolio" options={{ title: '' }} />
      <Stack.Screen name="step-4-kyc" options={{ title: '' }} />
      <Stack.Screen name="step-5-pending" options={{ title: '', gestureEnabled: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  track: {
    flexDirection: 'row',
    gap: 4,
    width: 200,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: 5,
  },
  segmentFilled: { backgroundColor: Colors.primary },
  segmentEmpty: { backgroundColor: Colors.border },
});
