import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { MIN_SERVICE_PRICE_KOBO } from '@vars/shared';

const MIN_PRICE = MIN_SERVICE_PRICE_KOBO / 100;

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  pioneer?: boolean;
  pioneerBookingsCompleted?: number;
}

function formatNaira(n: number) {
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

export function VendorPriceInput({
  value,
  onChangeText,
  pioneer = false,
  pioneerBookingsCompleted = 0,
}: Props) {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const num = Number(value);
  const hasValue = value.trim() !== '' && num > 0 && !isNaN(num);
  const isPioneerActive = pioneer && pioneerBookingsCompleted < 3;

  const previewText = hasValue
    ? isPioneerActive
      ? `You keep 100% — Pioneer booking · ${formatNaira(num)}`
      : `You'll receive: ${formatNaira(num * 0.8)}`
    : null;

  const handleBlur = () => {
    const n = Number(value);
    if (value.trim() !== '' && !isNaN(n) && n < MIN_PRICE) {
      onChangeText(String(MIN_PRICE));
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <Text style={styles.prefix}>₦</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onBlur={handleBlur}
          placeholder={MIN_PRICE.toLocaleString('en-NG')}
          placeholderTextColor={theme.color.inkMuted}
          keyboardType="numeric"
          returnKeyType="done"
        />
      </View>
      {previewText && <Text style={styles.preview}>{previewText}</Text>}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    wrapper: { marginBottom: 4 },

    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      height: 44, borderWidth: 1.5, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 12, backgroundColor: theme.color.surface2,
    },
    prefix: { fontSize: 16, fontWeight: '600', color: theme.color.ink, marginRight: 4 },
    input: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.color.ink },

    preview: { marginTop: 4, fontSize: 13, color: theme.color.inkMuted },
  });
}
