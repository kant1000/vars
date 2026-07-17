// ============================================================
// VARS — Vendor Onboarding Step 2: Services (Taxonomy V2)
// Free-name form with L1/L2 taxonomy. Vendors add up to 10
// services (name, subcategory, price, duration) then continue.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VendorPriceInput } from '@/components/VendorPriceInput';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsInput, VarsSurface } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { CloseIcon } from '@/components/icons';
import {
  CATEGORY_L1, CATEGORY_L1_LABELS, CATEGORY_L2_MAP, CATEGORY_L2_LABELS,
  MIN_SERVICE_PRICE_KOBO, MAX_VENDOR_SERVICES, SERVICE_NAME_MAX_CHARS, SERVICE_DESC_MAX_CHARS,
} from '@vars/shared';
import { sanitizeContent } from '@/lib/format';

interface DraftService {
  tempId: string;
  category_l1: string;
  category_l2: string;
  service_name: string;
  description: string;
  price_naira: string;
  duration_blocks: number;
}

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
const BRAIDS_EXTRA   = [10, 12, 14, 16].map(b => ({ blocks: b, label: durationLabel(b) }));
const BRAIDS_DURATIONS = [...BASE_DURATIONS, ...BRAIDS_EXTRA];

export default function Step2Services() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [formL1, setFormL1] = useState<string>(CATEGORY_L1.HAIR);
  const [formL2, setFormL2] = useState<string>(CATEGORY_L2_MAP[CATEGORY_L1.HAIR][0]);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState(2);
  const [draftServices, setDraftServices] = useState<DraftService[]>([]);

  const [vendorPioneer, setVendorPioneer] = useState<{ pioneer: boolean; pioneer_bookings_completed: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) { setIsLoading(false); return; }
    supabase.from('vendors')
      .select('pioneer, pioneer_bookings_completed, lead_service_type')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setVendorPioneer(data ?? null);
        // Pre-select L1 category from lead data if available
        const SERVICE_TYPE_TO_L1: Record<string, string> = {
          barbing:       CATEGORY_L1.BARBER,
          hair_styling:  CATEGORY_L1.HAIR,
          makeovers:     CATEGORY_L1.FACE,
        };
        const preselect = data?.lead_service_type ? SERVICE_TYPE_TO_L1[data.lead_service_type] : null;
        if (preselect) {
          setFormL1(preselect);
          setFormL2(CATEGORY_L2_MAP[preselect][0]);
        }
        setIsLoading(false);
      });
  }, [user]);

  const handleL1Change = (l1: string) => {
    setFormL1(l1);
    setFormL2(CATEGORY_L2_MAP[l1][0]);
    if (formDuration > 8) setFormDuration(2);
  };

  const handleL2Change = (l2: string) => {
    setFormL2(l2);
    if (l2 !== 'braids' && formDuration > 8) setFormDuration(2);
  };

  const handleAddService = () => {
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
    if (draftServices.length >= MAX_VENDOR_SERVICES) {
      return Alert.alert('Limit reached', `Maximum ${MAX_VENDOR_SERVICES} services.`);
    }

    setDraftServices((prev) => [...prev, {
      tempId: String(Date.now()),
      category_l1: formL1,
      category_l2: formL2,
      service_name: name,
      description: formDesc.trim(),
      price_naira: formPrice,
      duration_blocks: formDuration,
    }]);
    setFormName('');
    setFormDesc('');
    setFormPrice('');
  };

  const handleRemove = (tempId: string) => {
    setDraftServices((prev) => prev.filter((s) => s.tempId !== tempId));
  };

  const handleNext = async () => {
    if (draftServices.length === 0) {
      return Alert.alert('Required', 'Add at least one service to continue.');
    }
    if (!user) return;
    setIsSaving(true);
    try {
      const rows = draftServices.map((s, i) => ({
        vendor_id: user.id,
        category_l1: s.category_l1,
        category_l2: s.category_l2,
        service_name: s.service_name,
        description: s.description || null,
        price_kobo: Math.round(Number(s.price_naira) * 100),
        duration_blocks: s.duration_blocks,
        sort_order: i,
      }));
      const { error } = await supabase.from('vendor_services').insert(rows);
      if (error) {
        if (error.message.includes('vendor_service_limit_exceeded')) {
          return Alert.alert('Limit reached', `You can have at most ${MAX_VENDOR_SERVICES} services.`);
        }
        throw error;
      }
      router.push('/vendor-onboarding/step-3-portfolio');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <View style={styles.center}><ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>;
  }

  const l2Options = CATEGORY_L2_MAP[formL1] ?? [];
  const durationOptions = formL2 === 'braids' ? BRAIDS_DURATIONS : BASE_DURATIONS;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>What do you offer?</Text>
      <Text style={styles.sub}>Add the services you provide, with prices and duration.</Text>

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
      <VarsInput
        theme={theme}
        label="Service name"
        value={formName}
        onChangeText={(t) => setFormName(sanitizeContent(t, SERVICE_NAME_MAX_CHARS))}
        placeholder={NAME_PLACEHOLDER[formL1] ?? 'e.g. Service name'}
        maxLength={SERVICE_NAME_MAX_CHARS}
        returnKeyType="next"
        containerStyle={styles.fieldGap}
      />

      {/* Description */}
      <VarsInput
        theme={theme}
        label="Description (optional)"
        value={formDesc}
        onChangeText={(t) => setFormDesc(sanitizeContent(t, SERVICE_DESC_MAX_CHARS))}
        placeholder={DESC_PLACEHOLDER[formL1] ?? 'Briefly describe the service...'}
        maxLength={SERVICE_DESC_MAX_CHARS}
        multiline
        numberOfLines={3}
        style={styles.textArea}
        containerStyle={styles.fieldGap}
      />

      {/* Price */}
      <Text style={styles.fieldLabel}>Price</Text>
      <VendorPriceInput
        value={formPrice}
        onChangeText={setFormPrice}
        pioneer={vendorPioneer?.pioneer}
        pioneerBookingsCompleted={vendorPioneer?.pioneer_bookings_completed}
      />
      <Text style={styles.priceHint}>
        Min ₦{(MIN_SERVICE_PRICE_KOBO / 100).toLocaleString('en-NG')} · Travel cost added automatically for clients over 5km away
      </Text>

      {/* Duration */}
      <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Duration</Text>
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

      {/* Add service */}
      <VarsButton
        theme={theme}
        variant="secondary"
        size="md"
        onPress={handleAddService}
        disabled={draftServices.length >= MAX_VENDOR_SERVICES}
        label="+ Add service"
        style={styles.addBtn}
      />

      {/* Draft list */}
      {draftServices.length > 0 && (
        <View style={styles.draftSection}>
          <Text style={styles.draftHeading}>
            Your services ({draftServices.length}/{MAX_VENDOR_SERVICES})
          </Text>
          {draftServices.map((svc) => (
            <VarsSurface key={svc.tempId} theme={theme} elevation={1} style={styles.draftRow}>
              <View style={styles.draftInfo}>
                <Text style={styles.draftMeta}>
                  {CATEGORY_L2_LABELS[svc.category_l2]} · {CATEGORY_L1_LABELS[svc.category_l1]}
                </Text>
                <Text style={styles.draftName}>{svc.service_name}</Text>
                <Text style={styles.draftDetail}>
                  ₦{Number(svc.price_naira).toLocaleString('en-NG')} · {durationLabel(svc.duration_blocks)}
                </Text>
              </View>
              <TouchableOpacity style={styles.draftRemove} onPress={() => handleRemove(svc.tempId)}>
                <CloseIcon size={12} color={theme.color.inkMuted} />
              </TouchableOpacity>
            </VarsSurface>
          ))}
        </View>
      )}

      {/* Next */}
      <VarsButton
        theme={theme}
        loading={isSaving}
        onPress={handleNext}
        disabled={isSaving || draftServices.length === 0}
        label="Next — Add portfolio photos"
        style={styles.nextBtnSpacing}
      />
    </ScrollView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 60 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
    title: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginBottom: 6 },
    sub: { fontSize: 15, color: theme.color.inkMuted, marginBottom: 24 },

    fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted, marginBottom: 8 },
    fieldGap: { marginBottom: 16 },

    pillRow: { marginBottom: 16 },
    pillRowInner: { flexDirection: 'row', gap: 8, paddingRight: 24 },
    pill: {
      paddingVertical: 8, paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
    },
    pillActive: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    pillText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    pillTextActive: { color: theme.color.inverseInk },

    textArea: { height: 80, paddingTop: 10, lineHeight: 20 },
    priceHint: { fontSize: 12, color: theme.color.inkMuted, marginTop: 6, marginBottom: 16 },

    durationRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    durationChip: {
      paddingVertical: 8, paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS, borderWidth: 1.5, borderColor: theme.color.inkFaint,
    },
    durationChipActive: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    durationChipText: { fontSize: 13, color: theme.color.inkMuted, fontWeight: '500' },
    durationChipTextActive: { color: theme.color.inverseInk },

    addBtn: { marginBottom: 24 },

    draftSection: { marginBottom: 8 },
    draftHeading: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
    },
    draftRow: {
      flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8,
    },
    draftInfo: { flex: 1 },
    draftMeta: {
      fontSize: 11, color: theme.color.inkMuted, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2,
    },
    draftName: { fontSize: 15, fontWeight: '600', color: theme.color.ink, marginBottom: 2 },
    draftDetail: { fontSize: 13, color: theme.color.inkMuted },
    draftRemove: { padding: 8 },

    nextBtnSpacing: { marginTop: 16 },
  });
}
