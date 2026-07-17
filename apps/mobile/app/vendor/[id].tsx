// ============================================================
// VARS — Vendor Profile Screen
// Route: /vendor/[id]
// Layout: compact profile row → portfolio carousel → sticky
// tabs (Services | Reviews) — services visible by default.
// Swipe left/right on content to switch tabs.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions, FlatList, PanResponder,
  ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import ImageViewing from 'react-native-image-viewing';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VarsSkeleton } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { CheckIcon, StarFilledIcon, StarEmptyIcon } from '@/components/icons';
import { CATEGORY_L2_LABELS } from '@vars/shared';
import { sanitizeContent } from '@/lib/format';
import { StatusDot, VendorStatus } from '@/components/StatusDot';

const { width: SCREEN_W } = Dimensions.get('window');
const CAROUSEL_H = 240;
const AVATAR_SIZE = 72;

// ── Types ──────────────────────────────────────────────────
interface VendorService {
  id: string;
  service_name: string;
  description: string | null;
  price_kobo: number;
  duration_blocks: number;
  category_l1: string;
  category_l2: string;
}

interface PortfolioPhoto {
  id: string;
  storage_path: string;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
}

interface VendorProfile {
  id: string;
  full_name: string;
  kyc_legal_name: string | null;
  bio: string | null;
  profile_image_url: string | null;
  avg_rating: number;
  total_reviews: number;
  base_location_text: string | null;
  badge_vars_choice: boolean;
  badge_top_rated: boolean;
  pioneer: boolean;
  avg_response_minutes: number | null;
  is_online: boolean;
  is_busy: boolean;
  services: VendorService[];
  portfolio: PortfolioPhoto[];
  reviews: Review[];
  is_favourited: boolean;
}

