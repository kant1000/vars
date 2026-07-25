import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VarsButton } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';

export function BiometricLockOverlay({ onRetry }: { onRetry: () => void }) {
  const { theme } = useVarsTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible animationType="none" statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: theme.color.bg, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.title, { color: theme.color.ink }]}>VARS is locked</Text>
        <Text style={[styles.body, { color: theme.color.inkMuted }]}>
          Confirm it's you to continue.
        </Text>
        <VarsButton label="Unlock" onPress={onRetry} theme={theme} style={styles.button} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minWidth: 160,
  },
});
