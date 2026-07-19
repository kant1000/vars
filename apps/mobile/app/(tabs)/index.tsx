// ============================================================
// VARS — Home / Discover screen
// Single 30 km RPC fetch on mount; in-memory progressive slice.
// Category and name filtering are both in-memory — no round-trip
// on category switch or search.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState, FlatList, Linking, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VendorCard, VendorCardData } from '@/components/VendorCard';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VarsSkeleton } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { Colors, BORDER_RADIUS } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { CATEGORY_L2_LABELS } from '@vars/shared';

const SKELETON_ROWS = 6;

function VendorCardSkeleton({ theme, styles }: { theme: VarsTheme; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.skeletonCard}>
      <VarsSkeleton theme={theme} width={68} height={68} radius={34} />
      <View style={styles.skeletonInfo}>
        <VarsSkeleton theme={theme} height={16} width="55%" />
        <VarsSkeleton theme={theme} height={12} width="40%" />
        <VarsSkeleton theme={theme} height={12} width="30%" />
      </View>
    </View>
  );
}

// ── Category tabs (taxonomy V2 L1) ─────────────────────────
const CATEGORIES: { label: string; slug: string }[] = [
  { label: 'Hair',   slug: 'hair' },
  { label: 'Barber', slug: 'barber' },
  { label: 'Face',   slug: 'face' },
  { label: 'Nails',  slug: 'nails' },
];

const RADIUS_KM       = 30;   // hard cap — never query beyond this
const MAX_VENDORS     = 100;  // upper bound for the single fetch; revisit when online vendors exceed this
const INITIAL_SLICE   = 20;
const SLICE_INCREMENT = 10;
const MIN_SEARCH_CHARS = 3;   // below this, search does nothing and the category filter alone applies

