// ============================================================
// VARS — Edit Service
// Reached from the vendor profile "My Services" section.
// Pre-fills an existing service; on save updates in-place.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VendorPriceInput } from '@/components/VendorPriceInput';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import {
  CATEGORY_L1, CATEGORY_L1_LABELS, CATEGORY_L2_MAP, CATEGORY_L2_LABELS,
  MIN_SERVICE_PRICE_KOBO, SERVICE_NAME_MAX_CHARS, SERVICE_DESC_MAX_CHARS,
} from '@vars/shared';
import { sanitizeContent } from '@/lib/format';

const L1_KEYS = Object.values(CATEGORY_L1) as string[];

const NAME_PLACEHOLDER: Record<string, string> = {
  hair:   'e.g. Knotless Braids',
  barber: 'e.g. Low Fade',
  face:   'e.g. Full Glam',
  nails:  'e.g. Gel Manicure',
};

const DESC_PLACEHOLDER: Record<string, string> = {
  hair:   'e.g. Knotless braids, mid-back length, feeds included...',
  barber: 'e.g. Low fade with line-up and beard shape-up...',
  face:   'e.g. Full glam beat, contouring and lashes included...',
  nails:  'e.g. Gel extensions, any shape, nail art on request...',
};

function durationLabel(b: number): string {
  if (b === 1) return '30 min';
  if (b < 4) return `${b * 30} min`;
  return `${b / 2} hr${b / 2 > 1 ? 's' : ''}`;
}

const BASE_DURATIONS = [1, 2, 3, 4, 6, 8].map(b => ({ blocks: b, label: durationLabel(b) }));
const BRAIDS_EXTRA  = [10, 12, 14, 16].map(b => ({ blocks: b, label: durationLabel(b) }));
const BRAIDS_DURATIONS = [...BASE_DURATIONS, ...BRAIDS_EXTRA];

