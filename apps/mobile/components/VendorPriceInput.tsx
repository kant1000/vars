// ============================================================
// VARS — VendorPriceInput
// Tappable "Set price" row that opens a bottom-sheet scroll
// picker (₦10,000–₦999,000 in ₦1,000 steps). Shows a live
// earnings preview below the row once a price is selected.
// ============================================================
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Picker } from '@react-native-picker/picker';
import { Colors } from '@/constants/colors';
import { MIN_SERVICE_PRICE_KOBO } from '@vars/shared';

const MIN_PRICE = MIN_SERVICE_PRICE_KOBO / 100; // ₦10,000
const MAX_PRICE = 999_000;
const STEP = 1_000;

const PRICE_OPTIONS: number[] = Array.from(
  { length: (MAX_PRICE - MIN_PRICE) / STEP + 1 },
  (_, i) => MIN_PRICE + i * STEP,
);

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
  const sheetRef = useRef<BottomSheetModal>(null);
  const [pendingValue, setPendingValue] = useState<number>(MIN_PRICE);

  const num = Number(value);
  const hasValue = value.trim() !== '' && num > 0 && !isNaN(num);
  const isPioneerActive = pioneer && pioneerBookingsCompleted < 3;

  const previewText = hasValue
    ? isPioneerActive
      ? `You keep 100% — Pioneer booking · ${formatNaira(num)}`
      : `You'll receive: ${formatNaira(num * 0.8)}`
    : null;

  const handleOpen = () => {
    setPendingValue(hasValue ? num : MIN_PRICE);
    sheetRef.current?.present();
  };

  const handleConfirm = () => {
    onChangeText(String(pendingValue));
    sheetRef.current?.dismiss();
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={styles.row} onPress={handleOpen} activeOpacity={0.7}>
        <Text style={[styles.rowText, !hasValue && styles.rowPlaceholder]}>
          {hasValue ? formatNaira(num) : 'Set price'}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      {previewText && (
        <Text style={styles.preview}>{previewText}</Text>
      )}

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['45%']}
        enableDynamicSizing={false}
      >
        <BottomSheetView style={styles.sheet}>
          <Text style={styles.sheetTitle}>Set your price</Text>
          <Picker
            selectedValue={pendingValue}
            onValueChange={(v) => setPendingValue(v as number)}
            style={styles.picker}
          >
            {PRICE_OPTIONS.map((p) => (
              <Picker.Item key={p} label={formatNaira(p)} value={p} />
            ))}
          </Picker>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={styles.confirmText}>Confirm</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, backgroundColor: Colors.surface,
  },
  rowText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowPlaceholder: { color: Colors.textMuted, fontWeight: '400' },
  chevron: { fontSize: 20, color: Colors.textMuted, lineHeight: 24 },

  preview: { marginTop: 4, fontSize: 13, color: Colors.textMuted },

  sheet: { paddingHorizontal: 24, paddingBottom: 24 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  picker: { width: '100%' },
  confirmBtn: {
    height: 52, backgroundColor: Colors.primary, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  confirmText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
