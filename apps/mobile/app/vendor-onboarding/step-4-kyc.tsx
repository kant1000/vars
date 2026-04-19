// ============================================================
// VARS — Vendor Onboarding Step 4: KYC + Bank Account (§6.1)
// KYC handled entirely by Youverify SDK — VARS never stores raw ID data.
// Bank account verified via Paystack (uses paystack-verify-bank edge fn).
// ============================================================
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { WebView } from 'react-native-webview';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

type KycState = 'idle' | 'loading' | 'webview' | 'done';

interface BankInfo {
  accountNumber: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  recipientCode: string;
}

export default function Step4Kyc() {
  const { user, session } = useAuth();

  // KYC state
  const [kycState, setKycState] = useState<KycState>('idle');
  const [kycUrl, setKycUrl] = useState('');
  const [kycVerified, setKycVerified] = useState(false);

  // Bank account state
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [bankVerified, setBankVerified] = useState(false);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const callEdgeFn = async (fn: string, body: object) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  };

  // ---- KYC via Youverify ----
  const handleStartKyc = async () => {
    if (!user) return;
    setKycState('loading');
    try {
      const data = await callEdgeFn('vendor-kyc-init', { vendor_id: user.id });
      setKycUrl(data.verification_url);
      setKycState('webview');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setKycState('idle');
    }
  };

  // Youverify WebView posts a message when verification is complete
  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'kyc_complete' || msg.status === 'success') {
        setKycState('done');
        setKycVerified(true);
      } else if (msg.type === 'kyc_failed') {
        Alert.alert('Verification failed', 'Please try again or contact VARS support.');
        setKycState('idle');
      }
    } catch {
      // Non-JSON messages from WebView — ignore
    }
  };

  // ---- Bank account ----
  const handleLoadBanks = async () => {
    if (banks.length) { setShowBankPicker(true); return; }
    try {
      const data = await callEdgeFn('paystack-verify-bank', { action: 'list_banks' });
      setBanks(data.banks);
      setShowBankPicker(true);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleVerifyAccount = async () => {
    if (!accountNumber.trim() || !bankCode) {
      return Alert.alert('Required', 'Please enter your account number and select a bank.');
    }
    if (accountNumber.length < 10) {
      return Alert.alert('Invalid', 'Please enter a valid 10-digit account number.');
    }

    setIsVerifyingBank(true);
    try {
      const data = await callEdgeFn('paystack-verify-bank', {
        action: 'verify',
        account_number: accountNumber.trim(),
        bank_code: bankCode,
      });
      setAccountName(data.account_name);
      setBankVerified(true);
    } catch (err: any) {
      Alert.alert('Verification failed', err.message ?? 'Could not verify account. Check the details and try again.');
    } finally {
      setIsVerifyingBank(false);
    }
  };

  const handleSaveBankAndContinue = async () => {
    if (!bankVerified) return Alert.alert('Required', 'Please verify your bank account first.');
    if (!kycVerified) return Alert.alert('Required', 'Please complete identity verification first.');
    if (!user) return;

    setIsSaving(true);
    try {
      await callEdgeFn('paystack-verify-bank', {
        action: 'save',
        account_number: accountNumber,
        bank_code: bankCode,
        bank_name: bankName,
        account_name: accountName,
      });
      router.replace('/vendor-onboarding/step-5-pending');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Show Youverify WebView when KYC is in progress
  if (kycState === 'webview') {
    return (
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: kycUrl }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          style={{ flex: 1 }}
        />
        <TouchableOpacity
          style={styles.cancelKyc}
          onPress={() => setKycState('idle')}
        >
          <Text style={styles.cancelKycText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify your identity.</Text>
        <Text style={styles.sub}>
          Required to go live on VARS. Your data stays with Youverify — we never see it.
        </Text>

        {/* ---- KYC Section ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identity verification</Text>
          <Text style={styles.sectionSub}>NIN, BVN, or government ID — takes about 2 minutes.</Text>

          {kycVerified ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓ Identity verified</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.kycButton, kycState === 'loading' && styles.buttonDisabled]}
              onPress={handleStartKyc}
              disabled={kycState === 'loading'}
              activeOpacity={0.85}
            >
              {kycState === 'loading'
                ? <ScissorsLoader size="small" color="light" />
                : <Text style={styles.kycButtonText}>Start identity check</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* ---- Bank Account Section ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bank account</Text>
          <Text style={styles.sectionSub}>Where your earnings will be sent after every job.</Text>

          {/* Bank selector */}
          <TouchableOpacity style={styles.input} onPress={handleLoadBanks}>
            <Text style={bankName ? styles.inputText : styles.inputPlaceholder}>
              {bankName || 'Select bank'}
            </Text>
          </TouchableOpacity>

          {/* Bank picker modal */}
          {showBankPicker && (
            <View style={styles.bankPicker}>
              <ScrollView style={{ maxHeight: 200 }}>
                {banks.map((b) => (
                  <TouchableOpacity
                    key={b.code}
                    style={styles.bankOption}
                    onPress={() => {
                      setBankCode(b.code);
                      setBankName(b.name);
                      setShowBankPicker(false);
                      setBankVerified(false);
                      setAccountName('');
                    }}
                  >
                    <Text style={styles.bankOptionText}>{b.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <TextInput
            style={styles.textInput}
            placeholder="Account number"
            placeholderTextColor={Colors.textMuted}
            value={accountNumber}
            onChangeText={(t) => { setAccountNumber(t); setBankVerified(false); setAccountName(''); }}
            keyboardType="numeric"
            maxLength={10}
          />

          {accountName ? (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓ {accountName}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, isVerifyingBank && styles.buttonDisabled]}
              onPress={handleVerifyAccount}
              disabled={isVerifyingBank}
              activeOpacity={0.85}
            >
              {isVerifyingBank
                ? <ScissorsLoader size="small" color="dark" />
                : <Text style={styles.verifyButtonText}>Verify account</Text>}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (!kycVerified || !bankVerified || isSaving) && styles.buttonDisabled,
          ]}
          onPress={handleSaveBankAndContinue}
          disabled={!kycVerified || !bankVerified || isSaving}
          activeOpacity={0.85}
        >
          {isSaving
            ? <ScissorsLoader size="small" color="light" />
            : <Text style={styles.buttonText}>Submit for review</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.textSecondary, marginBottom: 28 },
  section: { marginBottom: 28, padding: 20, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 16, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  sectionSub: { fontSize: 14, color: Colors.textSecondary },
  kycButton: { height: 50, backgroundColor: Colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kycButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12 },
  verifiedText: { color: Colors.success, fontSize: 15, fontWeight: '600' },
  input: { height: 50, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
  inputText: { fontSize: 16, color: Colors.text },
  inputPlaceholder: { fontSize: 16, color: Colors.textMuted },
  textInput: { height: 50, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: Colors.text },
  bankPicker: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.background },
  bankOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bankOptionText: { fontSize: 15, color: Colors.text },
  verifyButton: { height: 46, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  verifyButtonText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
  button: { height: 56, backgroundColor: Colors.primary, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cancelKyc: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  cancelKycText: { color: '#FFF', fontWeight: '600' },
});
