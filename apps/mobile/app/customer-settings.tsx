// ============================================================
// VARS — Customer Settings (root stack screen — lives above tab navigator)
// Photo, name, phone. Mirrors vendor-settings.tsx's card/fieldRow
// convention. Phone changes go through Supabase's native phone-change OTP
// flow (updateUser + verifyOtp type:'phone_change') — profiles.phone_number
// is never written directly here, only synced by the DB trigger once the
// new number is actually confirmed (supabase/migrations/20260819010001).
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { pickAndUploadImage } from '@/lib/storage';
import { PhoneInput } from '@/components/PhoneInput';
import { CountryCode, normalizePhone } from '@vars/shared';
import { BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { CheckIcon, EditIcon, ChevronRightIcon } from '@/components/icons';
import { ScissorsLoader } from '@/components/ScissorsLoader';

type PhoneModalStep = 'enter' | 'verify';

export default function CustomerSettings() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // The GoTrue-confirmed phone for this session — compared against
  // profiles.phone_number to know whether the number on file actually came
  // through a verification event, or predates this migration.
  const [authPhone, setAuthPhone] = useState<string | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(true);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneModalStep, setPhoneModalStep] = useState<PhoneModalStep>('enter');
  const [newPhoneLocal, setNewPhoneLocal] = useState('');
  const [newPhoneCountry, setNewPhoneCountry] = useState<CountryCode>('+234');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneChangeError, setPhoneChangeError] = useState<string | null>(null);
  const [sendingPhoneOtp, setSendingPhoneOtp] = useState(false);
  const [verifyingPhoneOtp, setVerifyingPhoneOtp] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.full_name ?? '');
      setSavedName(profile.full_name ?? '');
    }
  }, [profile]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthPhone(data.user?.phone ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`vars_phone_nudge_dismissed_${user.id}`).then((v) => setNudgeDismissed(v === 'true'));
  }, [user]);

  const nameDirty = displayName.trim() !== savedName && displayName.trim().length > 0;
  const phoneNumber = (profile as any)?.phone_number || '';
  const digitsOnly = (v: string) => v.replace(/\D/g, '');
  const phoneUnverified = !!phoneNumber && digitsOnly(authPhone ?? '') !== digitsOnly(phoneNumber);
  const showNudge = phoneUnverified && !nudgeDismissed;

  const dismissNudge = async () => {
    setNudgeDismissed(true);
    if (user) await AsyncStorage.setItem(`vars_phone_nudge_dismissed_${user.id}`, 'true');
  };

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || savingName || trimmed === savedName || !user) return;
    setSavingName(true);
    const { error } = await supabase.from('profiles').update({ full_name: trimmed }).eq('id', user.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSavedName(trimmed);
      await refreshProfile();
    }
    setSavingName(false);
  };

  const changePhoto = async () => {
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadImage({
        bucket: 'avatars',
        path: `users/${user.id}/avatar`,
      });
      if (url) {
        await supabase.from('profiles').update({ profile_photo_url: url }).eq('id', user.id);
        await refreshProfile();
      }
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openPhoneModal = () => {
    setPhoneModalStep('enter');
    setNewPhoneLocal('');
    setPhoneOtpCode('');
    setPhoneChangeError(null);
    setShowPhoneModal(true);
  };

  const dismissPhoneModal = () => {
    setShowPhoneModal(false);
    setPhoneModalStep('enter');
    setNewPhoneLocal('');
    setPhoneOtpCode('');
    setPhoneChangeError(null);
  };

  const newPhoneNormalized = normalizePhone(newPhoneLocal, newPhoneCountry);

  const handleSendPhoneOtp = async () => {
    if (!newPhoneNormalized) return;
    setSendingPhoneOtp(true);
    setPhoneChangeError(null);
    try {
      const { error } = await supabase.auth.updateUser({ phone: newPhoneNormalized });
      if (error) throw error;
      setPhoneOtpCode('');
      setPhoneModalStep('verify');
    } catch (err: any) {
      setPhoneChangeError(err.message ?? 'Could not send code. Please try again.');
    } finally {
      setSendingPhoneOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (!newPhoneNormalized || phoneOtpCode.trim().length !== 6) return;
    setVerifyingPhoneOtp(true);
    setPhoneChangeError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: newPhoneNormalized,
        token: phoneOtpCode.trim(),
        type: 'phone_change',
      });
      if (error) throw error;
      await refreshProfile();
      const { data } = await supabase.auth.getUser();
      setAuthPhone(data.user?.phone ?? null);
      dismissPhoneModal();
      Alert.alert('Number updated', 'Your phone number has been verified and updated.');
    } catch (err: any) {
      setPhoneChangeError(err.message ?? 'The code was wrong or expired. Try again.');
    } finally {
      setVerifyingPhoneOtp(false);
    }
  };

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
        {showNudge && (
          <View style={s.nudge}>
            <Text style={s.nudgeText}>
              Verify your number so your stylist can reach you on the day.
            </Text>
            <View style={s.nudgeActions}>
              <TouchableOpacity onPress={openPhoneModal} hitSlop={6}>
                <Text style={s.nudgeAction}>Verify now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={dismissNudge} hitSlop={6}>
                <Text style={s.nudgeDismiss}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={s.sectionLabel}>Account</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.photoRow} onPress={changePhoto} disabled={uploadingPhoto} activeOpacity={0.7}>
            {(profile as any)?.profile_photo_url ? (
              <Image source={{ uri: (profile as any).profile_photo_url }} style={s.avatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{profile?.full_name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={s.photoRowLabel} />
            {uploadingPhoto
              ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
              : <EditIcon size={16} color={theme.color.inkMuted} />
            }
          </TouchableOpacity>

          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Name</Text>
            <TextInput
              style={s.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor={theme.color.inkMuted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={60}
            />
            {nameDirty && (
              <TouchableOpacity
                style={[s.confirmBtn, savingName && s.confirmBtnDisabled]}
                onPress={handleSaveName}
                disabled={savingName}
                activeOpacity={0.85}
                accessibilityLabel="Save name"
                accessibilityRole="button"
              >
                {savingName
                  ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                  : <CheckIcon size={18} color={theme.color.inverseInk} />}
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={[s.fieldRow, s.lastRow]} onPress={openPhoneModal} activeOpacity={0.7}>
            <Text style={s.fieldLabel}>Phone</Text>
            <Text style={s.fieldValue}>{phoneNumber || 'No phone set'}</Text>
            <ChevronRightIcon size={16} color={theme.color.inkMuted} />
          </TouchableOpacity>
        </View>
        <Text style={s.helperText}>
          Changing your number requires WhatsApp verification.
        </Text>
      </ScrollView>

      {/* Phone-change sheet */}
      <Modal
        visible={showPhoneModal}
        transparent
        animationType="fade"
        onRequestClose={dismissPhoneModal}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={s.overlay} onPress={dismissPhoneModal}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>
                  {phoneModalStep === 'enter' ? 'Change phone number' : 'Enter the code'}
                </Text>
                <TouchableOpacity onPress={dismissPhoneModal} hitSlop={12}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={s.modalBody}>
                {phoneModalStep === 'enter' ? (
                  <>
                    <PhoneInput
                      value={newPhoneLocal}
                      country={newPhoneCountry}
                      onChangeValue={setNewPhoneLocal}
                      onChangeCountry={setNewPhoneCountry}
                      autoFocus
                    />
                    {phoneChangeError && <Text style={s.errorText}>{phoneChangeError}</Text>}
                    <TouchableOpacity
                      style={[s.saveBtn, (!newPhoneNormalized || sendingPhoneOtp) && s.saveBtnDisabled]}
                      onPress={handleSendPhoneOtp}
                      disabled={!newPhoneNormalized || sendingPhoneOtp}
                      activeOpacity={0.85}
                    >
                      {sendingPhoneOtp
                        ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                        : <Text style={s.saveBtnText}>Send code</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={s.modalSub}>
                      We sent a 6-digit code to{'\n'}{newPhoneNormalized}.
                    </Text>
                    <TextInput
                      style={s.otpInput}
                      placeholder="000000"
                      placeholderTextColor={theme.color.inkMuted}
                      value={phoneOtpCode}
                      onChangeText={(t) => setPhoneOtpCode(t.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyPhoneOtp}
                      autoFocus
                    />
                    {phoneChangeError && <Text style={s.errorText}>{phoneChangeError}</Text>}
                    <TouchableOpacity
                      style={[s.saveBtn, (phoneOtpCode.length !== 6 || verifyingPhoneOtp) && s.saveBtnDisabled]}
                      onPress={handleVerifyPhoneOtp}
                      disabled={phoneOtpCode.length !== 6 || verifyingPhoneOtp}
                      activeOpacity={0.85}
                    >
                      {verifyingPhoneOtp
                        ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                        : <Text style={s.saveBtnText}>Verify</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 },

    nudge: {
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      padding: 14, marginBottom: 20, gap: 8,
    },
    nudgeText: { fontSize: 13, color: theme.color.ink, lineHeight: 18 },
    nudgeActions: { flexDirection: 'row', gap: 20 },
    nudgeAction: { fontSize: 13, fontWeight: '700', color: theme.color.ink, textDecorationLine: 'underline' },
    nudgeDismiss: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted },

    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginBottom: 8, marginLeft: 2,
    },
    card: {
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      backgroundColor: theme.color.bg, marginBottom: 12, overflow: 'hidden',
    },

    photoRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14,
      minHeight: 80, borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    // Matches heroAvatar on (tabs)/profile.tsx — same size on both pages.
    avatar: { width: 56, height: 56, borderRadius: 28 },
    avatarFallback: { backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 22, fontWeight: '800', color: theme.color.inverseInk },
    photoRowLabel: { flex: 1, fontSize: 15, color: theme.color.ink },

    fieldRow: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8,
      minHeight: 54, borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    lastRow: { borderBottomWidth: 0 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted, width: 80 },
    fieldInput: { flex: 1, fontSize: 15, color: theme.color.ink, paddingVertical: 0 },
    fieldValue: { flex: 1, fontSize: 15, color: theme.color.ink },

    confirmBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: theme.color.ink,
      alignItems: 'center', justifyContent: 'center',
      marginLeft: 8,
    },
    confirmBtnDisabled: { opacity: 0.5 },

    helperText: { fontSize: 12, color: theme.color.inkMuted, lineHeight: 17, marginHorizontal: 2 },

    overlay: { flex: 1, backgroundColor: theme.color.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.color.bg,
      borderTopLeftRadius: BORDER_RADIUS, borderTopRightRadius: BORDER_RADIUS,
      padding: 24, paddingBottom: 40,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingBottom: 16, borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    modalCancel: { fontSize: 15, color: theme.color.inkMuted, fontWeight: '500' },
    modalBody: { paddingTop: 20, gap: 12 },
    modalSub: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20 },
    otpInput: {
      height: 54, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      borderRadius: BORDER_RADIUS, textAlign: 'center', fontSize: 24, fontWeight: '700',
      letterSpacing: 6, color: theme.color.ink,
    },
    errorText: { fontSize: 13, color: theme.color.accentRed },

    saveBtn: {
      height: 48, backgroundColor: theme.color.ink,
      borderRadius: BORDER_RADIUS, alignItems: 'center', justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: theme.color.inverseInk, fontSize: 15, fontWeight: '700' },
  });
}
