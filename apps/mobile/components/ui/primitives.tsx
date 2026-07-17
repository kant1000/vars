import React, { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { CheckIcon } from '@/components/icons';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VarsIconRenderer } from './VarsIconRenderer';
import { iconSystemNames, VarsIconName } from './iconMap';
import {
  VARS_RADIUS,
  VarsElevation,
  VarsTheme,
  varsElevationStyle,
  varsLight,
} from '@/constants/visualSystem';

export { iconSystemNames };
export type { VarsIconName };

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const TONE_ACCENT: Record<Tone, keyof VarsTheme['color']> = {
  neutral: 'ink',
  success: 'accentGreen',
  warning: 'accentAmber',
  danger: 'accentRed',
  info: 'accentBlue',
};

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  return reduceMotion;
}

export function VarsIcon({
  name,
  size = 18,
  color,
  theme = varsLight,
}: {
  name: VarsIconName;
  size?: number;
  color?: string;
  theme?: VarsTheme;
}) {
  return <VarsIconRenderer name={name} size={size} color={color ?? theme.color.ink} />;
}

export function VarsSurface({
  children,
  theme = varsLight,
  elevation = 0,
  style,
}: {
  children: React.ReactNode;
  theme?: VarsTheme;
  elevation?: VarsElevation;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, varsElevationStyle(theme, elevation), style]}>{children}</View>;
}

