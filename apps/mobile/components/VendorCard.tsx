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
import { Colors, BORDER_RADIUS, BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { StarFilledIcon } from '@/components/icons';
import { usePostHog, EVENTS } from '@/lib/analytics';
import { StatusDot, VendorStatus } from '@/components/StatusDot';
import { CATEGORY_L2_LABELS } from '@vars/shared';

const AVATAR_SIZE = 60;

export interface VendorCardData {
  id: string;
  full_name: string;
  bio: string | null;
  profile_image_url: string | null;
  kyc_verified_at: string | null;
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
  price_from: number;       // kobo — cheapest service across every category (fallback only)
  category_names: string[];
  cheapest_by_category: { category_l1: string; category_l2: string; price_kobo: number; service_count: number }[];
}

interface Props {
  vendor: VendorCardData;
  /** Which category tab this card is rendered under — drives the "{L2} from {price}" label. */
  activeCategory: string;
  returnTo?: string;
  /** Discover feed is location-sorted, so distance is always meaningful there.
   * Screens with no location context (e.g. favorites) should hide it. */
  showDistance?: boolean;
}

// e.g. 18,000,000 kobo -> "180k". Never meant to show exact naira, just a
// quick relative sense of price — see priceAmount below for the reasoning.
function formatPriceK(priceKobo: number): string {
  const naira = priceKobo / 100;
  const k = naira / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export function VendorCard({ vendor, activeCategory, returnTo, showDistance = true }: Props) {
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const posthog = usePostHog();

  // Section-aware price label: the cheapest subcategory+price *within the
  // category tab this card is shown under* (e.g. "Weaves from 180k" under
  // Hair, "Manicure from 100k" under Nails for the same vendor) — not one
  // generic price that's the same regardless of which section you're
  // browsing. Every vendor shown under a tab has at least one active
  // service in that L1 by construction (that's why the card is there), so
  // this should always find a match; price_from is a defensive fallback
  // only, never expected to actually render.
  // A trailing "+" signals more than one service relevant to this section
  // (not just more than one subcategory) — e.g. two different Weaves
  // services still gets "Weaves+".
  const cheapest = vendor.cheapest_by_category.find((c) => c.category_l1 === activeCategory);
  const l2Label = cheapest ? (CATEGORY_L2_LABELS[cheapest.category_l2] ?? cheapest.category_l2) : null;
  const hasMore = !!cheapest && cheapest.service_count > 1;
  const displayPrice = formatPriceK(cheapest?.price_kobo ?? vendor.price_from);

  // Always km — no meters, so distance reads consistently across the app (e.g. 0.5km, not 500m).
  // Screens with no location context (favorites) pass showDistance=false and
  // get_favourite_vendors doesn't return distance_km at all, so this must
  // not touch vendor.distance_km unless it's actually going to be shown.
  const displayDist = showDistance
    ? (vendor.distance_km < 0.05 ? '<0.1km away' : `${vendor.distance_km.toFixed(1)}km away`)
    : null;

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
          <Image
            // expo-image caches by URL — cache-bust with kyc_verified_at
            // (only changes when the photo actually could), same as the
            // vendor detail page, so a re-verified vendor's fresh photo
            // isn't hidden behind a stale cached copy of the same storage path.
            source={{
              uri: vendor.kyc_verified_at
                ? `${vendor.profile_image_url}?v=${encodeURIComponent(vendor.kyc_verified_at)}`
                : vendor.profile_image_url,
            }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {vendor.full_name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        {vendor.pioneer && (
          <View style={styles.pioneerDotWrap}>
            <StarFilledIcon size={16} color={Colors.badgePioneer} strokeColor={theme.color.ink} />
          </View>
        )}
        <View style={styles.statusDotWrap}>
          <StatusDot
            status={(vendor.is_busy ? 'busy' : vendor.is_online ? 'online' : 'offline') as VendorStatus}
            size={14}
            bordered={false}
          />
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{vendor.full_name}</Text>
          {showDistance && <Text style={styles.distance}>{displayDist}</Text>}
        </View>

        {/* Price + rating */}
        <View style={styles.metaRow}>
          <View style={styles.priceRow}>
            <Text style={styles.price} numberOfLines={1}>{l2Label ?? 'From'}</Text>
            {hasMore && <Text style={styles.priceSuperscript}>+</Text>}
            <Text style={styles.price} numberOfLines={1}>{l2Label ? ' from ' : ' '}</Text>
            <Text style={styles.priceAmount}>{displayPrice}</Text>
          </View>
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
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row', gap: 12, alignItems: 'center',
      backgroundColor: theme.color.bg,
      borderRadius: BORDER_RADIUS, padding: 12,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
      marginHorizontal: 16, marginBottom: 10,
    },
    avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
    statusDotWrap: { position: 'absolute', bottom: 1, right: 1 },
    pioneerDotWrap: { position: 'absolute', top: 1, right: 1 },
    avatarFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 22, fontWeight: '700', color: Colors.primary },
    info: { flex: 1, gap: 6 },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    name: { fontSize: 16, fontWeight: '700', color: theme.color.ink, flex: 1, marginRight: 6 },
    distance: { fontSize: 12, color: theme.color.inkMuted, marginTop: 2 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    ratingText: { fontSize: 12, fontWeight: '600', color: theme.color.ink, includeFontPadding: false },
    reviewCount: { fontWeight: '400', color: theme.color.inkMuted },
    newOnVars: { fontSize: 12, fontWeight: '600', color: Colors.badgeNew },
    priceRow: { flexDirection: 'row', alignItems: 'flex-start', flexShrink: 1 },
    price: { fontSize: 13, color: theme.color.inkMuted },
    // A real flex sibling (not a nested Text span) — nested inline Text
    // ignores transform/position in RN's text-layout engine, which is why
    // an earlier version of this (top: -4 on a nested span) never visibly
    // rose above the baseline.
    priceSuperscript: {
      fontSize: 9, fontWeight: '700', color: theme.color.inkMuted,
      transform: [{ translateY: -4 }],
    },
    priceAmount: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
  });
}
