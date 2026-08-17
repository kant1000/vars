// ============================================================
// VARS — Home / Discover screen
// Single 30 km RPC fetch on mount; in-memory progressive slice.
// Category filtering is in-memory — no round-trip on category switch.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, RefreshControl,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { VendorCard, VendorCardData } from '@/components/VendorCard';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VarsSkeleton } from '@/components/ui';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { BORDER_WIDTH } from '@/constants/colors';
import { VarsTheme } from '@/constants/visualSystem';
import { LocationPicker, ResolvedLocation, reverseGeocode } from '@/components/LocationPicker';
import { setPendingLocation, migratePendingLocation } from '@/lib/pendingLocation';

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

const DEFAULT_COORDS = { lat: 6.4531, lng: 3.3958 }; // Lagos — used until a location is confirmed

// ── Hook: confirmed discovery location ─────────────────────
// Vendor ranking/distance must reference a location the customer actually
// confirmed, not whatever GPS reading happened to be on hand when the app
// opened (see LocationPicker) — that's what got vendors surfaced/ranked
// against a location that might have nothing to do with the real visit.
// Persisted on profiles.session_location so it survives app restarts;
// falls back to live GPS (unpersisted) or the Lagos default until then.
function useConfirmedLocation(userId: string | undefined) {
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(DEFAULT_COORDS);
  const [address, setAddress] = useState('Lagos (default)');
  const [loaded, setLoaded] = useState(false);

  // POINT(lng lat) — same WKT write pattern used for vendors.base_location.
  // Any location this screen resolves — GPS or an explicit pick — becomes
  // "the confirmed one" immediately, so other screens (e.g. the booking
  // flow's default) see the same value via get_my_session_location().
  // Uses the id already on hand from useAuth() rather than a fresh
  // supabase.auth.getUser() round-trip — that call was racy on first
  // mount and silently no-op'd the update (RLS matches zero rows on a
  // mismatched/empty id, no error thrown), which is why session_location
  // was never actually landing in the database.
  // No account exists yet for a guest — nothing to attach session_location
  // to — so their confirmation is stashed locally instead and migrated in
  // by loadInitial() the moment userId shows up (see pendingLocation.ts).
  const persist = useCallback(async (lat: number, lng: number, address: string) => {
    if (!userId) {
      await setPendingLocation({ lat, lng, address });
      return;
    }
    const { error, data } = await supabase
      .from('profiles')
      .update({ session_location: `POINT(${lng} ${lat})` })
      .eq('id', userId)
      .select('id');
    if (error || !data?.length) {
      console.warn('[useConfirmedLocation] failed to persist session_location', error);
    }
  }, [userId]);

  const loadInitial = useCallback(async () => {
    // 0. A location confirmed as a guest, now that there's finally an
    // account to attach it to — takes priority over everything below,
    // since it's what the customer was actually just looking at (e.g. on
    // the way back from a deferred-login signup mid-booking).
    if (userId) {
      const migrated = await migratePendingLocation(userId);
      if (migrated) {
        setCoords({ lat: migrated.lat, lng: migrated.lng });
        setAddress(migrated.address || 'Current area');
        setLoaded(true);
        return;
      }
    }

    // 1. Previously confirmed location wins — same one used last session.
    // Distinguishing a genuine "nothing saved yet" (data null, no error)
    // from a failed read (error set) matters: treating a transient RPC
    // hiccup as "no location on file" used to fall through to step 2 and
    // silently overwrite a perfectly good saved location with a fresh GPS
    // reading — exactly the "defaulted back to live location" bug.
    const { data, error } = await supabase.rpc('get_my_session_location').maybeSingle() as
      { data: { lat: number; lng: number } | null; error: unknown };
    if (data?.lat != null && data?.lng != null) {
      setCoords({ lat: data.lat, lng: data.lng });
      setAddress(await reverseGeocode(data.lat, data.lng));
      setLoaded(true);
      return;
    }
    if (error) {
      // Read failed — don't treat this as "nothing saved" and don't
      // persist over it. Show the Lagos default for this one load; the
      // real saved location will load correctly next time.
      console.warn('[useConfirmedLocation] failed to read session_location', error);
      setLoaded(true);
      return;
    }

    // 2. No confirmed location yet — best-effort live GPS. Persisted as soon
    // as it resolves so it's the same value the booking flow will see.
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLoaded(true);
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const resolvedAddress = await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setAddress(resolvedAddress);
      await persist(loc.coords.latitude, loc.coords.longitude, resolvedAddress);
    } catch {
      // keep default Lagos coords/address — nothing to persist
    }
    setLoaded(true);
  }, [persist, userId]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const confirm = useCallback(async (loc: ResolvedLocation) => {
    const resolvedAddress = loc.address || 'Current area';
    setCoords({ lat: loc.lat, lng: loc.lng });
    setAddress(resolvedAddress);
    await persist(loc.lat, loc.lng, resolvedAddress);
  }, [persist]);

  return { coords, address, loaded, confirm };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const { theme } = useVarsTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { coords, address, loaded: locationLoaded, confirm: confirmLocation } = useConfirmedLocation(user?.id);

  const [activeCategory, setActiveCategory] = useState<string>('hair');
  const [allVendors, setAllVendors] = useState<VendorCardData[]>([]);
  const [sliceCursor, setSliceCursor] = useState(INITIAL_SLICE);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  // ── In-memory filtering: category only ─────────────────────
  // Runs on the already-fetched 30 km pool, so category switches are
  // instant with no additional RPC call.
  const filteredVendors = useMemo(() => (
    allVendors.filter((v) => v.category_names.includes(activeCategory))
  ), [allVendors, activeCategory]);

  const renderedVendors = filteredVendors.slice(0, sliceCursor);
  const hasMore = sliceCursor < filteredVendors.length;

  // Reset slice cursor whenever the visible filter set changes
  useEffect(() => {
    setSliceCursor(INITIAL_SLICE);
  }, [activeCategory]);

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
    ({ item }: { item: VendorCardData }) => <VendorCard vendor={item} activeCategory={activeCategory} />,
    [activeCategory],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {firstName} 👋</Text>
          <Text style={styles.subGreeting} numberOfLines={1}>
            {locationLoaded ? `You're seeing stylists close to: ${address}` : 'Finding your area…'}
          </Text>
        </View>
      </View>

      {/* ── Confirmed location — every distance/ranking below comes from
          this, not silent live GPS. Pre-filled; tap to change it. ── */}
      <View style={styles.locationBar}>
        <LocationPicker
          theme={theme}
          value={locationLoaded ? { lat: coords.lat, lng: coords.lng, address } : null}
          placeholder="Finding your area…"
          onConfirm={confirmLocation}
          sheetSubtitle="Vendors and distances shown are based on this location."
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
                We're growing fast. Check back soon or try a different category.
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
    tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
    tab: {
      flex: 1, paddingVertical: 8, alignItems: 'center',
      borderRadius: 5, borderWidth: BORDER_WIDTH.regular, borderColor: theme.color.inkFaint,
      backgroundColor: theme.color.bg,
    },
    tabActive: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
    tabText: { fontSize: 14, fontWeight: '600', color: theme.color.inkMuted },
    tabTextActive: { color: theme.color.inverseInk },
    locationBar: {
      marginHorizontal: 20, marginBottom: 8,
    },
    skeletonCard: {
      flexDirection: 'row', gap: 14,
      backgroundColor: theme.color.bg,
      borderRadius: 5, padding: 14,
      borderWidth: BORDER_WIDTH.thin, borderColor: theme.color.inkFaint,
      marginHorizontal: 16, marginBottom: 12,
    },
    skeletonInfo: { flex: 1, justifyContent: 'center', gap: 8 },
    list: { paddingTop: 4, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.color.ink, marginBottom: 8 },
    emptyBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}
