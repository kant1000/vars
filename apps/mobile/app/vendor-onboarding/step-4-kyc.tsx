// ============================================================
// VARS — Vendor Onboarding Step 4: Bank Account + KYC (§6.1)
// Sub-step A (bank first): quick win via Paystack account verify.
// Sub-step B (KYC second): NIN + selfie liveness via Youverify's SDK,
// embedded in a WebView-hosted widget page (vendor-kyc-liveness-widget) —
// Youverify has no simple hosted-link API, their product is a client-side
// SDK widget. Liveness capture happens in the widget; the actual NIN
// match+verification call happens server-side (vendor-kyc-verify).
// VARS never stores the raw NIN or ID data — Youverify handles it.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsButton, VarsInput, VarsSurface, VarsCheckbox } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
// 'failed' covers in-session WebView failures and returning after a webhook rejection.
// 'review' covers needs_review — KYC passed but data capture failed; admin resolves.
type KycState = 'idle' | 'loading' | 'prep' | 'webview' | 'failed' | 'review' | 'done';

// Which sub-step the vendor is on: A = bank, B = KYC
type SubStep = 'bank' | 'kyc';

export default function Step4Kyc() {
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Sub-step navigation
  const [subStep, setSubStep] = useState<SubStep>('bank');

  // KYC state
  const [kycState, setKycState] = useState<KycState>('idle');
  const [kycUrl, setKycUrl] = useState('');
  const [kycVerified, setKycVerified] = useState(false);
  const [kycErrorReason, setKycErrorReason] = useState<string | null>(null);
  const [nin, setNin] = useState('');
  const [ninConsent, setNinConsent] = useState(false);

  // Bank account state
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [bankVerified, setBankVerified] = useState(false);
  const [bankAlreadySaved, setBankAlreadySaved] = useState(false);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // On mount: if previously rejected, pre-load existing bank details
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('vendors')
        .select('kyc_status, kyc_submitted_at, kyc_rejection_reason, bank_account_number, bank_name, bank_account_name, paystack_subaccount_code')
        .eq('id', user.id)
        .single();
      if (!data) return;

      if (data.kyc_status === 'rejected') {
        setKycState('failed');
        setKycErrorReason(data.kyc_rejection_reason ?? null);
        // Skip to KYC sub-step on retry if bank was already saved
        if (data.paystack_subaccount_code) setSubStep('kyc');
      } else if (data.kyc_status === 'needs_review') {
        setKycState('review');
        setSubStep('kyc');
      } else if (!data.kyc_submitted_at && data.paystack_subaccount_code) {
        // Bank done, KYC never actually submitted (e.g. app closed during WebView,
        // or never started) — skip to KYC sub-step. kyc_status alone can't signal
        // this: it defaults to 'pending' at row creation, so it's never falsy.
        setSubStep('kyc');
        setKycState('idle');
      }

      if (data.bank_account_number && data.bank_name && data.bank_account_name) {
        setAccountNumber(data.bank_account_number);
        setBankName(data.bank_name);
        setAccountName(data.bank_account_name);
        if (data.paystack_subaccount_code) {
          setBankVerified(true);
          setBankAlreadySaved(true);
        }
      }
    })();
  }, [user]);

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

  // ---- Bank account ----
  const handleLoadBanks = async () => {
    if (banks.length) { setShowBankPicker(true); return; }
    try {
      const data = await callEdgeFn('paystack-verify-bank', { action: 'list_banks' });
      const seen = new Set<string>();
      const deduped = (data.banks as { name: string; code: string }[]).filter((b) => {
        if (seen.has(b.code)) return false;
        seen.add(b.code);
        return true;
      });
      setBanks(deduped);
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

  // Bank verified — save it now (creates the Paystack subaccount) and advance
  // to the KYC sub-step. Saving here rather than deferring to the final combined
  // submit means a verified bank survives the app being closed mid-KYC — it used
  // to only persist to the DB alongside KYC completion, so an interruption before
  // finishing Youverify silently lost the bank progress entirely.
  const handleBankContinue = async () => {
    if (!bankVerified) return Alert.alert('Required', 'Please verify your bank account first.');
    if (bankAlreadySaved) {
      setSubStep('kyc');
      setKycState('idle');
      return;
    }
    setIsSaving(true);
    try {
      await callEdgeFn('paystack-verify-bank', {
        action: 'save',
        account_number: accountNumber,
        bank_code: bankCode,
        bank_name: bankName,
        account_name: accountName,
      });
      setBankAlreadySaved(true);
      setSubStep('kyc');
      setKycState('idle');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save bank account. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---- KYC via Youverify ----
  // Always shows the prep screen, including on retry — it now also collects
  // the NIN + consent, which must be (re)confirmed each attempt (e.g. a
  // mistyped NIN causing a "not found" rejection needs correcting, not replaying).
  const handleStartKyc = () => {
    setKycState('prep');
  };

  const launchKyc = async () => {
    if (!user) return;
    if (!/^\d{11}$/.test(nin)) {
      return Alert.alert('Required', 'Enter your 11-digit NIN.');
    }
    if (!ninConsent) {
      return Alert.alert('Required', 'Please confirm you consent to identity verification.');
    }
    setKycState('loading');
    setKycErrorReason(null);
    try {
      // The WebView's onPermissionRequest can only grant the page's request
      // for a resource the app is already OS-permitted to use — it can't
      // itself trigger the Android runtime permission prompt. Without this,
      // the liveness widget's camera access fails silently (blank screen,
      // no error) even though onPermissionRequest grants its side cleanly.
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera needed', 'Please allow camera access to complete identity verification.');
        setKycState('prep');
        return;
      }
      const data = await callEdgeFn('vendor-kyc-init', { vendor_id: user.id });
      setKycUrl(data.verification_url);
      setKycState('webview');
    } catch (err: any) {
      Alert.alert('Error', err.message);
      setKycState('idle');
    }
  };

  // The widget only captures the selfie/liveness (see vendor-kyc-liveness-widget) —
  // the actual NIN match+verification happens server-side in vendor-kyc-verify,
  // called here once the widget hands back a live face image.
  const handleWebViewMessage = async (event: any) => {
    let msg: any;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // Non-JSON WebView messages — ignore
    }

    if (msg.type === 'liveness_failed') {
      setKycState('failed');
      setKycErrorReason(null);
      return;
    }
    if (msg.type !== 'liveness_success' || !msg.faceImage) return;

    setKycState('loading');
    try {
      const result = await callEdgeFn('vendor-kyc-verify', { nin, selfie: msg.faceImage });
      if (result.allValidationPassed) {
        setKycState('done');
        setKycVerified(true);
      } else {
        setKycState('failed');
        setKycErrorReason(result.reason ?? null);
      }
    } catch (err: any) {
      setKycState('failed');
      setKycErrorReason(err.message ?? null);
    }
  };

  // Bank is already saved by handleBankContinue by the time this is reachable
  // (kycVerified only becomes true after the KYC sub-step, which only starts
  // after a successful bank save) — this just confirms and routes onward.
  const handleSubmitForReview = () => {
    if (!bankVerified) return Alert.alert('Required', 'Please verify your bank account first.');
    if (!kycVerified) return Alert.alert('Required', 'Please complete identity verification first.');
    router.replace('/vendor-onboarding/step-5-pending');
  };

  // ---- Render: Youverify WebView ----
  if (kycState === 'webview') {
    return (
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri: kycUrl }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          // Liveness capture needs the camera — Android WebView permission
          // requests are a separate JS-bridge grant from the app-level OS
          // permission (already declared in AndroidManifest.xml/app.config.js).
          onPermissionRequest={(request: any) => request.grant(request.resources)}
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
        <Text style={styles.title}>Almost there.</Text>

        {/* Mini sub-step indicator */}
        <View style={styles.subStepRow}>
          <View style={[
            styles.subStepDot,
            subStep === 'bank' ? styles.subStepDotActive : bankVerified ? styles.subStepDotDone : undefined,
          ]} />
          <View style={styles.subStepLine} />
          <View style={[
            styles.subStepDot,
            kycVerified ? styles.subStepDotDone : subStep === 'kyc' ? styles.subStepDotActive : undefined,
          ]} />
        </View>
        <View style={styles.subStepLabels}>
          <Text style={[styles.subStepLabel, subStep === 'bank' && styles.subStepLabelActive]}>
            {bankVerified ? '✓ ' : ''}1 of 2 · Bank account
          </Text>
          <Text style={[styles.subStepLabel, subStep === 'kyc' && styles.subStepLabelActive]}>
            {kycVerified ? '✓ ' : ''}2 of 2 · Identity
          </Text>
        </View>

        {/* ---- Sub-step A: Bank ---- */}
        {subStep === 'bank' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bank account</Text>
            <Text style={styles.sectionSub}>Where your earnings will be sent after every job.</Text>

            <TouchableOpacity style={styles.input} onPress={handleLoadBanks}>
              <Text style={bankName ? styles.inputText : styles.inputPlaceholder}>
                {bankName || 'Select bank'}
              </Text>
            </TouchableOpacity>

            {showBankPicker && (
              <View style={styles.bankPicker}>
                <View style={styles.bankPickerHeader}>
                  <VarsInput
                    theme={theme}
                    placeholder="Search banks"
                    value={bankSearch}
                    onChangeText={setBankSearch}
                    autoFocus
                    containerStyle={styles.bankSearchInput}
                  />
                  <TouchableOpacity
                    onPress={() => { setShowBankPicker(false); setBankSearch(''); }}
                    style={styles.bankPickerCancel}
                  >
                    <Text style={styles.bankPickerCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
                  {banks
                    .filter((b) => b.name.toLowerCase().includes(bankSearch.trim().toLowerCase()))
                    .map((b) => (
                      <TouchableOpacity
                        key={b.code}
                        style={styles.bankOption}
                        onPress={() => {
                          setBankCode(b.code);
                          setBankName(b.name);
                          setShowBankPicker(false);
                          setBankSearch('');
                          setBankVerified(false);
                          setBankAlreadySaved(false);
                          setAccountName('');
                        }}
                      >
                        <Text style={styles.bankOptionText}>{b.name}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </View>
            )}

            <VarsInput
              theme={theme}
              placeholder="Account number"
              value={accountNumber}
              onChangeText={(t) => { setAccountNumber(t); setBankVerified(false); setBankAlreadySaved(false); setAccountName(''); }}
              keyboardType="numeric"
              maxLength={10}
            />

            {accountName ? (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ {accountName}</Text>
              </View>
            ) : (
              <VarsButton
                theme={theme}
                variant="secondary"
                size="md"
                loading={isVerifyingBank}
                onPress={handleVerifyAccount}
                label="Verify account"
              />
            )}

            <VarsButton
              theme={theme}
              loading={isSaving}
              onPress={handleBankContinue}
              disabled={!bankVerified || isSaving}
              label="Continue · Identity check"
            />
          </View>
        )}

        {/* ---- Sub-step B: KYC ---- */}
        {subStep === 'kyc' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Identity verification</Text>

            {kycState === 'failed' && (
              <View style={styles.errorCallout}>
                <Text style={styles.errorCalloutTitle}>Let's try that again</Text>
                {kycErrorReason ? (
                  <Text style={styles.errorCalloutBody}>{kycErrorReason}</Text>
                ) : null}
                <Text style={styles.errorCalloutHint}>
                  For best results: ID well-lit with all four corners visible, selfie in natural light.
                </Text>
              </View>
            )}

            {kycState === 'review' && (
              <View style={styles.reviewCallout}>
                <Text style={styles.reviewCalloutTitle}>Confirming your details</Text>
                <Text style={styles.reviewCalloutBody}>
                  This usually takes a few minutes. You'll get a notification once you're verified.
                </Text>
              </View>
            )}

            {/* Prep screen — shown before launching WebView */}
            {kycState === 'prep' && (
              <VarsSurface theme={theme} elevation={1} style={styles.prepCard}>
                <Text style={styles.prepTitle}>Before you start</Text>
                <Text style={styles.prepItem}>· Your 11-digit National Identification Number (NIN)</Text>
                <Text style={styles.prepItem}>· A clear selfie in good lighting, face the camera directly</Text>
                <Text style={styles.prepItem}>· Takes about a minute</Text>
                <View style={styles.prepDivider} />

                <VarsInput
                  theme={theme}
                  placeholder="NIN (11 digits)"
                  value={nin}
                  onChangeText={(t) => setNin(t.replace(/\D/g, '').slice(0, 11))}
                  keyboardType="number-pad"
                  maxLength={11}
                />

                <VarsCheckbox
                  theme={theme}
                  checked={ninConsent}
                  onChange={setNinConsent}
                  label="I consent to my identity being verified using this NIN."
                />

                <Text style={styles.prepNote}>
                  Your identity is verified by Youverify, a licensed verification service. VARS does not store your raw ID documents.
                </Text>
                <VarsButton
                  theme={theme}
                  size="md"
                  onPress={launchKyc}
                  disabled={nin.length !== 11 || !ninConsent}
                  label="Start identity check →"
                />
                <TouchableOpacity onPress={() => setKycState('idle')} style={styles.prepBack}>
                  <Text style={styles.prepBackText}>Go back</Text>
                </TouchableOpacity>
              </VarsSurface>
            )}

            {kycVerified ? (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ Identity verified</Text>
              </View>
            ) : kycState !== 'review' && kycState !== 'prep' ? (
              <VarsButton
                theme={theme}
                size="md"
                loading={kycState === 'loading'}
                onPress={handleStartKyc}
                label={kycState === 'failed' ? 'Try again' : 'Start identity check'}
              />
            ) : null}

            {kycVerified && (
              <VarsButton
                theme={theme}
                onPress={handleSubmitForReview}
                disabled={!kycVerified || !bankVerified}
                label="Submit for review"
              />
            )}
          </View>
        )}
      </ScrollView>

    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
    title: { fontSize: 26, fontWeight: '700', color: theme.color.ink, marginBottom: 20 },

    subStepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    subStepDot: {
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: theme.color.inkFaint,
    },
    subStepDotActive: { backgroundColor: theme.color.ink },
    subStepDotDone: { backgroundColor: theme.color.accentGreen },
    subStepLine: { flex: 1, height: 2, backgroundColor: theme.color.inkFaint, marginHorizontal: 6 },
    subStepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
    subStepLabel: { fontSize: 12, color: theme.color.inkMuted, fontWeight: '500' },
    subStepLabelActive: { color: theme.color.ink, fontWeight: '700' },

    section: { gap: 12 },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    sectionSub: { fontSize: 14, color: theme.color.inkMuted },

    // Pale semantic-tint callouts — no dark-mode-safe tint token exists yet, stay fixed.
    errorCallout: { backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS, padding: 14, gap: 6 },
    errorCalloutTitle: { fontSize: 15, fontWeight: '700', color: theme.color.accentRed },
    errorCalloutBody: { fontSize: 14, color: theme.color.accentRed, opacity: 0.85 },
    errorCalloutHint: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },

    reviewCallout: { backgroundColor: '#F0F9FF', borderRadius: BORDER_RADIUS, padding: 14, gap: 6 },
    reviewCalloutTitle: { fontSize: 15, fontWeight: '700', color: theme.color.ink },
    reviewCalloutBody: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20 },

    prepCard: { padding: 20, gap: 10 },
    prepTitle: { fontSize: 16, fontWeight: '700', color: theme.color.ink, marginBottom: 4 },
    prepItem: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20 },
    prepDivider: { height: BORDER_WIDTH.thin, backgroundColor: theme.color.inkFaint, marginVertical: 6 },
    prepNote: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },
    prepBack: { alignItems: 'center', paddingVertical: 8 },
    prepBackText: { fontSize: 14, color: theme.color.inkMuted },

    verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: BORDER_RADIUS, padding: 12 },
    verifiedText: { color: theme.color.accentGreen, fontSize: 15, fontWeight: '600' },

    input: { height: 50, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS, paddingHorizontal: 14, justifyContent: 'center' },
    inputText: { fontSize: 16, color: theme.color.ink },
    inputPlaceholder: { fontSize: 16, color: theme.color.inkMuted },

    bankPicker: { borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS, overflow: 'hidden', backgroundColor: theme.color.bg },
    bankPickerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
    bankSearchInput: { flex: 1, marginBottom: 0 },
    bankPickerCancel: { paddingHorizontal: 4, paddingVertical: 10 },
    bankPickerCancelText: { fontSize: 14, fontWeight: '600', color: theme.color.ink },
    bankOption: { padding: 14, borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint },
    bankOptionText: { fontSize: 15, color: theme.color.ink },

    // Floats over the KYC WebView, not app chrome — stays fixed-contrast.
    cancelKyc: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: BORDER_RADIUS, paddingHorizontal: 14, paddingVertical: 8 },
    cancelKycText: { color: '#FFF', fontWeight: '600' },
  });
}
