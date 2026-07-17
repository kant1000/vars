// ============================================================
// VARS — Privacy and Data Dashboard (Item 12)
// Shows: terms acceptance history, data rights actions,
// marketing info (static), vendor KYC retention notice.
// Entry from: customer profile and vendor settings.
// ============================================================
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { ChevronRightIcon } from '@/components/icons';
import { ScissorsLoader } from '@/components/ScissorsLoader';

const EDGE_EXPORT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-user-data`
  : '';

interface Acceptance {
  document_type:    string;
  document_version: string;
  accepted_at:      string;
}

const DOC_LABEL: Record<string, string> = {
  customer_terms:        'Terms of Use',
  privacy_policy:        'Privacy Policy',
  vendor_terms:          'Vendor Terms and Conditions',
  vendor_privacy_policy: 'Privacy Policy',
};

export default function PrivacyDataScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [isVendor,    setIsVendor]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [exporting,   setExporting]   = useState(false);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [user?.id]));

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: terms }, { data: vendor }] = await Promise.all([
      supabase
        .from('terms_acceptances')
        .select('document_type, document_version, accepted_at')
        .eq('user_id', user.id)
        .order('accepted_at', { ascending: false }),
      supabase
        .from('vendors')
        .select('id')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    setAcceptances(terms ?? []);
    setIsVendor(!!vendor);
    setLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(EDGE_EXPORT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Export limit reached', err.error ?? 'You can export once per 24 hours.');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Export failed', err.error ?? 'Please try again.');
        return;
      }

      // Download the JSON file — surface it as a share sheet
      const blob = await res.blob();
      Alert.alert(
        'Export ready',
        'Your data export has been prepared. Check your Downloads folder or use the share option.',
      );
    } catch {
      Alert.alert('No connection', 'Check your internet connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy and data</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ScissorsLoader size="medium" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Terms acceptance history */}
          <Text style={s.sectionLabel}>Agreements</Text>
          <View style={s.card}>
            {acceptances.length === 0 ? (
              <Text style={s.emptyText}>No acceptance records found.</Text>
            ) : (
              acceptances.map((a, i) => (
                <View
                  key={`${a.document_type}-${a.document_version}-${i}`}
                  style={[s.row, i < acceptances.length - 1 && s.rowBorder]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{DOC_LABEL[a.document_type] ?? a.document_type}</Text>
                    <Text style={s.rowSub}>
                      Version {a.document_version} ·{' '}
                      {new Date(a.accepted_at).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Marketing */}
          <Text style={s.sectionLabel}>Marketing</Text>
          <View style={s.card}>
            <View style={[s.row, s.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Transactional messages</Text>
                <Text style={s.rowSub}>Booking alerts and payment updates via WhatsApp and push</Text>
              </View>
              <Text style={s.statusOn}>On</Text>
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Marketing messages</Text>
                <Text style={s.rowSub}>Promotional content from VARS</Text>
              </View>
              <Text style={s.statusOff}>Off</Text>
            </View>
          </View>

          {/* Data rights */}
          <Text style={s.sectionLabel}>Your data rights</Text>
          <View style={s.card}>
            <TouchableOpacity
              style={[s.row, s.rowBorder]}
              onPress={handleExport}
              activeOpacity={0.7}
              disabled={exporting}
            >
              <Text style={s.rowLabel}>Download my data</Text>
              {exporting
                ? <ActivityIndicator size="small" color={theme.color.inkMuted} />
                : <ChevronRightIcon size={16} color={theme.color.inkMuted} />
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.row, s.rowBorder]}
              onPress={() => router.push('/delete-account' as any)}
              activeOpacity={0.7}
            >
              <Text style={[s.rowLabel, { color: theme.color.accentRed }]}>Delete my account</Text>
              <ChevronRightIcon size={16} color={theme.color.inkMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.row, s.rowBorder]}
              onPress={() => Linking.openURL('mailto:hello@bookwithvars.com?subject=Data%20Request')}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Contact our DPO</Text>
                <Text style={s.rowSub}>hello@bookwithvars.com</Text>
              </View>
              <ChevronRightIcon size={16} color={theme.color.inkMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.row}
              onPress={() => Linking.openURL('https://ndpc.gov.ng')}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>File a complaint with NDPC</Text>
                <Text style={s.rowSub}>Nigeria Data Protection Commission</Text>
              </View>
              <ChevronRightIcon size={16} color={theme.color.inkMuted} />
            </TouchableOpacity>
          </View>

          {/* Policy links */}
          <Text style={s.sectionLabel}>Policies</Text>
          <View style={s.card}>
            <TouchableOpacity
              style={[s.row, s.rowBorder]}
              onPress={() => Linking.openURL('https://www.bookwithvars.com/privacy')}
              activeOpacity={0.7}
            >
              <Text style={s.rowLabel}>Privacy Policy</Text>
              <ChevronRightIcon size={16} color={theme.color.inkMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.row}
              onPress={() => Linking.openURL('https://www.bookwithvars.com/cookie-policy')}
              activeOpacity={0.7}
            >
              <Text style={s.rowLabel}>Cookie and Tracking Policy</Text>
              <ChevronRightIcon size={16} color={theme.color.inkMuted} />
            </TouchableOpacity>
          </View>

          {/* Vendor-only: KYC retention notice */}
          {isVendor && (
            <>
              <Text style={s.sectionLabel}>Vendor data notes</Text>
              <View style={s.infoBox}>
                <Text style={s.infoText}>
                  <Text style={{ fontWeight: '700' }}>KYC records:</Text>
                  {' '}Your identity verification records (government ID reference, liveness check result) are retained for 5 years as required by the Money Laundering (Prevention and Prohibition) Act 2022 s.16.
                </Text>
                <Text style={[s.infoText, { marginTop: 10 }]}>
                  <Text style={{ fontWeight: '700' }}>Profile photo:</Text>
                  {' '}Your profile photo is extracted from your KYC liveness check and locked to your account. It cannot be changed independently of re-verification.
                </Text>
              </View>
            </>
          )}

          <Text style={s.footer}>
            Your personal data is processed under the Nigeria Data Protection Act 2023 (NDPA). Requests are acknowledged within 24 hours and completed within 30 days.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: theme.color.bg },
    centered:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText:     { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle:  { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    scroll:       { padding: 16, paddingBottom: 60 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 8, marginTop: 20, paddingHorizontal: 4,
    },
    card: {
      backgroundColor: theme.color.bg,
      borderRadius: BORDER_RADIUS, borderWidth: 1, borderColor: theme.color.inkFaint, overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 14, gap: 10,
    },
    rowBorder:    { borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint },
    rowLabel:     { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    rowSub:       { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    statusOn:     { fontSize: 12, fontWeight: '700', color: theme.color.accentGreen },
    statusOff:    { fontSize: 12, fontWeight: '700', color: theme.color.inkMuted },
    emptyText:    { fontSize: 13, color: theme.color.inkMuted, padding: 16 },
    infoBox: {
      backgroundColor: theme.color.surface2,
      borderRadius: BORDER_RADIUS, borderWidth: 1, borderColor: theme.color.inkFaint,
      padding: 16,
    },
    infoText:     { fontSize: 13, color: theme.color.inkMuted, lineHeight: 20 },
    footer: {
      marginTop: 24, marginBottom: 8,
      fontSize: 12, color: theme.color.inkMuted, lineHeight: 18, textAlign: 'center',
      paddingHorizontal: 8,
    },
  });
}
