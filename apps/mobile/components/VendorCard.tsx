// ============================================================
// VARS — VendorCard component
// Used in discovery feed. Tapping navigates to /vendor/[id].
// ============================================================
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { StarFilledIcon } from '@/components/icons';

export interface VendorCardData {
  id: string;
  full_name: string;
  bio: string | null;
  profile_photo_url: string | null;
  distance_km: number;
  is_online: boolean;
  avg_rating: number;
  total_reviews: number;
  badge_vars_choice: boolean;
  badge_top_rated: boolean;
  badge_verified: boolean;
  badge_new: boolean;
  pioneer: boolean;
  price_from: number;       // kobo
  category_names: string[];
}

interface Props {
  vendor: VendorCardData;
  returnTo?: string;
}

export function VendorCard({ vendor, returnTo }: Props) {
  const displayPrice = `₦${Math.round(vendor.price_from / 100).toLocaleString('en-NG')}`;
  const displayDist = vendor.distance_km < 1
    ? `${Math.round(vendor.distance_km * 1000)}m`
    : `${vendor.distance_km.toFixed(1)}km`;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.88}
      onPress={() => router.push({ pathname: '/vendor/[id]', params: { id: vendor.id, returnTo } })}
    >
      {/* Avatar */}
      <View style={styles.avatarWrap}>
        {vendor.profile_photo_url ? (
          <Image source={{ uri: vendor.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {vendor.full_name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        {/* Online dot */}
        {vendor.is_online && <View style={styles.onlineDot} />}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{vendor.full_name}</Text>
          <Text style={styles.distance}>{displayDist}</Text>
        </View>

        {/* Badges */}
        <BadgeRow vendor={vendor} />

        {/* Category + rating */}
        <View style={styles.metaRow}>
          {vendor.category_names.length > 0 && (
            <Text style={styles.category} numberOfLines={1}>
              {vendor.category_names.join(' · ')}
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

function BadgeRow({ vendor }: { vendor: VendorCardData }) {
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 14,
    backgroundColor: Colors.background,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 16, marginBottom: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2, borderColor: Colors.background,
  },
  info: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 6 },
  distance: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  reviewCount: { fontWeight: '400', color: Colors.textSecondary },
  newOnVars: { fontSize: 12, fontWeight: '600', color: Colors.badgeNew },
  price: { fontSize: 13, color: Colors.textSecondary },
  priceAmount: { fontWeight: '700', color: Colors.text },
});
