// ============================================================
// VARS — Root Layout
// Wraps entire app with AuthProvider.
// Handles: onboarding redirect, phone collection gate,
// and deep link auth callbacks from OAuth flows.
// ============================================================

import { useEffect } from 'react';
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

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync();
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = segments.join('/');

    // Gate: authenticated users without phone → phone collection screen
    if (isAuthenticated && needsPhone && currentRoute !== 'auth/phone') {
      router.replace('/auth/phone');
      return;
    }

    // First launch → show onboarding
    AsyncStorage.getItem('vars_onboarding_done').then((done) => {
      if (!done && currentRoute !== 'onboarding') {
        router.replace('/onboarding');
      }
    });
  }, [isLoading, isAuthenticated, needsPhone, segments]);

  // Handle OAuth deep link callback (e.g. vars://auth/callback?code=xxx)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (url.includes('auth/callback')) {
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

  // Navigate to screen embedded in push notification data (e.g. consent requests)
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
      <Stack.Screen name="consent/[photoId]" />
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
