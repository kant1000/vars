// ============================================================
// VARS — Root Layout
// Wraps entire app with AuthProvider.
// Routing: splash stays up until auth + onboarding state both known,
// then routes once to the right screen with no intermediate flash.
// ============================================================

import { useEffect, useRef, useState } from 'react';
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

SplashScreen.preventAutoHideAsync();

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
    if (!onboardingDone) {
      router.replace('/onboarding');
      return;
    }
    const route = segments.join('/');
    if (!route || route === 'index') {
      router.replace('/(tabs)');
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
