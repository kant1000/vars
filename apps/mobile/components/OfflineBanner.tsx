// ============================================================
// VARS — Offline banner
// Slides down from the top when isOnline=false, slides back up
// automatically when connectivity is restored.
// ============================================================
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/colors';

export function OfflineBanner({ visible }: { visible: boolean }) {
  const slideY = useRef(new Animated.Value(-52)).current;

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : -52,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={[s.wrap, { transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <Text style={s.text}>You're offline. We'll sync when you're back</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: Colors.offlineBg,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: Colors.offlineText,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
