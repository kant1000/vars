// ============================================================
// VARS — Terms Acceptance
// Shown to new users (and existing users when document versions bump).
// Calls accept-terms edge function then routes to destination.
// Offline: shows error — acceptance must be recorded to proceed.
// ============================================================
import React, { useState } from 'react';
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
import { Colors, BORDER_RADIUS } from '@/constants/colors';
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
              />
              <DocItem
                title="Privacy Policy"
                version={DOCUMENT_VERSIONS.vendor_privacy_policy}
                onPress={() => router.push('/vendor-privacy' as any)}
              />
            </>
          ) : (
            <>
              <DocItem
                title="Terms of Use"
                version={DOCUMENT_VERSIONS.customer_terms}
                onPress={() => Linking.openURL('https://www.bookwithvars.com/terms')}
              />
              <DocItem
                title="Privacy Policy"
                version={DOCUMENT_VERSIONS.privacy_policy}
                onPress={() => Linking.openURL('https://www.bookwithvars.com/privacy')}
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
            <ActivityIndicator color="#FFFFFF" />
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
}: {
  title: string;
  version: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.docRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={s.docTitle}>{title}</Text>
        <Text style={s.docVersion}>Version {version}</Text>
      </View>
      <Text style={s.docArrow}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  wordmark: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSub: { fontSize: 20, fontWeight: '700', color: Colors.text },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  intro: {
    fontSize: 15,
    color: Colors.textSecondary,
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
    borderColor: Colors.border,
    borderRadius: BORDER_RADIUS,
    marginBottom: 10,
    backgroundColor: Colors.surface,
  },
  docTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  docVersion: { fontSize: 12, color: Colors.textMuted },
  docArrow: { fontSize: 20, color: Colors.textMuted, marginLeft: 8 },
  consent: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  contact: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  link: { color: Colors.ink, textDecorationLine: 'underline' },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  agreeBtn: {
    height: 56,
    backgroundColor: Colors.primary,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBtnDisabled: { opacity: 0.5 },
  agreeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
