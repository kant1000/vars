import React, { useEffect, useMemo, useRef } from 'react';
import {
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
import {
  ArrowUpIcon,
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  CarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  CloseIcon,
  CreditCardIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  GearIcon,
  HeartIcon,
  HourglassIcon,
  LightningIcon,
  LockIcon,
  PenLineIcon,
  PersonIcon,
  PinIcon,
  SearchIcon,
  SparkleIcon,
  StarEmptyIcon,
  StarFilledIcon,
  StarIcon,
  WarningIcon,
  XCircleIcon,
} from '@/components/icons';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import {
  VARS_RADIUS,
  VarsElevation,
  VarsTheme,
  varsElevationStyle,
  varsLight,
} from '@/constants/visualSystem';

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

export const iconSystemNames = {
  add: { ios: 'plus', android: 'add' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward' },
  banknote: { ios: 'banknote', android: 'payments' },
  bell: { ios: 'bell', android: 'notifications' },
  briefcase: { ios: 'briefcase', android: 'work' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  car: { ios: 'car', android: 'directions_car' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle', android: 'check_circle' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronUp: { ios: 'chevron.up', android: 'keyboard_arrow_up' },
  clock: { ios: 'clock', android: 'schedule' },
  close: { ios: 'xmark', android: 'close' },
  creditCard: { ios: 'creditcard', android: 'credit_card' },
  edit: { ios: 'square.and.pencil', android: 'edit' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  gear: { ios: 'gearshape', android: 'settings' },
  heart: { ios: 'heart', android: 'favorite' },
  hourglass: { ios: 'hourglass', android: 'hourglass_empty' },
  lightning: { ios: 'bolt', android: 'bolt' },
  lock: { ios: 'lock', android: 'lock' },
  penLine: { ios: 'pencil.line', android: 'edit_note' },
  person: { ios: 'person', android: 'person' },
  pin: { ios: 'mappin', android: 'location_on' },
  search: { ios: 'magnifyingglass', android: 'search' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome' },
  star: { ios: 'star', android: 'star' },
  starFilled: { ios: 'star.fill', android: 'star' },
  starEmpty: { ios: 'star', android: 'star_border' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  xCircle: { ios: 'xmark.circle', android: 'cancel' },
} as const;

export type VarsIconName = keyof typeof iconSystemNames;

const SvgIconByName: Record<VarsIconName, React.ComponentType<{ size?: number; color?: string }>> = {
  add: CheckIcon,
  arrowUp: ArrowUpIcon,
  banknote: BanknoteIcon,
  bell: BellIcon,
  briefcase: BriefcaseIcon,
  calendar: CalendarIcon,
  car: CarIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  chevronDown: ChevronDownIcon,
  chevronRight: ChevronRightIcon,
  chevronUp: ChevronUpIcon,
  clock: ClockIcon,
  close: CloseIcon,
  creditCard: CreditCardIcon,
  edit: EditIcon,
  eye: EyeIcon,
  eyeOff: EyeOffIcon,
  gear: GearIcon,
  heart: HeartIcon,
  hourglass: HourglassIcon,
  lightning: LightningIcon,
  lock: LockIcon,
  penLine: PenLineIcon,
  person: PersonIcon,
  pin: PinIcon,
  search: SearchIcon,
  sparkle: SparkleIcon,
  star: StarIcon,
  starFilled: StarFilledIcon,
  starEmpty: StarEmptyIcon,
  warning: WarningIcon,
  xCircle: XCircleIcon,
};

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
  const Icon = SvgIconByName[name];
  return <Icon size={size} color={color ?? theme.color.ink} />;
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
  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, { color: theme.color.inkMuted }]}>{label}</Text> : null}
      <TextInput
        {...props}
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

export function VarsSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  theme = varsLight,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
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

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

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
    <View style={[styles.toast, { backgroundColor: theme.color.ink }]}>
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
        <Pressable style={[styles.dialog, panelStyle]}>
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
