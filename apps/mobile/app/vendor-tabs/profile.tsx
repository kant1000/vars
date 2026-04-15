// ============================================================
// VARS — Vendor Profile / Settings
// Includes Auto-Accept zone status and navigation to Zone Setup.
// ============================================================
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text,
  TouchableOpacity, View, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { Colors } from '@/constants/colors';

interface VendorZoneInfo {
  auto_accept_enabled: boolean;
  auto_accept_paused_due_to_drift: boolean;
  auto_accept_zone_confirmed_date: string | null;
  auto_accept_zone_radius_km: number | null;
  auto_accept_zone_lat: number | null;
  auto_accept_zone_lng: number | null;
}

export default function VendorProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [zoneInfo, setZoneInfo] = useState<VendorZoneInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('vendors')
        .select(`
          auto_accept_enabled, auto_accept_paused_due_to_drift,
          auto_accept_zone_confirmed_date, auto_accept_zone_radius_km,
          auto_accept_zone_lat, auto_accept_zone_lng
        `)
        .eq('id', user.id)
        .single();
      setZoneInfo(data ?? null);
      setLoading(false);
    })();
  }, []);

  const zoneConfigured = zoneInfo?.auto_accept_zone_lat != null;
  const confirmedToday = zoneInfo?.auto_accept_zone_confirmed_date === today;
  const autoActive =
    zoneInfo?.auto_accept_enabled &&
    !zoneInfo?.auto_accept_paused_due_to_drift &&
    confirmedToday;

  const zoneStatusLabel = () => {
    if (!zoneConfigured) return { text: 'Not set up', color: Colors.textMuted };
    if (!zoneInfo?.auto_accept_enabled) return { text: 'Disabled', color: Colors.textMuted };
    if (zoneInfo?.auto_accept_paused_due_to_drift) return { text: 'Paused — outside zone', color: Colors.warning };
    if (!confirmedToday) return { text: 'Needs daily confirmation', color: Colors.warning };
    return { text: `Active · ${zoneInfo.auto_accept_zone_radius_km} km radius`, color: Colors.success };
  };

  const zoneStatus = zoneStatusLabel();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Name */}
        <View style={s.nameSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(profile?.full_name ?? 'V').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.name}>{profile?.full_name ?? 'Vendor'}</Text>
        </View>

        {/* Auto-Accept Zone */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, s.sectionTitleGold]}>⚡ Auto-Accept</Text>

          {loading ? (
            <ActivityIndicator color="#D4A017" style={{ margin: 16 }} />
          ) : (
            <TouchableOpacity
              style={[s.settingRow, s.settingRowGold]}
              onPress={() => router.push('/vendor-zone-setup')}
              activeOpacity={0.7}
            >
              <View style={s.settingLeft}>
                <Text style={s.settingLabel}>Operating zone</Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: zoneStatus.color }]} />
                  <Text style={[s.statusText, { color: zoneStatus.color }]}>
                    {zoneStatus.text}
                  </Text>
                </View>
              </View>
              <Text style={s.editLabel}>Edit ›</Text>
            </TouchableOpacity>
          )}

          {zoneConfigured && zoneInfo?.auto_accept_enabled && !confirmedToday && (
            <TouchableOpacity
              style={s.confirmBanner}
              onPress={() => router.push('/vendor-zone-setup')}
            >
              <Text style={s.confirmBannerText}>
                ⚡ Confirm your zone to activate auto-accept today
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Account */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          <TouchableOpacity style={s.settingRow} onPress={signOut}>
            <Text style={[s.settingLabel, { color: Colors.error }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: Colors.text },

  nameSection: {
    alignItems: 'center', paddingVertical: 28, gap: 10,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 20, fontWeight: '700', color: Colors.text },

  section: {
    marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border,
    paddingTop: 16, paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  sectionTitleGold: { color: '#A07010' },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingRowGold: {
    backgroundColor: '#FFF8E6', borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#D4A01730', borderBottomWidth: 1,
    borderBottomColor: '#D4A01730',
  },
  settingLeft: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13 },
  editLabel: { fontSize: 13, fontWeight: '700', color: '#A07010' },

  confirmBanner: {
    marginTop: 10, padding: 12,
    backgroundColor: '#FFF8E6', borderRadius: 10,
    borderWidth: 1, borderColor: '#D4A01740',
  },
  confirmBannerText: { fontSize: 13, color: '#A07010', fontWeight: '600' },
});
