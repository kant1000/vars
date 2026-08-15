// ============================================================
// VARS — PhoneInput
// Fixed country-code chip (default +234) + a 10-digit local-part field.
// Typing/pasting a leading 0, "234", or "+234" self-resolves to the right
// 10 digits (last-10-digits rule — see @vars/shared normalizePhone).
// ============================================================

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CountryCode, PHONE_COUNTRIES, isValidPhone } from '@vars/shared';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';

const EXAMPLE_LOCAL: Record<CountryCode, string> = {
  '+234': '801 234 5678',
  '+1':   '209 421 6229',
  '+44':  '7344 975063',
};

interface PhoneInputProps {
  value: string; // local digits only, 0-10 chars
  country: CountryCode;
  onChangeValue: (digits: string) => void;
  onChangeCountry: (country: CountryCode) => void;
  autoFocus?: boolean;
}

export function PhoneInput({ value, country, onChangeValue, onChangeCountry, autoFocus }: PhoneInputProps) {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = PHONE_COUNTRIES.find((c) => c.code === country) ?? PHONE_COUNTRIES[0];
  const showError = value.length === 10 && !isValidPhone(value, country);

  const handleChangeText = (text: string) => {
    const digits = text.replace(/\D/g, '');
    onChangeValue(digits.length > 10 ? digits.slice(-10) : digits);
  };

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.7}
          accessibilityLabel="Select country code"
          accessibilityRole="button"
        >
          <Text style={styles.chipText}>{selected.flag} {selected.code}</Text>
        </TouchableOpacity>

        <TextInput
          style={[styles.input, showError && styles.inputError]}
          placeholder={EXAMPLE_LOCAL[country]}
          placeholderTextColor={theme.color.inkMuted}
          value={value}
          onChangeText={handleChangeText}
          keyboardType="phone-pad"
          maxLength={20}
          autoFocus={autoFocus}
        />
      </View>

      {value.length > 0 && value.length < 10 && (
        <Text style={styles.helper}>{10 - value.length} more digit{10 - value.length === 1 ? '' : 's'}</Text>
      )}
      {showError && (
        <Text style={styles.error}>Check this is a valid {selected.label} mobile number</Text>
      )}

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet}>
            {PHONE_COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={styles.sheetRow}
                onPress={() => { onChangeCountry(c.code); setPickerOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetRowText}>{c.flag} {c.label} ({c.code})</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 10 },
    chip: {
      height: 54, paddingHorizontal: 14,
      borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.bg,
    },
    chipText: { fontSize: 16, color: theme.color.ink, fontWeight: '600' },
    input: {
      flex: 1, height: 54, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS, paddingHorizontal: 16,
      fontSize: 16, color: theme.color.ink,
      backgroundColor: theme.color.bg,
    },
    inputError: { borderColor: theme.color.accentRed },
    helper: { fontSize: 13, color: theme.color.inkMuted, marginTop: 6, marginLeft: 4 },
    error: { fontSize: 13, color: theme.color.accentRed, marginTop: 6, marginLeft: 4 },
    overlay: {
      flex: 1, backgroundColor: theme.color.overlay,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
    },
    sheet: {
      width: '100%', backgroundColor: theme.color.bg,
      borderRadius: BORDER_RADIUS, paddingVertical: 8,
    },
    sheetRow: { paddingVertical: 16, paddingHorizontal: 20 },
    sheetRowText: { fontSize: 16, color: theme.color.ink, fontWeight: '500' },
  });
}