export function VarsButton({
  label,
  onPress,
  theme = varsLight,
  variant = 'primary',
  size = 'lg',
  tone = 'neutral',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  theme?: VarsTheme;
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  icon?: VarsIconName;
  style?: StyleProp<ViewStyle>;
}) {
  const accent = theme.color[TONE_ACCENT[tone]];
  const isPrimary = variant === 'primary';
  const fg = isPrimary ? theme.color.inverseInk : variant === 'secondary' ? theme.color.ink : accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${size}`],
        {
          backgroundColor: isPrimary ? theme.color.ink : 'transparent',
          borderColor: variant === 'ghost' ? 'transparent' : theme.color.ink,
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ScissorsLoader size="small" color={isPrimary ? 'light' : 'dark'} />
      ) : (
        <>
          {icon ? <VarsIcon name={icon} size={16} color={fg} theme={theme} /> : null}
          <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function VarsInput({
  label,
  error,
  theme = varsLight,
  containerStyle,
  style,
  ...props
}: TextInputProps & {
  label?: string;
  error?: string;
  theme?: VarsTheme;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const accessibilityLabel = props.accessibilityLabel ?? label ?? props.placeholder;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: theme.color.inkMuted }]}>{label}</Text> : null}
      <TextInput
        {...props}
        accessibilityLabel={accessibilityLabel}
        placeholderTextColor={theme.color.inkMuted}
        style={[
          styles.input,
          {
            color: theme.color.ink,
            borderColor: error ? theme.color.accentRed : theme.color.inkFaint,
            backgroundColor: theme.color.surface0,
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.errorText, { color: theme.color.accentRed }]}>{error}</Text> : null}
    </View>
  );
}

export function VarsCheckbox({
  checked,
  onChange,
  label,
  theme = varsLight,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  theme?: VarsTheme;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.checkRow, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
    >
      <View
        style={[
          styles.checkBox,
          {
            backgroundColor: checked ? theme.color.ink : 'transparent',
            borderColor: checked ? theme.color.ink : theme.color.inkFaint,
          },
        ]}
      >
        {checked ? <CheckIcon size={14} color={theme.color.inverseInk} /> : null}
      </View>
      <Text style={[styles.checkLabel, { color: theme.color.ink }]}>{label}</Text>
    </Pressable>
  );
}

const SWITCH_TRACK_WIDTH = 44;
const SWITCH_TRACK_HEIGHT = 26;
const SWITCH_THUMB_SIZE = 22;
const SWITCH_TRACK_PADDING = 2;
const SWITCH_THUMB_TRAVEL = SWITCH_TRACK_WIDTH - SWITCH_THUMB_SIZE - SWITCH_TRACK_PADDING * 2;

export function VarsSwitch({
  value,
  onChange,
  label,
  theme = varsLight,
  disabled = false,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  theme?: VarsTheme;
  disabled?: boolean;
}) {
  const thumbPosition = useRef(new Animated.Value(value ? 1 : 0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      thumbPosition.setValue(value ? 1 : 0);
      return;
    }

    Animated.timing(thumbPosition, {
      toValue: value ? 1 : 0,
      duration: 160,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [value, thumbPosition, reduceMotion]);

  const translateX = thumbPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SWITCH_THUMB_TRAVEL],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.checkRow, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
    >
      {label ? <Text style={[styles.checkLabel, { color: theme.color.ink }]}>{label}</Text> : null}
      <View
        style={[
          styles.switchTrack,
          {
            backgroundColor: value
              ? theme.color.accentGreen
              : theme.appearance === 'dark'
              ? theme.color.surface3
              : theme.color.surface2,
            borderColor: value ? 'transparent' : theme.color.inkFaint,
          },
        ]}
      >
        <Animated.View
          style={[styles.switchThumb, { borderColor: theme.color.inkFaint, transform: [{ translateX }] }]}
        />
      </View>
    </Pressable>
  );
}

export function VarsSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  theme = varsLight,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  theme?: VarsTheme;
}) {
  return (
    <View style={[styles.segmentWrap, { borderColor: theme.color.inkFaint }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.color.ink }]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selected ? theme.color.inverseInk : theme.color.inkMuted },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function VarsTabItem({
  focused,
  icon,
  label,
  theme = varsLight,
}: {
  focused: boolean;
  icon: VarsIconName;
  label: string;
  theme?: VarsTheme;
}) {
  const color = focused ? theme.color.ink : theme.color.inkMuted;
  return (
    <View style={styles.tabItem}>
      <VarsIcon name={icon} size={22} color={color} theme={theme} />
      <Text
        style={[styles.tabItemLabel, { color, fontWeight: focused ? '700' : '400' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export function VarsSkeleton({
  theme = varsLight,
  width = '100%',
  height,
  radius = VARS_RADIUS,
  style,
}: {
  theme?: VarsTheme;
  width?: ViewStyle['width'];
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.7);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          opacity: pulse,
          backgroundColor: theme.appearance === 'dark' ? theme.color.surface3 : theme.color.surface2,
        },
        style,
      ]}
    />
  );
}

export function VarsToast({
  message,
  actionLabel,
  onAction,
  theme = varsLight,
  tone = 'neutral',
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  theme?: VarsTheme;
  tone?: Tone;
}) {
  const accent = theme.color[TONE_ACCENT[tone]];
  return (
    <View
      accessibilityLabel={actionLabel ? `${message}. ${actionLabel}` : message}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: theme.color.ink }]}
    >
      <View style={[styles.toastDot, { backgroundColor: accent }]} />
      <Text style={[styles.toastText, { color: theme.color.inverseInk }]} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={[styles.toastAction, { color: theme.color.inverseInk }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VarsDialog({
  visible,
  title,
  body,
  confirmLabel,
  dismissLabel = 'Not now',
  onConfirm,
  onDismiss,
  theme = varsLight,
  tone = 'neutral',
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  dismissLabel?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  theme?: VarsTheme;
  tone?: Tone;
}) {
  const accent = theme.color[TONE_ACCENT[tone]];
  const panelStyle = useMemo(() => varsElevationStyle(theme, 4), [theme]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={[styles.dialogOverlay, { backgroundColor: theme.color.overlay }]} onPress={onDismiss}>
        <Pressable
          accessibilityLabel={title}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[styles.dialog, panelStyle]}
        >
          <View style={[styles.dialogRail, { backgroundColor: accent }]} />
          <Text style={[styles.dialogTitle, { color: theme.color.ink }]}>{title}</Text>
          <Text style={[styles.dialogBody, { color: theme.color.inkMuted }]}>{body}</Text>
          <VarsButton label={confirmLabel} onPress={onConfirm} theme={theme} tone={tone} />
          <VarsButton label={dismissLabel} onPress={onDismiss} theme={theme} variant="ghost" size="md" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: VARS_RADIUS,
  },
  button: {
    borderRadius: VARS_RADIUS,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  button_sm: { height: 36 },
  button_md: { height: 46 },
  button_lg: { height: 56 },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    borderRadius: VARS_RADIUS,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  checkRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: VARS_RADIUS,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  // Pill radius (height / 2), not VARS_RADIUS: a switch track is treated like the
  // circular-element exception (avatars, status dots) so it still reads as a toggle.
  switchTrack: {
    width: SWITCH_TRACK_WIDTH,
    height: SWITCH_TRACK_HEIGHT,
    borderRadius: SWITCH_TRACK_HEIGHT / 2,
    borderWidth: 1.5,
    padding: SWITCH_TRACK_PADDING,
    justifyContent: 'center',
  },
  switchThumb: {
    width: SWITCH_THUMB_SIZE,
    height: SWITCH_THUMB_SIZE,
    borderRadius: SWITCH_THUMB_SIZE / 2,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  segmentWrap: {
    minHeight: 44,
    flexDirection: 'row',
    borderRadius: VARS_RADIUS,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabItem: {
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabItemLabel: {
    fontSize: 11,
  },
  toast: {
    minHeight: 52,
    borderRadius: VARS_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toastDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  toastAction: {
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  dialogOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    borderRadius: VARS_RADIUS,
    padding: 22,
    overflow: 'hidden',
  },
  dialogRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 10,
  },
  dialogBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
});
