// ============================================================
// VARS — Root Layout
// Wraps entire app with AuthProvider.
// Routing: splash stays up until auth + onboarding state both known,
// then routes once to the right screen with no intermediate flash.
// ============================================================

import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Component, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// ── Debug error boundary — shows full error on screen instead of crashing ──
import { Text, View } from 'react-native';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) {
    // Persist crash so it survives even if the error screen itself fails
    AsyncStorage.setItem('vars_last_crash', JSON.stringify({
      message: error.message,
      stack: (error.stack ?? '').slice(0, 3000),
      componentStack: (info?.componentStack ?? '').slice(0, 2000),
      time: new Date().toISOString(),
    })).catch(() => {});
  }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error.message ?? '');
    const stack = String(this.state.error.stack ?? '').slice(0, 2000);
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff', paddingTop: 60, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#cc0000', marginBottom: 12 }}>
          {'JS Error: ' + msg}
        </Text>
        <ScrollView>
          <Text style={{ fontSize: 11, color: '#333333', lineHeight: 16 }}>
            {stack}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__,
});

SplashScreen.preventAutoHideAsync();

// Returns the correct onboarding route to resume at, or null if onboarding is complete.
// Uses DB state so it never drifts from reality (unlike AsyncStorage which can be cleared).
function getVendorOnboardingStep(vendor: {
  phone_number: string | null;
  paystack_subaccount_code: string | null;
  kyc_status: string | null;
}, hasServices: boolean): string | null {
  // Step 1 incomplete — no phone number yet
  if (!vendor.phone_number) return '/vendor-onboarding/step-1-profile';
  // Step 2 incomplete — no services added yet
  if (!hasServices) return '/vendor-onboarding/step-2-services';
  // Steps 2+3 may or may not be done but KYC is already pending/needs_review —
  // route to polling screen (vendor already submitted, can't go back to add services)
  if (vendor.kyc_status === 'pending' || vendor.kyc_status === 'needs_review') {
    return '/vendor-onboarding/step-5-pending';
  }
  // Step 4 incomplete — bank not done, or KYC not started / was rejected
  if (!vendor.paystack_subaccount_code || !vendor.kyc_status || vendor.kyc_status === 'rejected') {
    return '/vendor-onboarding/step-4-kyc';
  }
  // KYC submitted but not yet verified
  if (vendor.kyc_status !== 'verified') return '/vendor-onboarding/step-5-pending';
  // All steps complete
  return null;
}

function RootNavigator() {
  const { isLoading, isAuthenticated, needsPhone } = useAuth();
  const segments = useSegments();

  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const didInitRoute = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('vars_onboarding_done').then((v) => {
      setOnboardingDone(!!v);
      setOnboardingReady(true);
    });
  }, []);

  const appReady = !isLoading && onboardingReady;

  // Initial routing — fires once when auth + onboarding state are both known.
  // Splash stays up until this runs, so the user never sees a blank frame.
  useEffect(() => {
    if (!appReady || didInitRoute.current) return;
    didInitRoute.current = true;
    SplashScreen.hideAsync();

    if (isAuthenticated && needsPhone) {
      router.replace('/auth/phone');
      return;
    }
    const route = segments.join('/');
    if (!route || route === 'index') {
      if (isAuthenticated) {
        // Always check vendor state first — vendors must never hit customer onboarding.
        // Sets vars_onboarding_done as a side-effect so future cold starts are instant.
        (async () => {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
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

            if (vendor) {
              await AsyncStorage.setItem('vars_onboarding_done', 'true');
              const onboardingStep = getVendorOnboardingStep(vendor, (serviceCount ?? 0) > 0);
              if (onboardingStep) {
                router.replace(onboardingStep as any);
                return;
              }
              router.replace('/(vendor-tabs)/profile');
              return;
            }
          }
          // Not a vendor — customer onboarding gate
          if (!onboardingDone) {
            router.replace('/onboarding');
            return;
          }
          router.replace('/(tabs)');
        })();
      } else {
        if (!onboardingDone) {
          router.replace('/onboarding');
          return;
        }
        router.replace('/(tabs)');
      }
    }
  }, [appReady, isAuthenticated, needsPhone, onboardingDone]);

  // Phone gate — handles auth state changes after the initial route is set
  useEffect(() => {
    if (!appReady || !didInitRoute.current) return;
    if (isAuthenticated && needsPhone) {
      const route = segments.join('/');
      if (route !== 'auth/phone') router.replace('/auth/phone');
    }
  }, [isAuthenticated, needsPhone, appReady, segments]);

  // Handle OAuth deep link callback (e.g. vars://auth/callback?code=xxx)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (url.includes('auth/callback')) {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing) {
          router.replace('/(tabs)');
          return;
        }
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);
        if (!error && data.session) {
          router.replace('/(tabs)');
        }
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);

  // Navigate to screen embedded in push notification tap
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(vendor-tabs)" />
      <Stack.Screen name="auth/login" options={{ presentation: 'modal' }} />
      <Stack.Screen name="auth/phone" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="vendor/[id]" />
      <Stack.Screen name="booking/[vendorId]" />
      <Stack.Screen name="consent/[photoId]" />
      <Stack.Screen name="booking/detail/[bookingId]" />
      <Stack.Screen name="vendor-zone-setup" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function RootLayout() {
  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ''}
      options={{ host: 'https://eu.i.posthog.com' }}
      autocapture={false}
    >
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <RootNavigator />
          </AuthProvider>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
    </PostHogProvider>
  );
}

function RootLayoutWithBoundary() {
  return <ErrorBoundary><RootLayout /></ErrorBoundary>;
}

export default Sentry.wrap(RootLayoutWithBoundary);

