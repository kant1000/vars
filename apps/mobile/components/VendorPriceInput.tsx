import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
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
          placeholderTextColor={Colors.textMuted}
          keyboardType="numeric"
          returnKeyType="done"
        />
      </View>
      {previewText && <Text style={styles.preview}>{previewText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 4 },

  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 5,
    paddingHorizontal: 12, backgroundColor: Colors.surface,
  },
  prefix: { fontSize: 16, fontWeight: '600', color: Colors.text, marginRight: 4 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },

  preview: { marginTop: 4, fontSize: 13, color: Colors.textMuted },
});
