// ============================================================
// VARS — Home / Discover screen (Phase 5)
// Location-based vendor feed with category tabs.
// Tabs: All | Barbing | Hair | Makeovers
// Calls get_nearby_vendors RPC (PostGIS) via supabase.rpc().
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VendorCard, VendorCardData } from '@/components/VendorCard';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { Colors } from '@/constants/colors';

// ── Category tabs (taxonomy V2 L1) ─────────────────────────
const CATEGORIES: { label: string; slug: string }[] = [
  { label: 'Hair',   slug: 'hair' },
  { label: 'Barber', slug: 'barber' },
  { label: 'Face',   slug: 'face' },
  { label: 'Nails',  slug: 'nails' },
];

const RADIUS_KM = 5;
const PAGE_SIZE = 20;

// ── Hook: device location ──────────────────────────────────
// Permission is requested during onboarding (Get Started CTA).
// Home screen defaults to Lagos immediately so vendors load without delay,
// then updates with real GPS if permission was granted.
function useLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 6.4531, lng: 3.3958 });
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        // keep default Lagos coords
      }
    })();
  }, []);

  return { coords, permissionDenied };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { coords, permissionDenied } = useLocation();

  const [activeCategory, setActiveCategory] = useState<string>('hair');
  const [search, setSearch] = useState('');
  const [vendors, setVendors] = useState<VendorCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  const fetchVendors = useCallback(async (
    cat: string | null,
    query: string,
    offset: number,
    append: boolean,
  ) => {
    if (!coords) return;
    if (offset === 0) setLoading(true);

    const { data, error } = await supabase.rpc('get_nearby_vendors', {
      lat: coords.lat,
      lng: coords.lng,
      radius_km: RADIUS_KM,
      lim: PAGE_SIZE,
      ofst: offset,
    });

    setLoading(false);
    setRefreshing(false);

    if (error) {
      console.error('get_nearby_vendors:', error.message);
      return;
    }

    const results = (data as VendorCardData[]) ?? [];

    // Client-side L1 category filter — server returns all nearby vendors
    const categoryFiltered = results.filter((v) => v.category_names.includes(cat));

    // Client-side name search filter
    const filtered = query.trim()
      ? categoryFiltered.filter((v) => v.full_name.toLowerCase().includes(query.toLowerCase()))
      : categoryFiltered;

    if (append) {
      setVendors((prev) => [...prev, ...filtered]);
    } else {
      setVendors(filtered);
    }

    setHasMore(results.length === PAGE_SIZE);
    offsetRef.current = offset + results.length;
  }, [coords]);

  // Re-fetch when location or category changes (search is handled via debounce only)
  useEffect(() => {
    if (!coords) return;
    offsetRef.current = 0;
    setHasMore(true);
    fetchVendors(activeCategory, search, 0, false);
  }, [coords, activeCategory, fetchVendors]);

  const onRefresh = () => {
    setRefreshing(true);
    offsetRef.current = 0;
    fetchVendors(activeCategory, search, 0, false);
  };

  const renderItem = useCallback(
    ({ item }: { item: VendorCardData }) => <VendorCard vendor={item} />,
    [],
  );

  const onEndReached = () => {
    if (hasMore && !loading) {
      fetchVendors(activeCategory, search, offsetRef.current, true);
    }
  };

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      offsetRef.current = 0;
      fetchVendors(activeCategory, text, 0, false);
    }, 350);
  };

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
        <TextInput
          style={styles.searchInput}
          placeholder="Search vendors..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={onSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
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
        <View style={styles.locBanner}>
          <Text style={styles.locBannerText}>Showing vendors in Lagos — location access was denied.</Text>
        </View>
      )}

      {/* ── Vendor list ── */}
      {loading && vendors.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ScissorsLoader size="medium" color="dark" />
        </View>
      ) : (
        <FlatList
          data={vendors}
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
                <ScissorsLoader size="small" color="dark" />
              </View>
            ) : null
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No vendors nearby</Text>
                <Text style={styles.emptyBody}>
                  We're growing fast. Check back soon or try a wider search.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            hasMore && vendors.length > 0 ? (
              <View style={styles.centered}><ScissorsLoader size="small" color="dark" /></View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: Colors.text },
  subGreeting: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: {
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: {
    paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center',
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: '#FFF' },
  locBanner: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.warning + '20',
    borderRadius: 10, padding: 10,
  },
  locBannerText: { fontSize: 12, color: Colors.warning, fontWeight: '500' },
  list: { paddingTop: 4, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