export default function EditServiceScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [formL1, setFormL1] = useState<string>(CATEGORY_L1.HAIR);
  const [formL2, setFormL2] = useState<string>('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState<number | null>(null);

  const [vendorPioneer, setVendorPioneer] = useState<{ pioneer: boolean; pioneer_bookings_completed: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user || !id) { setIsLoading(false); return; }

    Promise.all([
      supabase.from('vendor_services')
        .select('category_l1, category_l2, service_name, description, price_kobo, duration_blocks')
        .eq('id', id)
        .eq('vendor_id', user.id)
        .single(),
      supabase.from('vendors')
        .select('pioneer, pioneer_bookings_completed')
        .eq('id', user.id)
        .single(),
    ]).then(([svcRes, vendorRes]) => {
      if (svcRes.error) {
        Alert.alert('Error', 'Could not load service. Please try again.');
        router.back();
        return;
      }
      if (svcRes.data) {
        const d = svcRes.data;
        setFormL1(d.category_l1);
        setFormL2(d.category_l2);
        setFormName(d.service_name);
        setFormDesc(d.description ?? '');
        setFormPrice(String(d.price_kobo / 100));
        setFormDuration(d.duration_blocks);
      }
      setVendorPioneer(vendorRes.data ?? null);
      setIsLoading(false);
    });
  }, [user, id]);

  const handleL1Change = (l1: string) => {
    setFormL1(l1);
    setFormL2('');
    setFormDuration(null);
  };

  const handleL2Change = (l2: string) => {
    setFormL2(l2);
    if (l2 !== 'braids' && formDuration !== null && formDuration > 8) {
      setFormDuration(null);
    }
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) return Alert.alert('Required', 'Service name is required.');
    if (name.length > SERVICE_NAME_MAX_CHARS) {
      return Alert.alert('Too long', `Name must be ${SERVICE_NAME_MAX_CHARS} characters or less.`);
    }
    if (!formL2) return Alert.alert('Required', 'Please select a subcategory.');
    if (formDesc.length > SERVICE_DESC_MAX_CHARS) {
      return Alert.alert('Too long', `Description must be ${SERVICE_DESC_MAX_CHARS} characters or less.`);
    }
    const priceNum = Number(formPrice);
    if (!formPrice.trim() || isNaN(priceNum) || priceNum * 100 < MIN_SERVICE_PRICE_KOBO) {
      return Alert.alert('Invalid price', `Minimum price is ₦${(MIN_SERVICE_PRICE_KOBO / 100).toLocaleString('en-NG')}.`);
    }
    if (!formDuration) return Alert.alert('Required', 'Please select a duration.');
    if (!user || !id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from('vendor_services').update({
        category_l1: formL1,
        category_l2: formL2,
        service_name: name,
        description: formDesc.trim() || null,
        price_kobo: Math.round(priceNum * 100),
        duration_blocks: formDuration,
      }).eq('id', id).eq('vendor_id', user.id);
      if (error) throw error;
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <View style={styles.center}><ScissorsLoader size="small" color="dark" /></View>;
  }

  const l2Options = CATEGORY_L2_MAP[formL1] ?? [];
  const durationOptions = formL2 === 'braids' ? BRAIDS_DURATIONS : BASE_DURATIONS;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Edit service</Text>

      {/* L1 category pills */}
      <Text style={styles.fieldLabel}>Category <Text style={styles.required}>*</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        <View style={styles.pillRowInner}>
          {L1_KEYS.map((l1) => (
            <TouchableOpacity
              key={l1}
              style={[styles.pill, formL1 === l1 && styles.pillActive]}
              onPress={() => handleL1Change(l1)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, formL1 === l1 && styles.pillTextActive]}>
                {CATEGORY_L1_LABELS[l1]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* L2 subcategory pills */}
      <Text style={styles.fieldLabel}>Subcategory <Text style={styles.required}>*</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        <View style={styles.pillRowInner}>
          {l2Options.map((l2) => (
            <TouchableOpacity
              key={l2}
              style={[styles.pill, formL2 === l2 && styles.pillActive]}
              onPress={() => handleL2Change(l2)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, formL2 === l2 && styles.pillTextActive]}>
                {CATEGORY_L2_LABELS[l2]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Service name */}
      <Text style={styles.fieldLabel}>Service name <Text style={styles.required}>*</Text></Text>
      <TextInput
        style={styles.textInput}
        value={formName}
        onChangeText={(t) => setFormName(sanitizeContent(t, SERVICE_NAME_MAX_CHARS))}
        placeholder={NAME_PLACEHOLDER[formL1] ?? 'e.g. Service name'}
        placeholderTextColor={Colors.textMuted}
        maxLength={SERVICE_NAME_MAX_CHARS}
        returnKeyType="next"
      />

      {/* Description */}
      <Text style={styles.fieldLabel}>
        Description <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={[styles.textInput, styles.textArea]}
        value={formDesc}
        onChangeText={(t) => setFormDesc(sanitizeContent(t, SERVICE_DESC_MAX_CHARS))}
        placeholder={DESC_PLACEHOLDER[formL1] ?? 'Briefly describe the service...'}
        placeholderTextColor={Colors.textMuted}
        maxLength={SERVICE_DESC_MAX_CHARS}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Price */}
      <Text style={styles.fieldLabel}>Display price <Text style={styles.required}>*</Text></Text>
      <VendorPriceInput
        value={formPrice}
        onChangeText={setFormPrice}
        pioneer={vendorPioneer?.pioneer}
        pioneerBookingsCompleted={vendorPioneer?.pioneer_bookings_completed}
      />
      <Text style={styles.priceHint}>
        Travel cost added automatically for clients over 5km away
      </Text>

      {/* Duration */}
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Duration <Text style={styles.required}>*</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.durationRow}>
          {durationOptions.map((opt) => (
            <TouchableOpacity
              key={opt.blocks}
              style={[styles.durationChip, formDuration === opt.blocks && styles.durationChipActive]}
              onPress={() => setFormDuration(opt.blocks)}
            >
              <Text style={[styles.durationChipText, formDuration === opt.blocks && styles.durationChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.85}
      >
        {isSaving
          ? <ScissorsLoader size="small" color="light" />
          : <Text style={styles.saveBtnText}>Save changes</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} activeOpacity={0.7}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: { marginBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 28, color: Colors.ink, lineHeight: 32 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 24 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  optional: { fontWeight: '400', color: Colors.textMuted },
  required: { color: Colors.error, fontWeight: '700' },

  pillRow: { marginBottom: 16 },
  pillRowInner: { flexDirection: 'row', gap: 8, paddingRight: 24 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pillActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  pillText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  pillTextActive: { color: '#FFF' },

  textInput: {
    height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 5,
    paddingHorizontal: 12, fontSize: 15, color: Colors.text, marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  textArea: { height: 80, paddingTop: 10, lineHeight: 20 },
  priceHint: { fontSize: 12, color: Colors.textMuted, marginTop: 6, marginBottom: 16 },

  durationRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  durationChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border,
  },
  durationChipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  durationChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  durationChipTextActive: { color: '#FFF' },

  saveBtn: {
    height: 56, backgroundColor: Colors.ink, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  cancelBtn: { alignItems: 'center', paddingVertical: 16 },
  cancelBtnText: { fontSize: 15, color: Colors.textMuted, fontWeight: '500' },
});
