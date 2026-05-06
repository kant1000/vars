// ============================================================
// VARS — VendorPriceInput
// Wraps a numeric TextInput and shows a live earnings preview
// (standard take-home, or 100% for active pioneer vendors).
// ============================================================
import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { Colors } from '@/constants/colors';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> {
  value: string;
  onChangeText: (v: string) => void;
  /** vendor.pioneer from the vendors table */
  pioneer?: boolean;
  /** vendor.pioneer_bookings_completed from the vendors table */
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
  placeholder = 'Price',
  placeholderTextColor = Colors.textMuted,
  ...rest
}: Props) {
  const num = Number(value);
  const showPreview = value.trim() !== '' && num > 0 && !isNaN(num);

  // Pioneer window: first 3 completed bookings keep 100%
  const isPioneerActive = pioneer && pioneerBookingsCompleted < 3;

  let previewText = '';
  if (showPreview) {
    previewText = isPioneerActive
      ? `You keep 100% — Pioneer booking · ${formatNaira(num)}`
      : `You'll receive: ${formatNaira(num * 0.8)}`;
  }

  return (
    <View>
      <View style={styles.inputRow}>
        <Text style={styles.nairaSign}>₦</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          style={styles.input}
          {...rest}
        />
      </View>
      {showPreview && (
        <Text style={styles.preview} accessible={false}>
          {previewText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nairaSign: { fontSize: 18, fontWeight: '600', color: Colors.text },
  input: {
    flex: 1, height: 44,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, fontSize: 16, color: Colors.text,
  },
  preview: {
    marginTop: 4,
    fontSize: 13,
    color: Colors.textMuted,
  },
});
