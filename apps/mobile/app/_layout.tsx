// ============================================================
// VARS — Root Layout
// Wraps entire app with AuthProvider.
// Handles: onboarding redirect, phone collection gate,
// and deep link auth callbacks from OAuth flows.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
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
import { ScissorsLoader } from '@/components/ScissorsLoader';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isLoading, isAuthenticated, needsPhone } = useAuth();
  const segments = useSegments();
  const [showTransition, setShowTransition] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isLoading) return;
    SplashScreen.hideAsync();
    setShowTransition(true);
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setShowTransition(false));
    }, 800);
    return () => clearTimeout(timer);
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
        // Check if session already established (e.g. by the OAuth WebBrowser flow)
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

  // Navigate to screen embedded in push notification data (e.g. consent requests)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen) router.push(screen as any);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
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
      {showTransition && (
        <Animated.View style={[lt.overlay, { opacity: fadeAnim }]}>
          <ScissorsLoader size="large" color="light" />
        </Animated.View>
      )}
    </>
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

const lt = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
});
