// ============================================================
// VARS — Onboarding Splash Screens (§4.1)
// 3 screens: full bleed background, minimal text overlay
// Screen 1: "Beauty at your door"
// Screen 2: "Find someone near you"
// Screen 3: "Book, pay, relax" → CTA: "Get Started"
// After screen 3: location permission → home screen
// ============================================================

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  ViewToken,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    headline: 'Beauty at your door.',
    sub: 'Top-rated professionals. Your space, your time.',
    bg: Colors.primary,
  },
  {
    id: '2',
    headline: 'Find someone near you.',
    sub: 'VARS knows where fresh is.',
    bg: '#0060CC',
  },
  {
    id: '3',
    headline: 'Book, pay, relax.',
    sub: 'Your payment is held securely until your service is done.',
    bg: '#004BA0',
    isCta: true,
  },
] as const;

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  const handleGetStarted = async () => {
    // Request location permission — required before home screen loads (§4.1)
    await Location.requestForegroundPermissionsAsync();

    // Mark onboarding complete so we never show it again
    await AsyncStorage.setItem('vars_onboarding_done', '1');

    router.replace('/(tabs)');
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Per spec §4.2: swipe between tabs disabled — same principle here;
        // but onboarding swipe is intentional UX
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg }]}>
            {/* Full bleed background placeholder — replace with actual images */}
            <View style={styles.bgOverlay} />

            <View style={styles.content}>
              {/* VARS wordmark */}
              <Text style={styles.wordmark}>VARS</Text>

              {/* Headline */}
              <Text style={styles.headline}>{item.headline}</Text>
              <Text style={styles.sub}>{item.sub}</Text>

              {item.isCta ? (
                <TouchableOpacity
                  style={styles.ctaButton}
                  onPress={handleGetStarted}
                  activeOpacity={0.85}
                >
                  <Text style={styles.ctaText}>Get Started</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNext}
                  activeOpacity={0.85}
                >
                  <Text style={styles.nextText}>Next</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />

      {/* Page dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  slide: {
    width,
    height,
    justifyContent: 'flex-end',
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  content: {
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  wordmark: {
    fontWeight: '800',
    fontSize: 36,
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 24,
  },
  headline: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 42,
    marginBottom: 12,
  },
  sub: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 24,
    marginBottom: 40,
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  nextButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  dots: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 20,
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
