// ============================================================
// VARS — User Profile & Settings (Phase 12)
// Sections: avatar + name header, edit name/phone,
//   booking history, favourites shortcut, sign out.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView,
  Platform, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { pickAndUploadImage } from '@/lib/storage';
import { Colors } from '@/constants/colors';
import { fmtPrice, fmtLongDate } from '@/lib/format';
import { HeartIcon, BellIcon, EditIcon, ChevronRightIcon } from '@/components/icons';
import { BookingStatus, BOOKING_STATUS } from '@vars/shared';

interface PastBooking {
  id: string;
  status: BookingStatus;
  service_name: string;
  service_price_kobo: number;
  scheduled_at: string;
  vendor_name: string;
  has_review: boolean;
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

  const [editing, setEditing]         = useState(false);
  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [saving, setSaving]           = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [bookings, setBookings]       = useState<PastBooking[]>([]);
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
      .select(`
        id, status, service_name, service_price_kobo, scheduled_at,
        vendors(full_name),
        reviews(id)
      `)
      .eq('user_id', user.id)
      .order('scheduled_at', { ascending: false })
      .limit(30);

    setBookings((data ?? []).map((b: any) => ({
      id: b.id,
      status: b.status,
      service_name: b.service_name,
      service_price_kobo: b.service_price_kobo,
      scheduled_at: b.scheduled_at,
      vendor_name: b.vendors?.full_name ?? 'Vendor',
      has_review: (b.reviews?.length ?? 0) > 0,
    })));
    setLoadingBookings(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

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

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

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

  const TERMINAL = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED] as BookingStatus[];
  const activeBookings = bookings.filter((b) => !TERMINAL.includes(b.status));
  const pastBookings   = bookings.filter((b) =>  TERMINAL.includes(b.status));

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
            <ScissorsLoader size="small" color="dark" />
          </View>
        )}
        {/* ── Avatar + name header ── */}
        <View style={[s.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={changePhoto} style={s.avatarWrap} disabled={uploadingPhoto}>
            {(profile as any)?.profile_photo_url ? (
              <Image source={{ uri: (profile as any).profile_photo_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{profile?.full_name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={s.editPhotoBadge}>
              {uploadingPhoto
                ? <ScissorsLoader size="small" color="light" />
                : <EditIcon size={12} color="#FFF" />
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
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <TextInput
                style={s.input}
                placeholder="Phone number"
                placeholderTextColor={Colors.textMuted}
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
                    ? <ScissorsLoader size="small" color="light" />
                    : <Text style={s.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Active bookings ── */}
        {activeBookings.length > 0 && (
          <Section title="Active bookings">
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
                  <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[b.status] ?? Colors.textMuted) + '20' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[b.status] ?? Colors.textMuted }]}>
                      {b.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ── Booking history ── */}
        <Section title="Booking history">
          {loadingBookings ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}><ScissorsLoader size="small" color="dark" /></View>
          ) : pastBookings.length === 0 ? (
            <Text style={s.emptyText}>No past bookings yet.</Text>
          ) : (
            pastBookings.map((b) => (
              <View key={b.id} style={s.bookingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bookingService}>{b.service_name}</Text>
                  <Text style={s.bookingMeta}>{b.vendor_name} · {fmtLongDate(b.scheduled_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={s.bookingPrice}>{fmtPrice(b.service_price_kobo)}</Text>
                  {b.status === 'completed' && !b.has_review && (
                    <TouchableOpacity
                      style={s.reviewBtn}
                      onPress={() => router.push(`/review/${b.id}` as any)}
                    >
                      <Text style={s.reviewBtnText}>Leave review</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === 'completed' && b.has_review && (
                    <Text style={s.reviewedText}>★ Reviewed</Text>
                  )}
                  {b.status !== 'completed' && (
                    <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[b.status] ?? Colors.textMuted) + '20' }]}>
                      <Text style={[s.statusText, { color: STATUS_COLOR[b.status] ?? Colors.textMuted }]}>
                        {b.status}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </Section>

        {/* ── Settings rows ── */}
        <Section title="Account">
          <SettingsRow
            icon={<HeartIcon size={18} color={Colors.text} />}
            label="My favourites"
            onPress={() => router.push('/(tabs)' as any)}
          />
          <SettingsRow
            icon={<BellIcon size={18} color={Colors.text} />}
            label="Notification preferences"
            onPress={() => router.push('/settings/notifications' as any)}
          />
        </Section>

        {/* ── Sign out ── */}
        <View style={s.signOutWrap}>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <Text style={s.versionText}>VARS v1.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function SettingsRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.settingsRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.settingsIcon}>{icon}</View>
      <Text style={s.settingsLabel}>{label}</Text>
      <ChevronRightIcon size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  unauthText: { fontSize: 16, color: Colors.textSecondary, marginBottom: 20 },
  signInBtn: { paddingHorizontal: 32, paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 14 },
  signInBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Header
  header: {
    alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28,
    backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: Colors.primary },
  editPhotoBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.background,
  },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  phoneDisplay: { fontSize: 14, color: Colors.textSecondary, marginBottom: 12 },
  editBtn: { paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20 },
  editBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },

  // Edit form
  editForm: { width: '100%', gap: 10, marginTop: 4 },
  input: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: Colors.text,
  },
  editActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, height: 46, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: {
    flex: 2, height: 46, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  btnDisabled: { opacity: 0.45 },

  // Section
  section: { paddingTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: Colors.background,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },

  // Booking rows
  bookingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bookingService: { fontSize: 14, fontWeight: '700', color: Colors.text },
  bookingMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  bookingPrice: { fontSize: 14, fontWeight: '700', color: Colors.text },
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  reviewBtn: {
    backgroundColor: Colors.star + '20', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  reviewBtnText: { fontSize: 11, fontWeight: '700', color: Colors.star },
  reviewedText: { fontSize: 11, color: Colors.star, fontWeight: '600' },
  emptyText: { fontSize: 13, color: Colors.textMuted, padding: 16, textAlign: 'center' },

  // Settings
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingsIcon: { width: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
  settingsLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },

  // Sign out
  signOutWrap: { alignItems: 'center', paddingTop: 32, paddingBottom: 8, gap: 12 },
  signOutBtn: { paddingHorizontal: 32, paddingVertical: 12, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12 },
  signOutText: { fontSize: 15, fontWeight: '600', color: Colors.error },
  versionText: { fontSize: 12, color: Colors.textMuted },
});
