// ============================================================
// VARS — Vendor Onboarding Step 2: Service Selection (§6.1)
// Select categories, specific services, set price + duration (30-min blocks)
// Also offered: non-bookable services shown on profile
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

interface Service {
  id: string;
  name: string;
  category_id: string;
  is_bookable_v1: boolean;
}

interface SelectedService {
  service_id: string;
  price_naira: string;   // user types in naira, we convert to kobo on save
  duration_blocks: number;
  is_bookable: boolean;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8].map((b) => ({
  blocks: b,
  label: b === 1 ? '30 min' : b < 4 ? `${b * 30} min` : `${b / 2} hr${b > 2 ? 's' : ''}`,
}));

export default function Step2Services() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Record<string, SelectedService>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    const [{ data: cats }, { data: svcs }] = await Promise.all([
      supabase.from('service_categories').select('id, name, slug').order('sort_order'),
      supabase.from('services').select('id, name, category_id, is_bookable_v1').order('sort_order'),
    ]);
    setCategories(cats ?? []);
    setServices(svcs ?? []);
    if (cats?.length) setExpandedCategory(cats[0].id);
    setIsLoading(false);
  };

  const toggleService = (svc: Service) => {
    setSelected((prev) => {
      if (prev[svc.id]) {
        const next = { ...prev };
        delete next[svc.id];
        return next;
      }
      return {
        ...prev,
        [svc.id]: {
          service_id: svc.id,
          price_naira: '',
          duration_blocks: 1,
          is_bookable: svc.is_bookable_v1,
        },
      };
    });
  };

  const updateSelected = (id: string, patch: Partial<SelectedService>) => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleNext = async () => {
    const bookable = Object.values(selected).filter((s) => s.is_bookable);
    if (bookable.length === 0) {
      return Alert.alert('Required', 'Please select at least one bookable service.');
    }
    const missingPrice = bookable.find(
      (s) => !s.price_naira.trim() || isNaN(Number(s.price_naira))
    );
    if (missingPrice) {
      return Alert.alert('Required', 'Please set a price for all your bookable services.');
    }

    if (!user) return;
    setIsSaving(true);
    try {
      const rows = Object.values(selected).map((s) => ({
        vendor_id: user.id,
        service_id: s.service_id,
        price_kobo: Math.round(Number(s.price_naira) * 100),
        duration_blocks: s.duration_blocks,
        is_bookable: s.is_bookable,
      }));

      // Upsert vendor services
      const { error } = await supabase
        .from('vendor_services')
        .upsert(rows, { onConflict: 'vendor_id,service_id' });

      if (error) throw error;
      router.push('/vendor-onboarding/step-3-portfolio');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>What do you offer?</Text>
      <Text style={styles.sub}>Select your services and set your prices.</Text>

      {categories.map((cat) => {
        const catServices = services.filter((s) => s.category_id === cat.id);
        const bookable = catServices.filter((s) => s.is_bookable_v1);
        const alsoOffered = catServices.filter((s) => !s.is_bookable_v1);
        const isExpanded = expandedCategory === cat.id;

        return (
          <View key={cat.id} style={styles.category}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => setExpandedCategory(isExpanded ? null : cat.id)}
            >
              <Text style={styles.categoryName}>{cat.name}</Text>
              <Text style={styles.categoryChevron}>{isExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.serviceList}>
                {/* Bookable services */}
                {bookable.map((svc) => {
                  const sel = selected[svc.id];
                  return (
                    <View key={svc.id}>
                      <TouchableOpacity
                        style={[styles.serviceRow, sel && styles.serviceRowSelected]}
                        onPress={() => toggleService(svc)}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.checkbox, sel && styles.checkboxChecked]}>
                          {sel && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.serviceName}>{svc.name}</Text>
                      </TouchableOpacity>

                      {/* Price + duration fields when selected */}
                      {sel && (
                        <View style={styles.serviceConfig}>
                          <View style={styles.priceRow}>
                            <Text style={styles.nairaSign}>₦</Text>
                            <TextInput
                              style={styles.priceInput}
                              placeholder="Price"
                              placeholderTextColor={Colors.textMuted}
                              value={sel.price_naira}
                              onChangeText={(v) => updateSelected(svc.id, { price_naira: v })}
                              keyboardType="numeric"
                            />
                          </View>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.durationRow}>
                              {DURATION_OPTIONS.map((opt) => (
                                <TouchableOpacity
                                  key={opt.blocks}
                                  style={[
                                    styles.durationChip,
                                    sel.duration_blocks === opt.blocks && styles.durationChipActive,
                                  ]}
                                  onPress={() => updateSelected(svc.id, { duration_blocks: opt.blocks })}
                                >
                                  <Text
                                    style={[
                                      styles.durationChipText,
                                      sel.duration_blocks === opt.blocks && styles.durationChipTextActive,
                                    ]}
                                  >
                                    {opt.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Also offered section */}
                {alsoOffered.length > 0 && (
                  <>
                    <Text style={styles.alsoOfferedLabel}>Also offered (informational only)</Text>
                    {alsoOffered.map((svc) => {
                      const sel = selected[svc.id];
                      return (
                        <TouchableOpacity
                          key={svc.id}
                          style={[styles.serviceRow, sel && styles.serviceRowSelected]}
                          onPress={() => toggleService(svc)}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.checkbox, sel && styles.checkboxChecked]}>
                            {sel && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                          <Text style={styles.serviceName}>{svc.name}</Text>
                          <Text style={styles.infoOnly}>info only</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.button, isSaving && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={isSaving}
        activeOpacity={0.85}
      >
        {isSaving
          ? <ActivityIndicator color="#FFF" />
          : <Text style={styles.buttonText}>Next — Add portfolio photos</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 24 },
  category: { marginBottom: 12, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 14, overflow: 'hidden' },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.surface },
  categoryName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  categoryChevron: { fontSize: 12, color: Colors.textSecondary },
  serviceList: { padding: 12, gap: 4 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 12 },
  serviceRowSelected: { backgroundColor: Colors.primaryLight },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkmark: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  serviceName: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
  infoOnly: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  serviceConfig: { marginLeft: 46, marginBottom: 8, gap: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nairaSign: { fontSize: 18, fontWeight: '600', color: Colors.text },
  priceInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: Colors.text },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border },
  durationChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  durationChipTextActive: { color: '#FFF' },
  alsoOfferedLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  button: { height: 56, backgroundColor: Colors.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
