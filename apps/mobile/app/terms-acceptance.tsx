// ============================================================
// VARS — Terms Acceptance
// Shown to new users (and existing users when document versions bump).
// Calls accept-terms edge function then routes to destination.
// Offline: shows error — acceptance must be recorded to proceed.
// ============================================================
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import {
  DOCUMENT_VERSIONS,
  CUSTOMER_REQUIRED_DOCS,
  VENDOR_REQUIRED_DOCS,
  type DocumentType,
} from '@/constants/terms';

const EDGE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/accept-terms`
  : '';

export default function TermsAcceptanceScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const { userType, destination } = useLocalSearchParams<{
    userType: 'customer' | 'vendor';
    destination: string;
  }>();

  const isVendor = userType === 'vendor';
  const requiredDocs: DocumentType[] = isVendor
    ? VENDOR_REQUIRED_DOCS
    : CUSTOMER_REQUIRED_DOCS;

  const [loading, setLoading] = useState(false);

  const handleAgree = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Session expired', 'Please sign in again.');
        router.replace('/auth/login' as any);
        return;
      }

      const acceptances = requiredDocs.map((doc) => ({
        document_type:    doc,
        document_version: DOCUMENT_VERSIONS[doc],
      }));

      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ acceptances }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      // Route to destination
      router.replace((destination ?? (isVendor ? '/(vendor-tabs)/profile' : '/(tabs)')) as any);
    } catch (err: any) {
      const isNetwork = err.message?.includes('Network') || err.message?.includes('fetch');
      Alert.alert(
        isNetwork ? 'No connection' : 'Something went wrong',
        isNetwork
          ? 'Connect to the internet and try again. Your acceptance must be recorded before you can continue.'
          : err.message ?? 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.wordmark}>VARS</Text>
        <Text style={s.headerSub}>Before you continue</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>
          {isVendor
            ? 'To complete your account setup and go live, please review and accept the documents below.'
            : 'To continue using VARS, please review and accept the documents below.'}
        </Text>

        <View style={s.docList}>
          {isVendor ? (
            <>
              <DocItem
                title="Vendor Terms and Conditions"
                version={DOCUMENT_VERSIONS.vendor_terms}
                onPress={() => router.push('/vendor-terms' as any)}
                styles={s}
              />
              <DocItem
                title="Privacy Policy"
                version={DOCUMENT_VERSIONS.vendor_privacy_policy}
                onPress={() => router.push('/vendor-privacy' as any)}
                styles={s}
              />
            </>
          ) : (
            <>
              <DocItem
                title="Terms of Use"
                version={DOCUMENT_VERSIONS.customer_terms}
                onPress={() => Linking.openURL('https://www.bookwithvars.com/terms')}
                styles={s}
              />
              <DocItem
                title="Privacy Policy"
                version={DOCUMENT_VERSIONS.privacy_policy}
                onPress={() => Linking.openURL('https://www.bookwithvars.com/privacy')}
                styles={s}
              />
            </>
          )}
        </View>

        <Text style={s.consent}>
          By tapping {'"'}Agree and continue{'"'}, you confirm that you have read and agree to the
          documents listed above. Your acceptance is recorded with a timestamp
          {isVendor ? ' as required by Nigerian data protection law (NDPA 2023).' : '.'}
        </Text>

        <Text style={s.contact}>
          Questions? Email{' '}
          <Text
            style={s.link}
            onPress={() => Linking.openURL('mailto:hello@bookwithvars.com')}
          >
            hello@bookwithvars.com
          </Text>
        </Text>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[s.agreeBtn, loading && s.agreeBtnDisabled]}
          onPress={handleAgree}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={theme.color.inverseInk} />
          ) : (
            <Text style={s.agreeBtnText}>Agree and continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DocItem({
  title,
  version,
  onPress,
  styles,
}: {
  title: string;
  version: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity style={styles.docRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={styles.docVersion}>Version {version}</Text>
      </View>
      <Text style={styles.docArrow}>›</Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.inkFaint,
    },
    wordmark: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.color.accentBlue,
      letterSpacing: -0.5,
      marginBottom: 4,
    },
    headerSub: { fontSize: 20, fontWeight: '700', color: theme.color.ink },
    scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
    intro: {
      fontSize: 15,
      color: theme.color.inkMuted,
      lineHeight: 22,
      marginBottom: 28,
    },
    docList: { marginBottom: 28 },
    docRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS,
      marginBottom: 10,
      backgroundColor: theme.color.surface2,
    },
    docTitle: { fontSize: 15, fontWeight: '600', color: theme.color.ink, marginBottom: 2 },
    docVersion: { fontSize: 12, color: theme.color.inkMuted },
    docArrow: { fontSize: 20, color: theme.color.inkMuted, marginLeft: 8 },
    consent: {
      fontSize: 13,
      color: theme.color.inkMuted,
      lineHeight: 20,
      marginBottom: 16,
    },
    contact: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 20 },
    link: { color: theme.color.ink, textDecorationLine: 'underline' },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
    },
    agreeBtn: {
      height: 56,
      backgroundColor: theme.color.accentBlue,
      borderRadius: BORDER_RADIUS,
      alignItems: 'center',
      justifyContent: 'center',
    },
    agreeBtnDisabled: { opacity: 0.5 },
    agreeBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },
  });
}
