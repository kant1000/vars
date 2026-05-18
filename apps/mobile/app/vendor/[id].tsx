// ============================================================
// VARS — Vendor Profile Screen (Phase 6)
// Route: /vendor/[id]
// Sections: hero photo, badges, bio, services, portfolio, reviews
// "Book now" → /booking/[vendorId] (Phase 7)
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions, FlatList,
  Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const PORTFOLIO_COLS = 3;
const PHOTO_SIZE = (SCREEN_W - 2) / PORTFOLIO_COLS; // 2px for gaps

// ── Types ──────────────────────────────────────────────────
interface VendorService {
  id: string;
  name: string;
  description: string | null;
  price_kobo: number;
  duration_blocks: number;   // 1 block = 30 min
  category_name: string;
}

interface PortfolioPhoto {
  id: string;
  storage_path: string;
  consent_state: 'unverified' | 'approved';
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
  bio: string | null;
  profile_photo_url: string | null;
  avg_rating: number;
  total_reviews: number;
  is_online: boolean;
  base_location_text: string | null;
  badge_vars_choice: boolean;
  badge_top_rated: boolean;
  pioneer: boolean;
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
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={{ fontSize: size, color: i <= Math.round(rating) ? Colors.star : Colors.starEmpty }}>★</Text>
      ))}
    </View>
  );
}

