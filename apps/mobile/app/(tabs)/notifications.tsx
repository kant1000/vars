// ============================================================
// VARS — Notifications Screen (Phase 10)
// Reads from notifications table (recipient_id = current user).
// Marks individual or all as read.
// Deep-links to booking screen via data.screen or booking_id.
// Realtime subscription for live badge updates.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsSkeleton } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { BellIcon, HourglassIcon, CheckCircleIcon, XCircleIcon, CreditCardIcon, BanknoteIcon, ArrowUpIcon, CarIcon, PinIcon, StarIcon, WarningIcon, ClockIcon, SparkleIcon } from '@/components/icons';

// ── Types ───────────────────────────────────────────────────
interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  booking_id: string | null;
  data: Record<string, any>;
  created_at: string;
}

// ── Notification type → icon ─────────────────────────────────
type IconComp = React.FC<{ size?: number; color?: string }>;
const TYPE_ICON: Record<string, IconComp> = {
  booking_pending:        HourglassIcon,
  booking_accepted:       CheckCircleIcon,
  booking_declined:       XCircleIcon,
  booking_expired:        ClockIcon,
  payment_authorized:     CreditCardIcon,
  payment_released:       ArrowUpIcon,
  payment_settled:        BanknoteIcon,
  vendor_on_way:          CarIcon,
  on_way:                 CarIcon,
  vendor_arrived:         PinIcon,
  arrived:                PinIcon,
  service_rendered:       SparkleIcon,
  booking_completed:      StarIcon,
  kyc_approved:           CheckCircleIcon,
  kyc_rejected:           WarningIcon,
  dispute_raised:         WarningIcon,
  dispute_resolved:       CheckCircleIcon,
  booking_cancelled:      XCircleIcon,
  booking_cancelled_free: XCircleIcon,
  customer_cancelled_free:XCircleIcon,
  vendor_cancelled:       XCircleIcon,
  vendor_self_cancelled:  XCircleIcon,
  vendor_declines:        XCircleIcon,
};

function typeIcon(type: string, theme: VarsTheme): React.ReactElement {
  const Icon = TYPE_ICON[type] ?? BellIcon;
  return <Icon size={20} color={theme.color.inkMuted} />;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

// Navigate to the right screen based on notification data
function resolveDeepLink(notif: AppNotification): string | null {
  if (notif.data?.screen) return notif.data.screen;
  if (notif.booking_id)   return `/live/${notif.booking_id}`;
  return null;
}

// ── Notification row ─────────────────────────────────────────
function NotifRow({
  notif, onPress, theme, s,
}: {
  notif: AppNotification;
  onPress: (n: AppNotification) => void;
  theme: VarsTheme;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity
      style={[s.row, !notif.is_read && s.rowUnread]}
      onPress={() => onPress(notif)}
      activeOpacity={0.75}
    >
      <View style={[s.iconWrap, !notif.is_read && s.iconWrapUnread]}>
        {typeIcon(notif.type, theme)}
      </View>
      <View style={s.content}>
        <View style={s.topRow}>
          <Text style={[s.title, !notif.is_read && s.titleUnread]} numberOfLines={1}>{notif.title}</Text>
          <Text style={s.time}>{timeAgo(notif.created_at)}</Text>
        </View>
        <Text style={s.body} numberOfLines={2}>{notif.body}</Text>
      </View>
      {!notif.is_read && <View style={s.unreadDot} />}
    </TouchableOpacity>
  );
}

const SKELETON_ROWS = 5;

function NotifRowSkeleton({ theme, s }: { theme: VarsTheme; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.row}>
      <VarsSkeleton theme={theme} width={44} height={44} radius={22} />
      <View style={s.content}>
        <VarsSkeleton theme={theme} height={14} width="50%" />
        <VarsSkeleton theme={theme} height={12} width="85%" style={{ marginTop: 8 }} />
        <VarsSkeleton theme={theme} height={12} width="60%" style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

// ── Root component ───────────────────────────────────────────
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [notifs, setNotifs]     = useState<AppNotification[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, is_read, booking_id, data, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);

    setNotifs((data ?? []) as AppNotification[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime — new notifications arrive live.
  // Channel name includes a random suffix so each mount gets a fresh channel
  // and never hits "cannot add callbacks after subscribe()" in strict-mode double-invocation.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notifs:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        setNotifs((prev) => [payload.new as AppNotification, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const markRead = async (notif: AppNotification) => {
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
      setNotifs((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
    }
    const link = resolveDeepLink(notif);
    if (link) router.push(link as any);
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  // Group by date
  const groups: { label: string; items: AppNotification[] }[] = [];
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const n of notifs) {
    const ds = new Date(n.created_at).toDateString();
    const label = ds === today ? 'Today' : ds === yesterday ? 'Yesterday'
      : new Date(n.created_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' });
    const last = groups[groups.length - 1];
    if (last?.label === label) { last.items.push(n); }
    else { groups.push({ label, items: [n] }); }
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerTitle}>Alerts</Text>
          {unreadCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="transparent" colors={['transparent']} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {refreshing && (
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
          </View>
        )}
        {loading ? (
          <View>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <NotifRowSkeleton key={i} theme={theme} s={s} />
            ))}
          </View>
        ) : notifs.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>All clear</Text>
            <Text style={s.emptyBody}>You're up to date. Booking updates, payment confirmations and more will appear here.</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.label}>
              <Text style={s.groupLabel}>{g.label}</Text>
              {g.items.map((n) => (
                <NotifRow key={n.id} notif={n} onPress={markRead} theme={theme} s={s} />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { fontSize: 24, fontWeight: '800', color: theme.color.ink },
    badge: {
      backgroundColor: theme.color.accentRed, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center',
    },
    badgeText: { fontSize: 11, fontWeight: '800', color: theme.color.inverseInk },
    markAllText: { fontSize: 14, fontWeight: '600', color: theme.color.accentBlue },

    groupLabel: {
      fontSize: 12, fontWeight: '700', color: theme.color.inkMuted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6,
    },

    row: {
      flexDirection: 'row', alignItems: 'flex-start',
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
      gap: 12,
    },
    rowUnread: { backgroundColor: theme.color.surface2 },

    iconWrap: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: theme.color.surface2,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    iconWrapUnread: { backgroundColor: theme.color.surface2 },

    content: { flex: 1 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 },
    title: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted, flex: 1, marginRight: 8 },
    titleUnread: { fontWeight: '800', color: theme.color.ink },
    time: { fontSize: 11, color: theme.color.inkMuted, marginTop: 1, flexShrink: 0 },
    body: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18 },

    unreadDot: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: theme.color.accentBlue,
      marginTop: 4, flexShrink: 0,
    },

    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.color.ink, marginBottom: 8 },
    emptyBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}
