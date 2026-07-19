// ============================================================
// VARS — User Profile & Settings (Phase 12)
// Sections: avatar + name header, edit name/phone,
//   booking history, favourites shortcut, sign out.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, KeyboardAvoidingView,
  Platform, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { ConfirmModal } from '@/components/ConfirmModal';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VarsSkeleton, VarsSwitch } from '@/components/ui';
import { signOut } from '@/lib/auth';
import { pickAndUploadImage } from '@/lib/storage';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { fmtPrice, fmtLongDate } from '@/lib/format';
import { HeartIcon, BellIcon, EditIcon, ChevronRightIcon } from '@/components/icons';
import { BookingStatus } from '@vars/shared';

interface ActiveBooking {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  scheduled_at: string;
  vendor_name: string;
}

const STATUS_COLOR: Partial<Record<BookingStatus, string>> = {
  completed:        Colors.statusCompleted,
  cancelled:        Colors.statusCancelled,
  expired:          Colors.statusExpired,
  pending:          Colors.statusPending,
  accepted:         Colors.statusAccepted,
  on_way:           Colors.statusOnWay,
  arrived:          Colors.statusArrived,
  service_rendered: Colors.primary,
  disputed:         Colors.statusDisputed,
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile, isAuthenticated } = useAuth();
  const { theme, appearance, override, setOverride } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [editing, setEditing]         = useState(false);
  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [comingSoon, setComingSoon] = useState<{ title: string; body: string } | null>(null);

  const [bookings, setBookings]       = useState<ActiveBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Seed edit fields from profile
  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? '');
      setPhone((profile as any).phone_number ?? '');
    }
  }, [profile]);

  const loadBookings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bookings')
      .select('id, status, service_name, service_price_kobo, scheduled_at, vendors(full_name)')
      .eq('user_id', user.id)
      .not('status', 'in', '(completed,cancelled,expired)')
      .order('scheduled_at', { ascending: false })
      .limit(10);

    setBookings((data ?? []).map((b: any) => ({
      id: b.id,
      status: b.status,
      service_name: b.service_name,
      service_price_kobo: b.service_price_kobo,
      scheduled_at: b.scheduled_at,
      vendor_name: b.vendors?.full_name ?? 'Stylist',
    })));
    setLoadingBookings(false);
    setRefreshing(false);
  }, [user]);

  // Reload on every focus so the review state is fresh after returning from /review/[bookingId]
  useFocusEffect(useCallback(() => { loadBookings(); }, [loadBookings]));

  const saveProfile = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone_number: phone.trim() })
      .eq('id', user.id);
    if (error) Alert.alert('Error', error.message);
    else {
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
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

  const handleSignOut = () => setShowSignOutModal(true);

  if (!isAuthenticated) {
    return (
      <View style={s.centered}>
        <Text style={s.unauthText}>You're not signed in.</Text>
        <TouchableOpacity style={s.signInBtn} onPress={() => router.push('/auth/login')}>
          <Text style={s.signInBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeBookings = bookings;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBookings(); }} tintColor="transparent" colors={['transparent']} />
        }
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
          </View>
        )}
        {/* ── Avatar + name header ── */}
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={changePhoto} style={s.avatarWrap} disabled={uploadingPhoto}>
            {(profile as any)?.profile_photo_url ? (
              <Image source={{ uri: (profile as any).profile_photo_url }} style={s.avatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{profile?.full_name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={s.editPhotoBadge}>
              {uploadingPhoto
                ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                : <EditIcon size={12} color={theme.color.inverseInk} />
              }
            </View>
          </TouchableOpacity>

          {!editing ? (
            <>
              <Text style={s.name}>{profile?.full_name || 'Your name'}</Text>
              <Text style={s.phoneDisplay}>{(profile as any)?.phone_number || 'No phone set'}</Text>
              <TouchableOpacity style={s.editBtn} onPress={() => setEditing(true)}>
                <Text style={s.editBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.editForm}>
              <TextInput
                style={s.input}
                placeholder="Full name"
                placeholderTextColor={theme.color.inkMuted}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <TextInput
                style={s.input}
                placeholder="Phone number"
                placeholderTextColor={theme.color.inkMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <View style={s.editActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, (!name.trim() || saving) && s.btnDisabled]}
                  onPress={saveProfile}
                  disabled={!name.trim() || saving}
                >
                  {saving
                    ? <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'dark' : 'light'} />
                    : <Text style={s.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Active bookings ── */}
        {loadingBookings ? (
          <Section title="Active bookings" s={s}>
            {Array.from({ length: 2 }).map((_, i) => (
              <View key={i} style={s.bookingRow}>
                <View style={{ flex: 1, gap: 6 }}>
                  <VarsSkeleton theme={theme} height={14} width="55%" />
                  <VarsSkeleton theme={theme} height={12} width="70%" />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <VarsSkeleton theme={theme} height={14} width={50} />
                  <VarsSkeleton theme={theme} height={18} width={70} radius={BORDER_RADIUS} />
                </View>
              </View>
            ))}
          </Section>
        ) : activeBookings.length > 0 && (
          <Section title="Active bookings" s={s}>
            {activeBookings.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={s.bookingRow}
                onPress={() => router.push(`/live/${b.id}` as any)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.bookingService}>{b.service_name}</Text>
                  <Text style={s.bookingMeta}>{b.vendor_name} · {fmtLongDate(b.scheduled_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.bookingPrice}>{fmtPrice(b.service_price_kobo)}</Text>
                  <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[b.status] ?? theme.color.inkMuted) + '18' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[b.status] ?? theme.color.inkMuted }]}>
                      {b.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ── Settings rows ── */}
        <Section title="Account" s={s}>
          <SettingsRow
            icon={<HeartIcon size={18} color={theme.color.ink} />}
            label="My favourites"
            onPress={() => setComingSoon({ title: 'Coming soon', body: 'Save your favourite stylists. Launching soon.' })}
            s={s}
            theme={theme}
          />
          <SettingsRow
            icon={<BellIcon size={18} color={theme.color.ink} />}
            label="Notification preferences"
            onPress={() => setComingSoon({ title: 'Coming soon', body: 'Notification controls are on the way.' })}
            s={s}
            theme={theme}
          />
          <SettingsRow
            icon={<Text style={{ fontSize: 16 }}>🔒</Text>}
            label="Privacy and data"
            onPress={() => router.push('/privacy-data' as any)}
            s={s}
            theme={theme}
          />
        </Section>

        {/* ── Appearance ── */}
        <Section title="Appearance" s={s}>
          <View style={[s.switchRow, override === 'system' && s.switchRowLast]}>
            <VarsSwitch
              value={override === 'system'}
              onChange={(on) => setOverride(on ? 'system' : appearance)}
              label="Match system appearance"
              theme={theme}
            />
          </View>
          {override !== 'system' && (
            <View style={[s.switchRow, s.switchRowLast]}>
              <VarsSwitch
                value={override === 'dark'}
                onChange={(on) => setOverride(on ? 'dark' : 'light')}
                label="Dark mode"
                theme={theme}
              />
            </View>
          )}
        </Section>

        {/* ── Sign out ── */}
        <View style={s.signOutWrap}>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <Text style={s.versionText}>VARS v1.0</Text>
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showSignOutModal}
        title="Sign out"
        body="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        dismissLabel="Cancel"
        destructive
        onConfirm={() => { setShowSignOutModal(false); signOut(); }}
        onDismiss={() => setShowSignOutModal(false)}
      />

      <ConfirmModal
        visible={!!comingSoon}
        title={comingSoon?.title ?? ''}
        body={comingSoon?.body ?? ''}
        confirmLabel="Got it"
        dismissLabel={null}
        onConfirm={() => setComingSoon(null)}
        onDismiss={() => setComingSoon(null)}
      />
    </KeyboardAvoidingView>
  );
}

function Section({ title, children, s }: { title: string; children: React.ReactNode; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function SettingsRow({ icon, label, onPress, s, theme }: { icon: React.ReactNode; label: string; onPress: () => void; s: ReturnType<typeof makeStyles>; theme: VarsTheme }) {
  return (
    <TouchableOpacity style={s.settingsRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.settingsIcon}>{icon}</View>
      <Text style={s.settingsLabel}>{label}</Text>
      <ChevronRightIcon size={18} color={theme.color.inkMuted} />
    </TouchableOpacity>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
    unauthText: { fontSize: 16, color: theme.color.inkMuted, marginBottom: 20 },
    signInBtn: { paddingHorizontal: 32, paddingVertical: 14, backgroundColor: theme.color.ink, borderRadius: BORDER_RADIUS },
    signInBtnText: { color: theme.color.inverseInk, fontSize: 16, fontWeight: '700' },

    // Header
    header: {
      alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28,
      backgroundColor: theme.color.bg, borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    avatarWrap: { position: 'relative', marginBottom: 14 },
    avatar: { width: 88, height: 88, borderRadius: 44 },
    avatarFallback: { backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 36, fontWeight: '800', color: theme.color.inverseInk },
    editPhotoBadge: {
      position: 'absolute', bottom: 0, right: 0,
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: theme.color.ink,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: theme.color.bg,
    },
    name: { fontSize: 22, fontWeight: '800', color: theme.color.ink, marginBottom: 4 },
    phoneDisplay: { fontSize: 14, color: theme.color.inkMuted, marginBottom: 12 },
    editBtn: { paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1.5, borderColor: theme.color.inkFaint, borderRadius: 5 },
    editBtnText: { fontSize: 13, fontWeight: '600', color: theme.color.inkMuted },

    // Edit form
    editForm: { width: '100%', gap: 10, marginTop: 4 },
    input: {
      backgroundColor: theme.color.surface2, borderRadius: BORDER_RADIUS,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      paddingHorizontal: 14, paddingVertical: 11,
      fontSize: 15, color: theme.color.ink,
    },
    editActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: {
      flex: 1, height: 46, borderRadius: 5,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      alignItems: 'center', justifyContent: 'center',
    },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    saveBtn: {
      flex: 2, height: 46, borderRadius: BORDER_RADIUS,
      backgroundColor: theme.color.ink,
      alignItems: 'center', justifyContent: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: theme.color.inverseInk },
    btnDisabled: { opacity: 0.5 },

    // Section
    section: { paddingTop: 24, paddingHorizontal: 16 },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
    },
    sectionBody: {
      backgroundColor: theme.color.bg,
      borderRadius: 5, borderWidth: 1, borderColor: theme.color.inkFaint, overflow: 'hidden',
    },

    // Booking rows
    bookingRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    bookingService: { fontSize: 14, fontWeight: '700', color: theme.color.ink },
    bookingMeta: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    bookingPrice: { fontSize: 14, fontWeight: '700', color: theme.color.ink },
    statusPill: { borderRadius: BORDER_RADIUS, paddingHorizontal: 7, paddingVertical: 2 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    reviewBtn: {
      borderWidth: 1, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    reviewBtnText: { fontSize: 11, fontWeight: '700', color: theme.color.inkMuted },
    reviewedText: { fontSize: 11, color: theme.color.inkMuted, fontWeight: '600' },
    emptyText: { fontSize: 13, color: theme.color.inkMuted, padding: 16, textAlign: 'center' },

    // Settings
    settingsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    settingsIcon: { width: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
    settingsLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.color.ink },
    switchRow: {
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    switchRowLast: { borderBottomWidth: 0 },

    // Sign out
    signOutWrap: { alignItems: 'center', paddingTop: 32, paddingBottom: 8, gap: 12 },
    signOutBtn: { paddingHorizontal: 32, paddingVertical: 12, borderWidth: 1.5, borderColor: theme.color.inkFaint, borderRadius: 5 },
    signOutText: { fontSize: 15, fontWeight: '600', color: theme.color.accentRed },
    versionText: { fontSize: 12, color: theme.color.inkMuted },
  });
}