// ── Hook: device location ──────────────────────────────────
// Permission is requested during onboarding (Get Started CTA).
// Home screen defaults to Lagos immediately so vendors load without delay,
// then updates with real GPS if permission was granted.
function useLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 6.4531, lng: 3.3958 });
  const [permissionDenied, setPermissionDenied] = useState(false);

  const checkLocation = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch {
      // keep default Lagos coords
    }
  }, []);

  useEffect(() => { checkLocation(); }, [checkLocation]);

  // Re-check when app returns to foreground (catches a permission grant made in Settings)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkLocation();
    });
    return () => sub.remove();
  }, [checkLocation]);

  return { coords, permissionDenied };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { coords, permissionDenied } = useLocation();

  const [activeCategory, setActiveCategory] = useState<string>('hair');
  const [search, setSearch] = useState('');
  const [allVendors, setAllVendors] = useState<VendorCardData[]>([]);
  const [sliceCursor, setSliceCursor] = useState(INITIAL_SLICE);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  // ── In-memory filtering: category + service search ────────
  // Both filters run on the already-fetched 30 km pool, so category
  // switches and searches are instant with no additional RPC call.
  // Search matches what a vendor offers, not who they are: subcategory
  // (e.g. "Braids"), then service name, then description, in that
  // priority order. A vendor's own name never factors into a match.
  const filteredVendors = useMemo(() => {
    const list = allVendors.filter((v) => v.category_names.includes(activeCategory));
    const q = search.trim().toLowerCase();
    if (q.length < MIN_SEARCH_CHARS) return list;

    const scored = list
      .map((v) => {
        let bestScore = Infinity;
        for (const svc of v.services) {
          const subcategory = (CATEGORY_L2_LABELS[svc.category_l2] ?? svc.category_l2).toLowerCase();
          const serviceName = svc.service_name.toLowerCase();
          const description = (svc.description ?? '').toLowerCase();
          if (subcategory.includes(q)) bestScore = Math.min(bestScore, 0);
          else if (serviceName.includes(q)) bestScore = Math.min(bestScore, 1);
          else if (description.includes(q)) bestScore = Math.min(bestScore, 2);
        }
        return { vendor: v, score: bestScore };
      })
      .filter((entry) => entry.score !== Infinity);

    scored.sort((a, b) => a.score - b.score);
    return scored.map((entry) => entry.vendor);
  }, [allVendors, activeCategory, search]);

  const renderedVendors = filteredVendors.slice(0, sliceCursor);
  const hasMore = sliceCursor < filteredVendors.length;

  // Reset slice cursor whenever the visible filter set changes
  useEffect(() => {
    setSliceCursor(INITIAL_SLICE);
  }, [activeCategory, search]);

  // ── Single 30 km fetch with 3-attempt retry ───────────────
  // fetchWithRetry wraps raw HTTP — it can't wrap supabase.rpc(), so
  // the retry loop is inlined here with the same 3-attempt / exponential
  // backoff behaviour.
  const fetchAll = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setIsLoadingInitial(true);

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((r) => setTimeout(r, 1_000 * 2 ** (attempt - 1)));
      }
      const { data, error } = await supabase.rpc('get_nearby_vendors', {
        lat: coords.lat,
        lng: coords.lng,
        radius_km: RADIUS_KM,
        lim: MAX_VENDORS,
        ofst: 0,
      });
      if (!error) {
        setAllVendors((data as VendorCardData[]) ?? []);
        setSliceCursor(INITIAL_SLICE);
        setIsLoadingInitial(false);
        setRefreshing(false);
        return;
      }
      lastErr = error;
    }

    console.error('get_nearby_vendors:', lastErr);
    setIsLoadingInitial(false);
    setRefreshing(false);
  }, [coords]);

  // Re-fetch when location changes (GPS resolves after default Lagos coords)
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll(true);
  };

  const onEndReached = () => {
    if (hasMore) setSliceCursor((c) => c + SLICE_INCREMENT);
  };

  const renderItem = useCallback(
    ({ item }: { item: VendorCardData }) => <VendorCard vendor={item} />,
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {firstName} 👋</Text>
          <Text style={styles.subGreeting}>Who's coming to you today?</Text>
        </View>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchInputWrap}>
          <SearchIcon size={22} color={theme.color.inkMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* ── Category tabs ── */}
      <View style={styles.tabs}>
        {CATEGORIES.map((cat) => {
          const active = activeCategory === cat.slug;
          return (
            <TouchableOpacity
              key={cat.slug}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveCategory(cat.slug)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Location permission banner ── */}
      {permissionDenied && (
        <TouchableOpacity style={styles.locBanner} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
          <Text style={styles.locBannerText}>Showing stylists in Lagos. Tap to enable location access.</Text>
        </TouchableOpacity>
      )}

      {/* ── Vendor list ── */}
      {isLoadingInitial ? (
        <View style={styles.list}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <VendorCardSkeleton key={i} theme={theme} styles={styles} />
          ))}
        </View>
      ) : (
        <FlatList
          data={renderedVendors}
          keyExtractor={(v) => v.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="transparent"
              colors={['transparent']}
            />
          }
          ListHeaderComponent={
            refreshing ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
              </View>
            ) : null
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No stylists nearby</Text>
              <Text style={styles.emptyBody}>
                We're growing fast. Check back soon or try a wider search.
              </Text>
            </View>
          }
          ListFooterComponent={
            hasMore && renderedVendors.length > 0 ? (
              <View style={styles.centered}><ScissorsLoader size="small" color={theme.appearance === 'dark' ? 'light' : 'dark'} /></View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    header: {
      paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    },
    greeting: { fontSize: 22, fontWeight: '800', color: theme.color.ink },
    subGreeting: { fontSize: 14, color: theme.color.inkMuted, marginTop: 2 },
    searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
    searchInputWrap: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.color.surface2, borderRadius: BORDER_RADIUS,
      paddingHorizontal: 16,
      borderWidth: 1.5, borderColor: theme.color.inkFaint,
    },
    searchInput: {
      flex: 1, paddingVertical: 11,
      fontSize: 15, color: theme.color.ink,
    },
    tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    tab: {
      flex: 1, paddingVertical: 8, alignItems: 'center',
      borderRadius: 5, borderWidth: 1.5, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
    },
    tabActive: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    tabText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    tabTextActive: { color: theme.color.inverseInk },
    locBanner: {
      marginHorizontal: 16, marginBottom: 8,
      backgroundColor: Colors.warning + '15',
      borderRadius: 5, padding: 10,
    },
    skeletonCard: {
      flexDirection: 'row', gap: 14,
      backgroundColor: theme.color.bg,
      borderRadius: 5, padding: 14,
      borderWidth: 1, borderColor: theme.color.inkFaint,
      marginHorizontal: 16, marginBottom: 12,
    },
    skeletonInfo: { flex: 1, justifyContent: 'center', gap: 8 },
    locBannerText: { fontSize: 12, color: Colors.warning, fontWeight: '500' },
    list: { paddingTop: 4, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.color.ink, marginBottom: 8 },
    emptyBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}
