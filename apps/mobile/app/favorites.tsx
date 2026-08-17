// ============================================================
// VARS — My Favourites
// Route: /favorites
// Flat list of vendors the customer has hearted from their profile
// page. Reuses VendorCard verbatim (same as the Discover feed) since
// get_favourite_vendors returns the identical shape, distance omitted.
// ============================================================
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useVarsTheme } from '@/contexts/ThemeContext';
import { VarsTheme } from '@/constants/visualSystem';
import { BORDER_WIDTH } from '@/constants/colors';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { VendorCard, VendorCardData } from '@/components/VendorCard';

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useVarsTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [vendors, setVendors] = useState<VendorCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_favourite_vendors');
    if (error) console.warn('[favorites] failed to load', error);
    setVendors((data ?? []) as VendorCardData[]);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>My favourites</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.centered}>
          <ScissorsLoader size="large" color={theme.appearance === 'dark' ? 'light' : 'dark'} />
        </View>
      ) : vendors.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyTitle}>No favourites yet</Text>
          <Text style={s.emptyBody}>Tap the heart on a stylist's profile to save them here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {vendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              activeCategory={vendor.category_names[0] ?? ''}
              showDistance={false}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(theme: VarsTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: BORDER_WIDTH.thin, borderBottomColor: theme.color.inkFaint,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backText: { fontSize: 28, color: theme.color.ink, lineHeight: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.color.ink },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.color.ink, marginBottom: 8, textAlign: 'center' },
    emptyBody: { fontSize: 14, color: theme.color.inkMuted, textAlign: 'center', lineHeight: 20 },
  });
}
