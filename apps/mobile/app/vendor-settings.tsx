// ============================================================
// VARS — Vendor Settings (root stack screen — lives above tab navigator)
// Sections: Account, Security, Payout details, Support, Legal
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Pressable,
  ScrollView, Alert, Modal, Switch, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { ChevronRightIcon, CheckIcon } from '@/components/icons';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VarsSwitch } from '@/components/ui';

// Stored in AsyncStorage; enforcement gate belongs in _layout.tsx on AppState change.
const BIOMETRIC_KEY = 'vars_biometric_lock';

export default function VendorSettings() {
  const insets = useSafeAreaInsets();
  const { theme, appearance, override, setOverride } = useVarsTheme();

  // Account
  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Payout
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [payoutReady, setPayoutReady] = useState(false);

  // Support modal
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Biometric
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useFocusEffect(useCallback(() => {
    loadData();
    checkBiometric();
  }, []));

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('vendors')
      .select('full_name, email, phone_number, bank_name, bank_account_number, bank_account_name, paystack_subaccount_code')
      .eq('id', user.id)
      .single();
    if (!data) return;
    const name = data.full_name ?? '';
    setDisplayName(name);
    setSavedName(name);
    setEmail(data.email ?? '');
    setPhone(data.phone_number ?? '');
    setIsEmailUser(user.identities?.some(i => i.provider === 'email') ?? false);
    setBankName(data.bank_name ?? '');
    setAccountNumber(data.bank_account_number ?? '');
    setAccountName(data.bank_account_name ?? '');
    setPayoutReady(!!data.paystack_subaccount_code);
  };

  const checkBiometric = async () => {
    const has = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(has && enrolled);
    const stored = await AsyncStorage.getItem(BIOMETRIC_KEY);
    setBiometricEnabled(stored === 'true');
  };

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || savingName || trimmed === savedName) return;
    setSavingName(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingName(false); return; }
    const { error } = await supabase.from('vendors').update({ full_name: trimmed }).eq('id', user.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSavedName(trimmed);
    }
    setSavingName(false);
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable biometric unlock',
        cancelLabel: 'Cancel',
      });
      if (!result.success) return;
    }
    await AsyncStorage.setItem(BIOMETRIC_KEY, value ? 'true' : 'false');
    setBiometricEnabled(value);
  };

  const handleChangePassword = async () => {
    if (!isEmailUser) return;
    if (currentPassword.length === 0) {
      return Alert.alert('Required', 'Enter your current password to continue.');
    }
    if (newPassword.length < 8) {
      return Alert.alert('Too short', 'Password must be at least 8 characters.');
    }
    if (newPassword === currentPassword) {
      return Alert.alert('Same password', 'New password must be different from your current one.');
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('No match', 'Passwords do not match — try again.');
    }
    setSavingPassword(true);
    // Re-authenticate to verify current password — updateUser alone doesn't check it.
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (authError) {
      setSavingPassword(false);
      return Alert.alert('Incorrect password', 'Current password is wrong — try again.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      dismissPasswordModal();
      Alert.alert('Done', 'Your password has been updated.');
    }
  };

  const buildTicket = () => `VARS-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  const handleSupportEmail = async () => {
    setShowSupportModal(false);
    const ticket = buildTicket();
    const subject = encodeURIComponent(`[${ticket}] VARS Support Request`);
    const body = encodeURIComponent(
      `[Write your message above this line — do not edit below]\n\n────────────────────────\nTicket: ${ticket}\nVARS Email: ${email}\nVARS Phone: ${phone}`
    );
    Linking.openURL(`mailto:support@bookwithvars.com?subject=${subject}&body=${body}`);
  };

  const handleSupportWhatsApp = async () => {
    setShowSupportModal(false);
    const ticket = buildTicket();
    const message = encodeURIComponent(
      `Hi VARS, I need help with something.\n\nTicket: ${ticket}\nVARS Email: ${email}\nVARS Phone: ${phone}`
    );
    Linking.openURL(`https://wa.me/447344975063?text=${message}`);
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      "You'll be signed out of this device.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
    );
  };

  const dismissPasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const maskAccount = (num: string) =>
    num.length > 4 ? '•'.repeat(num.length - 4) + ' ' + num.slice(-4) : num;

  const nameDirty = displayName.trim() !== savedName && displayName.trim().length > 0;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ACCOUNT */}
        <Text style={s.sectionLabel}>Account</Text>
        <View style={s.card}>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Name</Text>
            <TextInput
              style={s.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your display name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={25}
            />
            {nameDirty && (
              <TouchableOpacity
                style={[s.confirmBtn, savingName && s.saveBtnDisabled]}
                onPress={handleSaveName}
                disabled={savingName}
                activeOpacity={0.85}
                accessibilityLabel="Save name"
                accessibilityRole="button"
              >
                {savingName
                  ? <ScissorsLoader size="small" color="light" />
                  : <CheckIcon size={18} color={Colors.white} />}
              </TouchableOpacity>
            )}
          </View>
          <View style={[s.fieldRow, s.lockedRow]}>
            <Text style={s.fieldLabel}>Email</Text>
            <Text style={s.fieldValue}>{email || '—'}</Text>
            <Text style={s.lockBadge}>Locked</Text>
          </View>
          <View style={[s.fieldRow, s.lockedRow, s.lastRow]}>
            <Text style={s.fieldLabel}>Phone</Text>
            <Text style={s.fieldValue}>{phone || '—'}</Text>
            <Text style={s.lockBadge}>Locked</Text>
          </View>
        </View>

        {/* SECURITY */}
        <Text style={s.sectionLabel}>Security</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => isEmailUser
              ? setShowPasswordModal(true)
              : Alert.alert('Not available', 'You sign in with your phone number — password change is not available.')
            }
            activeOpacity={0.7}
          >
            <Text style={[s.rowLabel, !isEmailUser && { color: Colors.textMuted }]}>Change password</Text>
            <ChevronRightIcon size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          {biometricAvailable && (
            <View style={s.row}>
              <Text style={s.rowLabel}>Biometric unlock</Text>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ false: Colors.border, true: Colors.ink }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.border}
              />
            </View>
          )}
          <TouchableOpacity style={[s.row, s.lastRow]} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={s.rowDestructive}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* APPEARANCE */}
        <Text style={s.sectionLabel}>Appearance</Text>
        <View style={s.card}>
          <View style={[s.switchRow, override === 'system' && s.lastRow]}>
            <VarsSwitch
              value={override === 'system'}
              onChange={(on) => setOverride(on ? 'system' : appearance)}
              label="Match system appearance"
              theme={theme}
            />
          </View>
          {override !== 'system' && (
            <View style={[s.switchRow, s.lastRow]}>
              <VarsSwitch
                value={override === 'dark'}
                onChange={(on) => setOverride(on ? 'dark' : 'light')}
                label="Dark mode"
                theme={theme}
              />
            </View>
          )}
        </View>

        {/* PAYOUT DETAILS */}
        <Text style={s.sectionLabel}>Payout details</Text>
        <View style={s.card}>
          {payoutReady ? (
            <>
              <View style={[s.fieldRow, s.lockedRow]}>
                <Text style={s.fieldLabel}>Bank</Text>
                <Text style={s.fieldValue}>{bankName || '—'}</Text>
              </View>
              <View style={[s.fieldRow, s.lockedRow]}>
                <Text style={s.fieldLabel}>Account</Text>
                <Text style={s.fieldValue}>{maskAccount(accountNumber)}</Text>
              </View>
              <View style={[s.fieldRow, s.lockedRow, s.lastRow]}>
                <Text style={s.fieldLabel}>Name</Text>
                <Text style={s.fieldValue}>{accountName || '—'}</Text>
              </View>
            </>
          ) : (
            <View style={[s.row, s.lastRow]}>
              <Text style={[s.rowLabel, { color: Colors.textMuted }]}>No bank account connected</Text>
            </View>
          )}
        </View>

        {/* SUPPORT */}
        <Text style={s.sectionLabel}>Support</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={[s.row, s.lastRow]}
            onPress={() => setShowSupportModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Get help</Text>
            <ChevronRightIcon size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* LEGAL */}
        <Text style={s.sectionLabel}>Legal</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/vendor-terms' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Terms of use</Text>
            <ChevronRightIcon size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/vendor-privacy' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Privacy policy</Text>
            <ChevronRightIcon size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, s.lastRow]}
            onPress={() => router.push('/privacy-data' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Privacy and data</Text>
            <ChevronRightIcon size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Change password sheet */}
      {/* Support channel picker */}
      <Modal
        visible={showSupportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <Pressable style={s.supportOverlay} onPress={() => setShowSupportModal(false)}>
          <Pressable style={s.supportSheet} onPress={() => {}}>
            <Text style={s.supportTitle}>Get help</Text>
            <Text style={s.supportSub}>Choose how you'd like to reach us</Text>
            <View style={[s.card, { marginTop: 16, marginBottom: 0 }]}>
              <TouchableOpacity style={s.row} onPress={handleSupportWhatsApp} activeOpacity={0.7}>
                <Text style={s.rowLabel}>WhatsApp</Text>
                <ChevronRightIcon size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.row, s.lastRow]} onPress={handleSupportEmail} activeOpacity={0.7}>
                <Text style={s.rowLabel}>Email</Text>
                <ChevronRightIcon size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={dismissPasswordModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.supportOverlay} onPress={dismissPasswordModal}>
            <Pressable style={s.supportSheet} onPress={() => {}}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Change password</Text>
                <TouchableOpacity onPress={dismissPasswordModal} hitSlop={12}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            <View style={s.modalBody}>
              <View style={s.passwordField}>
                <TextInput
                  style={s.passwordInput}
                  placeholder="Current password"
                  placeholderTextColor={Colors.textMuted}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrent}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} hitSlop={8}>
                  <Text style={s.showToggle}>{showCurrent ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              <View style={s.passwordField}>
                <TextInput
                  style={s.passwordInput}
                  placeholder="New password"
                  placeholderTextColor={Colors.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={8}>
                  <Text style={s.showToggle}>{showNew ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              <View style={s.passwordField}>
                <TextInput
                  style={s.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                  <Text style={s.showToggle}>{showConfirm ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[s.saveBtn, savingPassword && s.saveBtnDisabled]}
                onPress={handleChangePassword}
                disabled={savingPassword}
                activeOpacity={0.85}
              >
                {savingPassword
                  ? <ScissorsLoader size="small" color="light" />
                  : <Text style={s.saveBtnText}>Update password</Text>}
              </TouchableOpacity>
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: Colors.ink, lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 2,
  },
  card: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BORDER_RADIUS,
    backgroundColor: Colors.background, marginBottom: 28, overflow: 'hidden',
  },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    minHeight: 54, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  lockedRow: { backgroundColor: Colors.surface },
  lastRow: { borderBottomWidth: 0 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, width: 80 },
  fieldInput: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 0 },
  fieldValue: { flex: 1, fontSize: 15, color: Colors.text },
  lockBadge: {
    fontSize: 11, fontWeight: '600', color: Colors.textMuted,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BORDER_RADIUS,
    paddingHorizontal: 6, paddingVertical: 2,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, height: 54,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', color: Colors.text },
  rowDestructive: { fontSize: 15, fontWeight: '500', color: Colors.error },

  switchRow: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  confirmBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  saveBtn: {
    margin: 12, height: 48, backgroundColor: Colors.ink,
    borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

  supportOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  supportSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BORDER_RADIUS, borderTopRightRadius: BORDER_RADIUS,
    padding: 24, paddingBottom: 40,
  },
  supportTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  supportSub: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },

  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalCancel: { fontSize: 15, color: Colors.textMuted, fontWeight: '500' },
  modalBody: { paddingTop: 20 },
  passwordField: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BORDER_RADIUS,
    paddingHorizontal: 14, height: 54, marginBottom: 12,
  },
  passwordInput: { flex: 1, fontSize: 15, color: Colors.text },
  showToggle: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', paddingLeft: 8 },
});