// ── Main component ───────────────────────────────────────────
export default function VendorProfileScreen() {
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'services' | 'portfolio' | 'reviews'>('services');
  const [togglingFav, setTogglingFav] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    // Parallel fetches
    const [vendorRes, servicesRes, portfolioRes, reviewsRes, favRes] = await Promise.all([
      supabase.from('vendors')
        .select('id, full_name, bio, profile_photo_url, avg_rating, total_reviews, is_online, base_location_text, badge_vars_choice, badge_top_rated, pioneer')
        .eq('id', id)
        .single(),

      supabase.from('vendor_services')
        .select('id, price_kobo, duration_blocks, services(id, name, description, service_categories(name))')
        .eq('vendor_id', id),

      supabase.from('portfolio_photos')
        .select('id, storage_path, consent_state')
        .eq('vendor_id', id)
        .in('consent_state', ['unverified', 'approved'])
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
      name: vs.services?.name ?? '',
      description: vs.services?.description ?? null,
      price_kobo: vs.price_kobo,
      duration_blocks: vs.duration_blocks,
      category_name: vs.services?.service_categories?.name ?? '',
    }));

    const portfolio: PortfolioPhoto[] = (portfolioRes.data ?? []).map((p: any) => ({
      id: p.id,
      storage_path: p.storage_path,
      consent_state: p.consent_state,
    }));

    const reviews: Review[] = (reviewsRes.data ?? []).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: r.profiles?.full_name ?? 'Customer',
    }));

    setVendor({
      ...v,
      services,
      portfolio,
      reviews,
      is_favourited: !!favRes.data,
    });
    setLoading(false);
  }, [id, user]);

  useEffect(() => { load(); }, [load]);

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

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ScissorsLoader size="large" color="dark" />
      </View>
    );
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

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          {vendor.profile_photo_url ? (
            <Image source={{ uri: vendor.profile_photo_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.heroFallback]}>
              <Text style={styles.heroInitial}>{vendor.full_name?.[0]?.toUpperCase()}</Text>
            </View>
          )}

          {/* Back button */}
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 12 }]}
            onPress={() => returnTo ? router.replace(returnTo as any) : router.back()}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>

          {/* Favourite */}
          <TouchableOpacity
            style={[styles.favBtn, { top: insets.top + 12 }]}
            onPress={toggleFavourite}
            disabled={togglingFav}
          >
            <Text style={styles.favBtnText}>{vendor.is_favourited ? '♥' : '♡'}</Text>
          </TouchableOpacity>

          {/* Online badge */}
          {vendor.is_online && (
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlinePillText}>Available now</Text>
            </View>
          )}
        </View>

        {/* ── Name / rating (sticky) ── */}
        <View style={styles.nameCard}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{vendor.full_name}</Text>
            <View style={styles.ratingRow}>
              {vendor.total_reviews === 0 ? (
                <Text style={styles.newOnVars}>New on VARS</Text>
              ) : (
                <>
                  <Text style={styles.star}>★</Text>
                  <Text style={styles.ratingText}>{vendor.avg_rating.toFixed(1)}</Text>
                  <Text style={styles.reviewCount}>({vendor.total_reviews})</Text>
                </>
              )}
            </View>
          </View>

          {/* Badges */}
          <View style={styles.badgeRow}>
            {vendor.pioneer && <Badge label="★ Pioneer" color="#B8860B" />}
            {vendor.badge_vars_choice && <Badge label="VARS Choice" color={Colors.badgeVarsChoice} />}
            {vendor.badge_top_rated && <Badge label="Top Rated" color={Colors.badgeTopRated} />}
            <Badge label="Verified" color={Colors.badgeVerified} />
          </View>

          {vendor.bio ? <Text style={styles.bio}>{vendor.bio}</Text> : null}
        </View>

        {/* ── Section tabs ── */}
        <View style={styles.tabRow}>
          {(['services', 'portfolio', 'reviews'] as const).map((t) => (
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

        {/* ── Services ── */}
        {activeTab === 'services' && (
          <View style={styles.section}>
            {vendor.services.length === 0 ? (
              <Text style={styles.emptyText}>No services listed yet.</Text>
            ) : (
              vendor.services.map((svc) => (
                <View key={svc.id} style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceName}>{svc.name}</Text>
                    {svc.description ? (
                      <Text style={styles.serviceDesc} numberOfLines={2}>{svc.description}</Text>
                    ) : null}
                    <Text style={styles.serviceDuration}>{formatDuration(svc.duration_blocks)}</Text>
                  </View>
                  <Text style={styles.servicePrice}>{formatPrice(svc.price_kobo)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Portfolio ── */}
        {activeTab === 'portfolio' && (
          <View style={styles.portfolioGrid}>
            {vendor.portfolio.length === 0 ? (
              <Text style={[styles.emptyText, { margin: 20 }]}>No portfolio photos yet.</Text>
            ) : (
              vendor.portfolio.map((photo) => {
                const { data: { publicUrl } } = supabase.storage
                  .from('portfolio')
                  .getPublicUrl(photo.storage_path);
                return (
                  <View key={photo.id} style={{ width: PHOTO_SIZE, height: PHOTO_SIZE }}>
                    <Image source={{ uri: publicUrl }} style={{ width: '100%', height: '100%' }} />
                    {photo.consent_state === 'unverified' && (
                      <View style={styles.unverifiedBadge}>
                        <Text style={styles.unverifiedText}>Unverified</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Reviews ── */}
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

        {/* Bottom padding for sticky CTA */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Sticky Book Now CTA ── */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.88}
          onPress={() => router.push({ pathname: '/booking/[vendorId]', params: { vendorId: vendor.id } })}
        >
          <Text style={styles.ctaText}>Book {vendor.full_name.split(' ')[0]}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '1A' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  errorText: { fontSize: 16, color: Colors.text, marginBottom: 12 },
  backLink: { fontSize: 15, color: Colors.primary, fontWeight: '600' },

  // Hero
  hero: { width: SCREEN_W, height: SCREEN_W * 0.75, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  heroInitial: { fontSize: 72, fontWeight: '800', color: Colors.primary },
  backBtn: {
    position: 'absolute', left: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { color: '#FFF', fontSize: 26, lineHeight: 30, marginTop: -2 },
  favBtn: {
    position: 'absolute', right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  favBtnText: { color: '#FFF', fontSize: 20 },
  onlinePill: {
    position: 'absolute', bottom: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  onlinePillText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  // Name card (sticky)
  nameCard: { backgroundColor: Colors.background, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, flex: 1, marginRight: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  star: { color: Colors.star, fontSize: 14 },
  ratingText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  reviewCount: { fontSize: 13, color: Colors.textMuted },
  newOnVars: { fontSize: 13, fontWeight: '600', color: Colors.badgeNew },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  bio: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  // Section tabs
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sectionTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  sectionTabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  sectionTabText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  sectionTabTextActive: { color: Colors.primary },

  // Services
  section: { paddingHorizontal: 16, paddingTop: 8 },
  serviceRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  serviceInfo: { flex: 1, marginRight: 12 },
  serviceName: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  serviceDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  serviceDuration: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  servicePrice: { fontSize: 16, fontWeight: '800', color: Colors.text },

  // Portfolio
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  unverifiedBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  unverifiedText: { color: '#FFF', fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // Reviews
  reviewCard: {
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reviewerName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  reviewComment: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  reviewDate: { fontSize: 12, color: Colors.textMuted },

  emptyText: { fontSize: 14, color: Colors.textMuted, paddingVertical: 20, textAlign: 'center' },

  // CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  ctaButton: {
    height: 56, backgroundColor: Colors.primary, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});