// ── Helpers ─────────────────────────────────────────────────
function formatDuration(blocks: number): string {
  const mins = blocks * 30;
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}hr ${m}min` : `${h}hr`;
}

function formatPrice(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) =>
        i <= rounded
          ? <StarFilledIcon key={i} size={size} color={Colors.star} />
          : <StarEmptyIcon key={i} size={size} color={Colors.starEmpty} />
      )}
    </View>
  );
}

function formatAcceptTime(mins: number | null): string {
  if (!mins || mins >= 60) return 'Usually accepts within 1 hour';
  if (mins <= 15) return 'Typically accepts in under 15 min';
  if (mins <= 30) return 'Typically accepts in under 30 min';
  return 'Typically accepts within 1 hour';
}

function Badge({ label, color, styles }: { label: string; color: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function VendorProfileSkeleton({
  theme, insets,
}: {
  theme: VarsTheme;
  insets: EdgeInsets;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <View style={[styles.profileRow, { paddingTop: insets.top + 52 }]}>
        <VarsSkeleton theme={theme} width={AVATAR_SIZE} height={AVATAR_SIZE} radius={AVATAR_SIZE / 2} />
        <View style={styles.skeletonInfo}>
          <VarsSkeleton theme={theme} height={20} width="70%" />
          <VarsSkeleton theme={theme} height={13} width="50%" />
          <VarsSkeleton theme={theme} height={13} width="40%" />
        </View>
      </View>
      <VarsSkeleton theme={theme} width={SCREEN_W} height={CAROUSEL_H} radius={0} />
      <View style={styles.tabRow}>
        <View style={styles.sectionTab}><VarsSkeleton theme={theme} height={16} width={60} /></View>
        <View style={styles.sectionTab}><VarsSkeleton theme={theme} height={16} width={60} /></View>
      </View>
      <View style={styles.section}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.serviceCard}>
            <View style={styles.serviceCardLeft}>
              <VarsSkeleton theme={theme} height={11} width="30%" />
              <VarsSkeleton theme={theme} height={15} width="60%" style={{ marginTop: 6 }} />
              <VarsSkeleton theme={theme} height={12} width="40%" style={{ marginTop: 6 }} />
            </View>
            <VarsSkeleton theme={theme} height={16} width={50} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main component ───────────────────────────────────────────
export default function VendorProfileScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'services' | 'reviews'>('services');
  const [togglingFav, setTogglingFav] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [vendorRes, servicesRes, portfolioRes, reviewsRes, favRes] = await Promise.all([
      supabase.from('vendors')
        .select('id, full_name, kyc_legal_name, bio, profile_image_url, avg_rating, total_reviews, base_location_text, badge_vars_choice, badge_top_rated, pioneer, avg_response_minutes, is_online, is_busy')
        .eq('id', id)
        .single(),

      supabase.from('vendor_services')
        .select('id, service_name, description, price_kobo, duration_blocks, category_l1, category_l2')
        .eq('vendor_id', id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),

      supabase.from('portfolio_photos')
        .select('id, storage_path')
        .eq('vendor_id', id)
        .eq('consent_state', 'approved')
        .order('created_at', { ascending: false })
        .limit(30),

      supabase.from('reviews')
        .select('id, rating, comment, created_at, profiles(full_name)')
        .eq('vendor_id', id)
        .order('created_at', { ascending: false })
        .limit(10),

      user
        ? supabase.from('favourites')
            .select('id')
            .eq('user_id', user.id)
            .eq('vendor_id', id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (vendorRes.error || !vendorRes.data) { setLoading(false); return; }
    const v = vendorRes.data as any;

    const services: VendorService[] = (servicesRes.data ?? []).map((vs: any) => ({
      id: vs.id,
      service_name: vs.service_name ?? '',
      description: vs.description ?? null,
      price_kobo: vs.price_kobo,
      duration_blocks: vs.duration_blocks,
      category_l1: vs.category_l1,
      category_l2: vs.category_l2,
    }));

    const portfolio: PortfolioPhoto[] = (portfolioRes.data ?? []).map((p: any) => ({
      id: p.id,
      storage_path: p.storage_path,
    }));

    const reviews: Review[] = (reviewsRes.data ?? []).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: r.profiles?.full_name ?? 'Customer',
    }));

    setVendor({ ...v, avg_response_minutes: v.avg_response_minutes ?? null, services, portfolio, reviews, is_favourited: !!favRes.data });
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId); else next.add(serviceId);
      return next;
    });
  };

  const toggleFavourite = async () => {
    if (!user || !vendor || togglingFav) return;
    setTogglingFav(true);
    if (vendor.is_favourited) {
      await supabase.from('favourites').delete().eq('user_id', user.id).eq('vendor_id', vendor.id);
    } else {
      await supabase.from('favourites').insert({ user_id: user.id, vendor_id: vendor.id });
    }
    setVendor((prev) => prev ? { ...prev, is_favourited: !prev.is_favourited } : prev);
    setTogglingFav(false);
  };

  // Horizontal swipe on content area switches tabs
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 25,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60) setActiveTab('reviews');
        if (gs.dx > 60) setActiveTab('services');
      },
    })
  ).current;

  if (loading) {
    return <VendorProfileSkeleton theme={theme} insets={insets} />;
  }

  if (!vendor) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>Vendor not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const carouselUris: string[] = vendor.portfolio.map((p) => {
    const { data } = supabase.storage.from('portfolio').getPublicUrl(p.storage_path);
    return data.publicUrl;
  });

  const selectedServices = vendor.services.filter((s) => selectedServiceIds.has(s.id));
  const totalKobo = selectedServices.reduce((sum, s) => sum + s.price_kobo, 0);

  return (
    <View style={styles.container}>

      {/* Floating nav buttons — always visible above scroll */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => returnTo ? router.replace(returnTo as any) : router.back()}
      >
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.favBtn, { top: insets.top + 8 }]}
        onPress={toggleFavourite}
        disabled={togglingFav}
      >
        <Text style={styles.favBtnText}>{vendor.is_favourited ? '♥' : '♡'}</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]}>

        {/* ── [0] Profile row ── */}
        <View style={[styles.profileRow, { paddingTop: insets.top + 52 }]}>
          <View style={styles.avatarWrap}>
            {vendor.profile_image_url ? (
              <Image
                source={{ uri: vendor.profile_image_url }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{vendor.full_name?.[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.statusDotWrap}>
              <StatusDot
                status={(vendor.is_busy ? 'busy' : vendor.is_online ? 'online' : 'offline') as VendorStatus}
                size={16}
              />
            </View>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name} numberOfLines={1}>{vendor.full_name}</Text>
            {vendor.kyc_legal_name ? (
              <View style={styles.legalNameRow}>
                <CheckIcon size={10} color={theme.color.inkMuted} />
                <Text style={styles.legalNameText}>{vendor.kyc_legal_name} · Verified by VARS</Text>
              </View>
            ) : null}
            <View style={styles.ratingRow}>
              {vendor.total_reviews === 0 ? (
                <Text style={styles.newOnVars}>New on VARS</Text>
              ) : (
                <>
                  <Text style={styles.starText}>★</Text>
                  <Text style={styles.ratingText}>{vendor.avg_rating.toFixed(1)}</Text>
                  <Text style={styles.reviewCount}>({vendor.total_reviews})</Text>
                </>
              )}
            </View>
            <View style={styles.badgeRow}>
              {vendor.pioneer && <Badge label="★ Pioneer" color={Colors.badgePioneer} styles={styles} />}
              {vendor.badge_vars_choice && <Badge label="VARS Choice" color={Colors.badgeVarsChoice} styles={styles} />}
              {vendor.badge_top_rated && <Badge label="Top Rated" color={Colors.badgeTopRated} styles={styles} />}
              <Badge label="Verified" color={Colors.badgeVerified} styles={styles} />
            </View>
            {vendor.bio ? <Text style={styles.bio} numberOfLines={3}>{sanitizeContent(vendor.bio, 150)}</Text> : null}
            <Text style={styles.responseTime}>{formatAcceptTime(vendor.avg_response_minutes)}</Text>
          </View>
        </View>

        {/* ── [1] Portfolio carousel ── */}
        <View style={carouselUris.length === 0 ? styles.carouselEmpty : undefined}>
          {carouselUris.length > 0 && (
            <>
              <FlatList
                data={carouselUris}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                  setCarouselIndex(idx);
                }}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    activeOpacity={0.95}
                    onPress={() => { setLightboxIndex(index); setLightboxVisible(true); }}
                  >
                    <Image
                      source={{ uri: item }}
                      style={{ width: SCREEN_W, height: CAROUSEL_H }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </TouchableOpacity>
                )}
              />
              {carouselUris.length > 1 && (
                <View style={styles.dotsRow}>
                  {carouselUris.map((_, i) => (
                    <View key={i} style={[styles.dot, i === carouselIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* ── [2] Tab row (sticky) ── */}
        <View style={styles.tabRow}>
          {(['services', 'reviews'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.sectionTab, activeTab === t && styles.sectionTabActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[styles.sectionTabText, activeTab === t && styles.sectionTabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── [3] Content (swipe left/right to switch tabs) ── */}
        <View {...panResponder.panHandlers}>

          {activeTab === 'services' && (
            <View style={styles.section}>
              {vendor.services.length === 0 ? (
                <Text style={styles.emptyText}>No services listed yet.</Text>
              ) : (
                vendor.services.map((svc) => {
                  const selected = selectedServiceIds.has(svc.id);
                  const l2Label = CATEGORY_L2_LABELS[svc.category_l2] ?? svc.category_l2;
                  return (
                    <TouchableOpacity
                      key={svc.id}
                      style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                      onPress={() => toggleService(svc.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.serviceCardLeft}>
                        <Text style={styles.serviceL2}>{l2Label}</Text>
                        <Text style={styles.serviceName}>{sanitizeContent(svc.service_name, 20)}</Text>
                        {svc.description ? (
                          <Text style={styles.serviceDesc} numberOfLines={2}>{sanitizeContent(svc.description, 60)}</Text>
                        ) : null}
                        <Text style={styles.serviceDuration}>{formatDuration(svc.duration_blocks)}</Text>
                      </View>
                      <View style={styles.serviceCardRight}>
                        <Text style={styles.servicePrice}>{formatPrice(svc.price_kobo)}</Text>
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                          {selected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {activeTab === 'reviews' && (
            <View style={styles.section}>
              {vendor.reviews.length === 0 ? (
                <Text style={styles.emptyText}>No reviews yet.</Text>
              ) : (
                vendor.reviews.map((rev) => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewerName}>{rev.reviewer_name}</Text>
                      <StarRow rating={rev.rating} />
                    </View>
                    {rev.comment ? <Text style={styles.reviewComment}>{rev.comment}</Text> : null}
                    <Text style={styles.reviewDate}>
                      {new Date(rev.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Sticky CTA ── */}
      {selectedServiceIds.size > 0 && (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.88}
            onPress={() =>
              router.push({
                pathname: '/booking/[vendorId]',
                params: {
                  vendorId: vendor.id,
                  service_ids: JSON.stringify([...selectedServiceIds]),
                  total_amount: String(totalKobo),
                },
              })
            }
          >
            <Text style={styles.ctaText}>Book for {formatPrice(totalKobo)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Lightbox ── */}
      <ImageViewing
        images={carouselUris.map((uri) => ({ uri }))}
        imageIndex={lightboxIndex}
        visible={lightboxVisible}
        onRequestClose={() => setLightboxVisible(false)}
      />
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
    errorText: { fontSize: 16, color: theme.color.ink, marginBottom: 12 },
    backLink: { fontSize: 15, color: theme.color.accentBlue, fontWeight: '600' },

    // Floating nav buttons — sit on top of the portfolio photo, stay fixed-contrast.
    backBtn: {
      position: 'absolute', left: 16, zIndex: 10,
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center', justifyContent: 'center',
    },
    backBtnText: { color: '#FFF', fontSize: 26, lineHeight: 30, marginTop: -2 },
    favBtn: {
      position: 'absolute', right: 16, zIndex: 10,
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center', justifyContent: 'center',
    },
    favBtnText: { color: '#FFF', fontSize: 20 },

    // Profile row
    profileRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 16,
      paddingBottom: 16,
      gap: 14,
      backgroundColor: theme.color.bg,
    },
    avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE },
    avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
    statusDotWrap: { position: 'absolute', bottom: 0, right: 0 },
    avatarFallback: { backgroundColor: theme.color.ink, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 28, fontWeight: '800', color: theme.color.inverseInk },
    profileInfo: { flex: 1, paddingTop: 2 },
    skeletonInfo: { flex: 1, paddingTop: 2, gap: 8 },
    name: { fontSize: 20, fontWeight: '800', color: theme.color.ink, marginBottom: 2 },
    legalNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    legalNameText: { fontSize: 12, color: theme.color.inkMuted },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
    starText: { color: Colors.star, fontSize: 13 },
    ratingText: { fontSize: 13, fontWeight: '700', color: theme.color.ink },
    reviewCount: { fontSize: 12, color: theme.color.inkMuted },
    newOnVars: { fontSize: 12, fontWeight: '600', color: Colors.badgeNew },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
    badge: { borderRadius: BORDER_RADIUS, paddingHorizontal: 7, paddingVertical: 3 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    bio: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 19 },
    responseTime: { fontSize: 12, color: theme.color.inkMuted, marginTop: 4 },

    // Carousel
    carouselEmpty: { height: 0 },
    dotsRow: {
      flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
      gap: 6, paddingVertical: 10, backgroundColor: theme.color.bg,
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.inkFaint },
    dotActive: { width: 18, backgroundColor: theme.color.ink },

    // Tabs
    tabRow: {
      flexDirection: 'row', backgroundColor: theme.color.bg,
      borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint,
    },
    sectionTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    sectionTabActive: { borderBottomWidth: 2, borderBottomColor: theme.color.ink },
    sectionTabText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    sectionTabTextActive: { color: theme.color.ink },

    section: { paddingHorizontal: 16, paddingTop: 8 },

    // Service card
    serviceCard: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingVertical: 14, paddingHorizontal: 12,
      borderWidth: 1, borderColor: theme.color.inkFaint, borderRadius: 5,
      marginBottom: 8, backgroundColor: theme.color.bg,
    },
    serviceCardSelected: {
      borderColor: theme.color.ink,
      backgroundColor: theme.color.ink + '08',
    },
    serviceCardLeft: { flex: 1, marginRight: 12 },
    serviceCardRight: { alignItems: 'flex-end', gap: 8 },
    serviceL2: { fontSize: 11, color: theme.color.inkMuted, fontWeight: '500', marginBottom: 2 },
    serviceName: { fontSize: 15, fontWeight: '700', color: theme.color.ink, marginBottom: 2 },
    serviceDesc: { fontSize: 13, color: theme.color.inkMuted, lineHeight: 18, marginBottom: 4 },
    serviceDuration: { fontSize: 12, color: theme.color.inkMuted, fontWeight: '500' },
    servicePrice: { fontSize: 16, fontWeight: '800', color: theme.color.ink },
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.color.bg,
    },
    checkboxSelected: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    checkmark: { color: theme.color.inverseInk, fontSize: 13, fontWeight: '800' },

    // Reviews
    reviewCard: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.inkFaint },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    reviewerName: { fontSize: 14, fontWeight: '700', color: theme.color.ink },
    reviewComment: { fontSize: 14, color: theme.color.inkMuted, lineHeight: 20, marginBottom: 4 },
    reviewDate: { fontSize: 12, color: theme.color.inkMuted },

    emptyText: { fontSize: 14, color: theme.color.inkMuted, paddingVertical: 20, textAlign: 'center' },

    // CTA
    ctaWrap: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: theme.color.bg,
      borderTopWidth: 1, borderTopColor: theme.color.inkFaint,
      paddingHorizontal: 20, paddingTop: 12,
    },
    ctaButton: {
      height: 56, backgroundColor: theme.color.ink, borderRadius: BORDER_RADIUS,
      alignItems: 'center', justifyContent: 'center',
    },
    ctaText: { color: theme.color.inverseInk, fontSize: 17, fontWeight: '800' },
  });
}
