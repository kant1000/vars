// ============================================================
// VARS — User Profile & Settings (Phase 12)
// Sections: avatar + name header (display-only, editing lives in
//   /customer-settings), booking history, favourites shortcut, sign out.
// ============================================================
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
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
import { Colors, BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { fmtPrice, fmtLongDate } from '@/lib/format';
import { HeartIcon, GearIcon, ChevronRightIcon } from '@/components/icons';
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
  const { user, profile, isAuthenticated } = useAuth();
  const { theme, appearance, override, setOverride } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const [bookings, setBookings]       = useState<ActiveBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

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
    <View style={{ flex: 1 }}>
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
        {/* ── Title header bar ── */}
        <View style={[s.header, { paddingTop: insets.top + 14 }]}>
          <Text style={s.headerTitle}>Profile</Text>
        </View>

        {/* ── Hero row: avatar left (display-only), name/phone + gear right ── */}
        <View style={s.heroRow}>
          <View style={s.heroAvatarWrap}>
            {(profile as any)?.profile_photo_url ? (
              <Image source={{ uri: (profile as any).profile_photo_url }} style={s.heroAvatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[s.heroAvatar, s.heroAvatarFallback]}>
                <Text style={s.heroAvatarText}>{profile?.full_name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
          </View>

          <View style={s.heroInfo}>
            <View style={s.heroNameRow}>
              <Text style={s.heroName} numberOfLines={1}>{profile?.full_name || 'Your name'}</Text>
              <TouchableOpacity onPress={() => router.push('/customer-settings' as any)} hitSlop={8} style={s.heroEditBtn} activeOpacity={0.7}>
                <GearIcon size={22} color={theme.color.inkMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.heroPhone} numberOfLines={1}>{(profile as any)?.phone_number || 'No phone set'}</Text>
          </View>
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
                onPress={() => router.push(`/booking/detail/${b.id}` as any)}
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
            onPress={() => router.push('/favorites' as any)}
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
          <SettingsRow
            icon={<Text style={{ fontSize: 16 }}>💬</Text>}
            label="Customer Care"
            onPress={() => router.push('/customer-care' as any)}
            s={s}
            theme={theme}
            last
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
    </View>
  );
}

function Section({ title, children, s }: { title: string; children: React.ReactNode; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SettingsRow({ icon, label, onPress, s, theme, last }: { icon: React.ReactNode; label: string; onPress: () => void; s: ReturnType<typeof makeStyles>; theme: VarsTheme; last?: boolean }) {
  return (
    <TouchableOpacity style={[s.settingsRow, last && s.settingsRowLast]} onPress={onPress} activeOpacity={0.7}>
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

    // Title header bar
    header: {
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    headerTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink },

    // Hero row
    heroRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 20, gap: 14,
    },
    heroAvatarWrap: { width: 56, height: 56 },
    heroAvatar: { width: 56, height: 56, borderRadius: 28 },
    heroAvatarFallback: { backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' },
    heroAvatarText: { fontSize: 22, fontWeight: '800', color: theme.color.inverseInk },
    heroInfo: { flex: 1 },
    heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroName: { fontSize: 18, fontWeight: '700', color: theme.color.ink, flex: 1 },
    heroEditBtn: { padding: 4 },
    heroPhone: { fontSize: 13, color: theme.color.inkMuted, marginTop: 2 },

    // Section
    section: {
      marginTop: 8, borderTopWidth: BORDER_WIDTH.thin, borderTopColor: theme.color.inkFaint,
      paddingTop: 16, paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
    },

    // Booking rows
    bookingRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    bookingService: { fontSize: 14, fontWeight: '700', color: theme.color.ink },
    bookingMeta: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    bookingPrice: { fontSize: 14, fontWeight: '700', color: theme.color.ink },
    statusPill: { borderRadius: BORDER_RADIUS, paddingHorizontal: 7, paddingVertical: 2 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    reviewBtn: {
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    reviewBtnText: { fontSize: 11, fontWeight: '700', color: theme.color.inkMuted },
    reviewedText: { fontSize: 11, color: theme.color.inkMuted, fontWeight: '600' },
    emptyText: { fontSize: 13, color: theme.color.inkMuted, padding: 16, textAlign: 'center' },

    // Settings
    settingsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 14,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    settingsRowLast: { borderBottomWidth: 0 },
    settingsIcon: { width: 24, alignItems: 'center' as const, justifyContent: 'center' as const },
    settingsLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.color.ink },
    switchRow: {
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    switchRowLast: { borderBottomWidth: 0 },

    // Sign out
    signOutWrap: { alignItems: 'center', paddingTop: 32, paddingBottom: 8, gap: 12 },
    signOutBtn: { paddingHorizontal: 32, paddingVertical: 12, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint, borderRadius: 5 },
    signOutText: { fontSize: 15, fontWeight: '600', color: theme.color.accentRed },
    versionText: { fontSize: 12, color: theme.color.inkMuted },
  });
}
