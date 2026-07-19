// ============================================================
// VARS — VendorCard component
// Used in discovery feed. Tapping navigates to /vendor/[id].
// ============================================================
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { StarFilledIcon } from '@/components/icons';
import { usePostHog, EVENTS } from '@/lib/analytics';
import { CATEGORY_L1_LABELS } from '@vars/shared';
import { StatusDot, VendorStatus } from '@/components/StatusDot';

export interface VendorCardData {
  id: string;
  full_name: string;
  bio: string | null;
  profile_image_url: string | null;
  distance_km: number;
  is_online: boolean;
  is_busy: boolean;
  avg_rating: number;
  total_reviews: number;
  badge_vars_choice: boolean;
  badge_top_rated: boolean;
  badge_verified: boolean;
  badge_new: boolean;
  pioneer: boolean;
  price_from: number;       // kobo
  category_names: string[];
  services: { category_l2: string; service_name: string; description: string | null }[];
}

interface Props {
  vendor: VendorCardData;
  returnTo?: string;
}

export function VendorCard({ vendor, returnTo }: Props) {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const posthog = usePostHog();
  const displayPrice = `₦${Math.round(vendor.price_from / 100).toLocaleString('en-NG')}`;
  const displayDist = vendor.distance_km < 1
    ? `${Math.round(vendor.distance_km * 1000)}m`
    : `${vendor.distance_km.toFixed(1)}km`;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => {
        posthog?.capture(EVENTS.VENDOR_VIEWED, {
          vendor_id: vendor.id,
          categories: vendor.category_names,
        });
        router.push({ pathname: '/vendor/[id]', params: { id: vendor.id, returnTo } });
      }}
    >
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {vendor.profile_image_url ? (
          <Image source={{ uri: vendor.profile_image_url }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {vendor.full_name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={styles.statusDotWrap}>
          <StatusDot
            status={(vendor.is_busy ? 'busy' : vendor.is_online ? 'online' : 'offline') as VendorStatus}
            size={14}
          />
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{vendor.full_name}</Text>
          <Text style={styles.distance}>{displayDist}</Text>
        </View>

        {/* Badges */}
        <BadgeRow vendor={vendor} styles={styles} />

        {/* Category + rating */}
        <View style={styles.metaRow}>
          {vendor.category_names.length > 0 && (
            <Text style={styles.category} numberOfLines={1}>
              {vendor.category_names.map((n) => CATEGORY_L1_LABELS[n] ?? n).join(' · ')}
            </Text>
          )}
          <View style={styles.ratingRow}>
            {vendor.total_reviews === 0 ? (
              <Text style={styles.newOnVars}>New on VARS</Text>
            ) : (
              <>
                <StarFilledIcon size={13} color={Colors.star} />
                <Text style={styles.ratingText}>
                  {vendor.avg_rating.toFixed(1)}
                  <Text style={styles.reviewCount}> ({vendor.total_reviews})</Text>
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Price from */}
        <Text style={styles.price}>From <Text style={styles.priceAmount}>{displayPrice}</Text></Text>
      </View>
    </TouchableOpacity>
  );
}

function BadgeRow({ vendor, styles }: { vendor: VendorCardData; styles: ReturnType<typeof makeStyles> }) {
  const badges: { label: string; color: string }[] = [];
  if (vendor.pioneer) badges.push({ label: '★ Pioneer', color: Colors.badgePioneer });
  if (vendor.badge_vars_choice) badges.push({ label: 'VARS Choice', color: Colors.badgeVarsChoice });
  if (vendor.badge_top_rated) badges.push({ label: 'Top Rated', color: Colors.badgeTopRated });
  if (vendor.badge_verified) badges.push({ label: 'Verified', color: Colors.badgeVerified });
  if (vendor.badge_new) badges.push({ label: 'New', color: Colors.badgeNew });
  if (badges.length === 0) return null;

  return (
    <View style={styles.badgeRow}>
      {badges.map((b) => (
        <View key={b.label} style={[styles.badge, { backgroundColor: b.color + '1A' }]}>
          <Text style={[styles.badgeText, { color: b.color }]}>{b.label}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row', gap: 14,
      backgroundColor: theme.color.bg,
      borderRadius: BORDER_RADIUS, padding: 14,
      borderWidth: 1, borderColor: theme.color.inkFaint,
      marginHorizontal: 16, marginBottom: 12,
    },
    avatarWrap: { width: 68, height: 68 },
    avatar: { width: 68, height: 68, borderRadius: 34 },
    statusDotWrap: { position: 'absolute', bottom: 0, right: 0 },
    avatarFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 24, fontWeight: '700', color: Colors.primary },
    info: { flex: 1, gap: 4 },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    name: { fontSize: 16, fontWeight: '700', color: theme.color.ink, flex: 1, marginRight: 6 },
    distance: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    badge: { borderRadius: BORDER_RADIUS, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    category: { fontSize: 12, color: theme.color.inkMuted, flex: 1 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    ratingText: { fontSize: 12, fontWeight: '600', color: theme.color.ink },
    reviewCount: { fontWeight: '400', color: theme.color.inkMuted },
    newOnVars: { fontSize: 12, fontWeight: '600', color: Colors.badgeNew },
    price: { fontSize: 13, color: theme.color.inkMuted },
    priceAmount: { fontWeight: '700', color: theme.color.ink },
  });
}
