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
  ScrollView, TextInput,
} from 'react-native';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VendorCard, VendorCardData } from '@/components/VendorCard';
import { Colors } from '@/constants/colors';

// ── Category tabs ──────────────────────────────────────────
const CATEGORIES: { label: string; slug: string | null }[] = [
  { label: 'All', slug: null },
  { label: 'Barbing', slug: 'barbing' },
  { label: 'Hair', slug: 'hair' },
  { label: 'Makeovers', slug: 'makeovers' },
];

const RADIUS_KM = 25;
const PAGE_SIZE = 20;

// ── Hook: device location ──────────────────────────────────
function useLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: asked } = await Location.requestForegroundPermissionsAsync();
        if (asked !== 'granted') {
          setLocError('Location permission denied. Showing vendors in Lagos.');
          // Default to Lagos Island
          setCoords({ lat: 6.4531, lng: 3.3958 });
          return;
        }
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

  return { coords, locError };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { coords, locError } = useLocation();

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vendors, setVendors] = useState<VendorCardData[]>([]);
  const [loading, setLoading] = useState(false);
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
      category_slug: cat,
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

    // Client-side name search filter (RPC doesn't do text search)
    const filtered = query.trim()
      ? results.filter((v) => v.full_name.toLowerCase().includes(query.toLowerCase()))
      : results;

    if (append) {
      setVendors((prev) => [...prev, ...filtered]);
    } else {
      setVendors(filtered);
    }

    setHasMore(results.length === PAGE_SIZE);
    offsetRef.current = offset + results.length;
  }, [coords]);

  // Re-fetch when location, category or search changes
  useEffect(() => {
    if (!coords) return;
    offsetRef.current = 0;
    setHasMore(true);
    fetchVendors(activeCategory, search, 0, false);
  }, [coords, activeCategory, search, fetchVendors]);

  const onRefresh = () => {
    setRefreshing(true);
    offsetRef.current = 0;
    fetchVendors(activeCategory, search, 0, false);
  };

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {CATEGORIES.map((cat) => {
          const active = activeCategory === cat.slug;
          return (
            <TouchableOpacity
              key={cat.label}
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
      </ScrollView>

      {/* ── Location error banner ── */}
      {locError && (
        <View style={styles.locBanner}>
          <Text style={styles.locBannerText}>{locError}</Text>
        </View>
      )}

      {/* ── Vendor list ── */}
      {!coords && !locError ? (
        <View style={styles.centered}>
          <ScissorsLoader size="small" color="dark" />
          <Text style={styles.loadingText}>Finding your location…</Text>
        </View>
      ) : (
        <FlatList
          data={vendors}
          keyExtractor={(v) => v.id}
          renderItem={({ item }) => <VendorCard vendor={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            loading && vendors.length === 0 ? (
              <View style={styles.centered}>
                <ScissorsLoader size="small" color="dark" />
              </View>
            ) : null
          }
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
              <View style={{ marginVertical: 20, alignItems: 'center' }}><ScissorsLoader size="small" color="dark" /></View>
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
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabs: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
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
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
