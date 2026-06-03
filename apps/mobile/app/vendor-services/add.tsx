// ============================================================
// VARS — Add Service (post-onboarding)
// Reached from the vendor profile "My Services" section.
// Single-service form; on save goes back to profile.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VendorPriceInput } from '@/components/VendorPriceInput';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';
import {
  CATEGORY_L1, CATEGORY_L1_LABELS, CATEGORY_L2_MAP, CATEGORY_L2_LABELS,
  MIN_SERVICE_PRICE_KOBO, MAX_VENDOR_SERVICES, SERVICE_NAME_MAX_CHARS, SERVICE_DESC_MAX_CHARS,
} from '@vars/shared';

const L1_KEYS = Object.values(CATEGORY_L1) as string[];

const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8].map((b) => ({
  blocks: b,
  label: b === 1 ? '30 min' : b < 4 ? `${b * 30} min` : `${b / 2} hr${b > 2 ? 's' : ''}`,
}));

export default function AddServiceScreen() {
  const { user } = useAuth();

  const [formL1, setFormL1] = useState<string>(CATEGORY_L1.HAIR);
  const [formL2, setFormL2] = useState<string>(CATEGORY_L2_MAP[CATEGORY_L1.HAIR][0]);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState(2);

  const [vendorPioneer, setVendorPioneer] = useState<{ pioneer: boolean; pioneer_bookings_completed: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    supabase.from('vendors')
      .select('pioneer, pioneer_bookings_completed')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { setVendorPioneer(data ?? null); setIsLoading(false); });
  }, [user]);

  const handleL1Change = (l1: string) => {
    setFormL1(l1);
    setFormL2(CATEGORY_L2_MAP[l1][0]);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) return Alert.alert('Required', 'Service name is required.');
    if (name.length > SERVICE_NAME_MAX_CHARS) {
      return Alert.alert('Too long', `Name must be ${SERVICE_NAME_MAX_CHARS} characters or less.`);
    }
    if (formDesc.length > SERVICE_DESC_MAX_CHARS) {
      return Alert.alert('Too long', `Description must be ${SERVICE_DESC_MAX_CHARS} characters or less.`);
    }
    const priceNum = Number(formPrice);
    if (!formPrice.trim() || isNaN(priceNum) || priceNum * 100 < MIN_SERVICE_PRICE_KOBO) {
      return Alert.alert('Invalid price', `Minimum price is ₦${(MIN_SERVICE_PRICE_KOBO / 100).toLocaleString('en-NG')}.`);
    }
    if (!user) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from('vendor_services').insert({
        vendor_id: user.id,
        category_l1: formL1,
        category_l2: formL2,
        service_name: name,
        description: formDesc.trim() || null,
        price_kobo: Math.round(priceNum * 100),
        duration_blocks: formDuration,
      });
      if (error) {
        if (error.message.includes('vendor_service_limit_exceeded')) {
          return Alert.alert('Limit reached', `You can have at most ${MAX_VENDOR_SERVICES} services. Remove one first.`);
        }
        throw error;
      }
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Add a service</Text>

      {/* L1 category pills */}
      <Text style={styles.fieldLabel}>Category</Text>
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
      <Text style={styles.fieldLabel}>Subcategory</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
        <View style={styles.pillRowInner}>
          {l2Options.map((l2) => (
            <TouchableOpacity
              key={l2}
              style={[styles.pill, formL2 === l2 && styles.pillActive]}
              onPress={() => setFormL2(l2)}
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
      <Text style={styles.fieldLabel}>Service name</Text>
      <TextInput
        style={styles.textInput}
        value={formName}
        onChangeText={setFormName}
        placeholder="e.g. Knotless Braids"
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
        onChangeText={setFormDesc}
        placeholder="Briefly describe the service..."
        placeholderTextColor={Colors.textMuted}
        maxLength={SERVICE_DESC_MAX_CHARS}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Price */}
      <Text style={styles.fieldLabel}>Price</Text>
      <VendorPriceInput
        value={formPrice}
        onChangeText={setFormPrice}
        pioneer={vendorPioneer?.pioneer}
        pioneerBookingsCompleted={vendorPioneer?.pioneer_bookings_completed}
      />

      {/* Duration */}
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Duration</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map((opt) => (
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
          : <Text style={styles.saveBtnText}>Save service</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: { marginBottom: 12 },
  back: { fontSize: 16, color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 24 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 8 },
  optional: { fontWeight: '400', color: Colors.textMuted },

  pillRow: { marginBottom: 16 },
  pillRowInner: { flexDirection: 'row', gap: 8, paddingRight: 24 },
  pill: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  pillTextActive: { color: '#FFF' },

  textInput: {
    height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, fontSize: 15, color: Colors.text, marginBottom: 16,
    backgroundColor: Colors.surface,
  },
  textArea: { height: 80, paddingTop: 10, lineHeight: 20 },

  durationRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  durationChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
  },
  durationChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  durationChipTextActive: { color: '#FFF' },

  saveBtn: {
    height: 56, backgroundColor: Colors.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
