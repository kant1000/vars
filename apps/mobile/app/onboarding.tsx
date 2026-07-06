// ============================================================
// VARS — Onboarding Screens (V2 Brand Direction)
// 3 swipeable screens with Doré-style illustrations
// White bg, black ink, blue CTA accent only
// Shows once on first launch, never again
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
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    image: require('../assets/images/onboarding1.png'),
    headline: 'Beauty at your door.',
    sub: 'Top-rated professionals. Your space, your time.',
  },
  {
    id: '2',
    image: require('../assets/images/onboarding2.png'),
    headline: 'Find someone near you.',
    sub: 'VARS knows where fresh is.',
  },
  {
    id: '3',
    image: require('../assets/images/onboarding3.png'),
    headline: 'Book, pay, relax.',
    sub: 'Your payment is held securely until your service is done.',
    isCta: true,
  },
] as const;

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  const handleGetStarted = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await Location.requestForegroundPermissionsAsync();
      await AsyncStorage.setItem('vars_onboarding_done', '1');
      router.replace('/(tabs)');
    } finally {
      setStarting(false);
    }
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            {/* Full bleed illustration */}
            <Image
              source={item.image}
              style={styles.illustration}
              contentFit="cover"
            />

            {/* Bottom content panel */}
            <View style={styles.content}>
              <Text style={styles.headline}>{item.headline}</Text>
              <Text style={styles.sub}>{item.sub}</Text>

              {item.isCta ? (
                <>
                  <TouchableOpacity
                    style={[styles.ctaButton, starting && { opacity: 0.7 }]}
                    onPress={handleGetStarted}
                    disabled={starting}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ctaText}>
                      {starting ? 'Just a moment…' : 'Get Started'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.stylistLink}
                    onPress={() => router.replace('/auth/vendor-login')}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stylistLinkText}>STYLIST LOGIN  ›</Text>
                  </TouchableOpacity>
                </>
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
    backgroundColor: Colors.background,
  },
  slide: {
    width,
    height,
    backgroundColor: Colors.background,
  },
  illustration: {
    width,
    height: height * 0.62,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 48,
    backgroundColor: Colors.background,
    justifyContent: 'space-between',
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: Colors.ink,
    borderRadius: 5,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  nextButton: {
    borderWidth: 1.5,
    borderColor: Colors.ink,
    borderRadius: 5,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 24,
  },
  nextText: {
    color: Colors.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  stylistLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  stylistLinkText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  dots: {
    position: 'absolute',
    bottom: 24,
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
    backgroundColor: Colors.ink,
    width: 20,
  },
  dotInactive: {
    backgroundColor: Colors.dotInactive,
  },
});
