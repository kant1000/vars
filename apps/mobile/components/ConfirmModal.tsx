import React, { useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Colors, BORDER_RADIUS } from '@/constants/colors';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  body: string | React.ReactNode;
  confirmLabel: string;
  dismissLabel?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  destructive?: boolean;
}

export function ConfirmModal({
  visible, title, body,
  confirmLabel, dismissLabel = 'Not now',
  onConfirm, onDismiss,
  destructive = false,
}: ConfirmModalProps) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale,   { toValue: 1,    useNativeDriver: true, tension: 180, friction: 12 }),
        Animated.timing(opacity, { toValue: 1,    useNativeDriver: true, duration: 150 }),
      ]).start();
    } else {
      scale.setValue(0.92);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Pressable style={s.overlay} onPress={onDismiss}>
        <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
          <Pressable>
            <Text style={s.title}>{title}</Text>
            {typeof body === 'string'
              ? <Text style={s.body}>{body}</Text>
              : <View style={s.bodyWrap}>{body}</View>}

            <TouchableOpacity
              style={[s.confirmBtn, destructive && s.confirmBtnDestructive]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={s.confirmBtnText}>{confirmLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={s.dismissBtnText}>{dismissLabel}</Text>
            </TouchableOpacity>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.background,
    borderRadius: BORDER_RADIUS,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: 24,
  },
  bodyWrap: {
    marginBottom: 24,
  },
  confirmBtn: {
    height: 52,
    backgroundColor: Colors.ink,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  confirmBtnDestructive: {
    backgroundColor: Colors.error,
  },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dismissBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
