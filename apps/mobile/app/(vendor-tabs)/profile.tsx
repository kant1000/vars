// ============================================================
// VARS — Vendor Profile / Settings
// Sections: Auto-Accept zone, Portfolio management, Account
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Dimensions, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { ScissorsLoader } from '@/components/ScissorsLoader';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/auth';
import { uploadSinglePortfolioPhoto, deletePortfolioPhoto } from '@/lib/storage';
import { Colors } from '@/constants/colors';
import { CloseIcon } from '@/components/icons';

const PHOTO_SIZE = (Dimensions.get('window').width - 48 - 16) / 3; // 3 cols, 24px side padding, 8px gaps

interface VendorZoneInfo {
  auto_accept_enabled: boolean;
  auto_accept_paused_due_to_drift: boolean;
  auto_accept_zone_confirmed_date: string | null;
  auto_accept_zone_radius_km: number | null;
  auto_accept_zone_lat: number | null;
  auto_accept_zone_lng: number | null;
}

interface PortfolioPhoto {
  id: string;
  storage_path: string;
  consent_state: 'unverified' | 'pending' | 'approved';
  booking_id: string | null;
}

const CONSENT_LABEL: Record<string, { text: string; color: string }> = {
  unverified: { text: 'Uploaded', color: Colors.textMuted },
  pending:    { text: 'Sent to client', color: Colors.warning },
  approved:   { text: 'Verified', color: Colors.success },
};

export default function VendorProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [zoneInfo, setZoneInfo] = useState<VendorZoneInfo | null>(null);
  const [zoneLoading, setZoneLoading] = useState(true);

  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, []));

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setZoneLoading(false); setPhotosLoading(false); return; }

    const [zoneRes, photosRes] = await Promise.all([
      supabase
        .from('vendors')
        .select(`
          auto_accept_enabled, auto_accept_paused_due_to_drift,
          auto_accept_zone_confirmed_date, auto_accept_zone_radius_km,
          auto_accept_zone_lat, auto_accept_zone_lng
        `)
        .eq('id', user.id)
        .single(),

      supabase
        .from('portfolio_photos')
        .select('id, storage_path, consent_state, booking_id')
        .eq('vendor_id', user.id)
        .neq('consent_state', 'declined')
        .order('created_at', { ascending: false }),
    ]);

    setZoneInfo(zoneRes.data ?? null);
    setPhotos((photosRes.data ?? []) as PortfolioPhoto[]);
    setZoneLoading(false);
    setPhotosLoading(false);
  };

  const zoneConfigured = zoneInfo?.auto_accept_zone_lat != null;
  const confirmedToday = zoneInfo?.auto_accept_zone_confirmed_date === today;
  const autoActive =
    zoneInfo?.auto_accept_enabled &&
    !zoneInfo?.auto_accept_paused_due_to_drift &&
    confirmedToday;

  const zoneStatusLabel = () => {
    if (!zoneConfigured) return { text: 'No zone set', color: Colors.textMuted };
    if (!zoneInfo?.auto_accept_enabled) return { text: 'Off', color: Colors.textMuted };
    if (zoneInfo?.auto_accept_paused_due_to_drift) return { text: 'Outside your zone', color: Colors.warning };
    if (!confirmedToday) return { text: 'Needs daily confirmation', color: Colors.warning };
    return { text: `Active · ${zoneInfo.auto_accept_zone_radius_km} km radius`, color: Colors.success };
  };

  const zoneStatus = zoneStatusLabel();

  const totalPhotoCount = photos.length;
  const unverifiedCount = photos.filter((p) => p.consent_state === 'unverified').length;
  const canAddUnverified = unverifiedCount < 3 && totalPhotoCount < 10;

  const handleAddUnverifiedPhoto = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setAddingPhoto(true);
    try {
      const upload = await uploadSinglePortfolioPhoto(user.id);
      if (!upload) return;

      const { error } = await supabase.from('portfolio_photos').insert({
        vendor_id: user.id,
        storage_path: upload.path,
        consent_state: 'unverified',
      });
      if (error) {
        // Clean up the already-uploaded storage file to avoid orphans
        await supabase.storage.from('portfolio').remove([upload.path]).catch(() => {});
        throw error;
      }

      await loadAll();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Could not upload photo.');
    } finally {
      setAddingPhoto(false);
    }
  };

  const handleDeletePhoto = (photo: PortfolioPhoto) => {
    Alert.alert(
      'Delete photo',
      'This photo will be permanently removed from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePortfolioPhoto(photo.storage_path);
              await supabase.from('portfolio_photos').delete().eq('id', photo.id);
              setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Could not delete photo.');
            }
          },
        },
      ]
    );
  };

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
          {zoneLoading ? (
            <View style={{ margin: 16, alignItems: 'center' }}><ScissorsLoader size="small" color="dark" /></View>
          ) : (
            <TouchableOpacity
              style={[s.settingRow, s.settingRowGold]}
              onPress={() => router.push('/vendor-zone-setup')}
              activeOpacity={0.7}
            >
              <View style={s.settingLeft}>
                <Text style={s.settingLabel}>⚡ Auto-accept zone</Text>
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

        {/* Portfolio */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Portfolio</Text>
            <Text style={s.photoCount}>{totalPhotoCount}/10 photos</Text>
          </View>

          {photosLoading ? (
            <View style={{ margin: 16, alignItems: 'center' }}><ScissorsLoader size="small" color="dark" /></View>
          ) : (
            <>
              <View style={s.photoGrid}>
                {photos.map((photo) => {
                  const { data: { publicUrl } } = supabase.storage
                    .from('portfolio')
                    .getPublicUrl(photo.storage_path);
                  const label = CONSENT_LABEL[photo.consent_state];
                  return (
                    <View key={photo.id} style={s.photoWrapper}>
                      <Image source={{ uri: publicUrl }} style={s.photo} contentFit="cover" cachePolicy="memory-disk" />
                      <View style={s.photoBadge}>
                        <Text style={[s.photoBadgeText, { color: label.color }]}>
                          {label.text}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={s.photoDeleteBtn}
                        onPress={() => handleDeletePhoto(photo)}
                      >
                        <CloseIcon size={11} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {canAddUnverified && (
                  <TouchableOpacity
                    style={s.addPhotoBtn}
                    onPress={handleAddUnverifiedPhoto}
                    disabled={addingPhoto}
                  >
                    {addingPhoto ? (
                      <ScissorsLoader size="small" color="dark" />
                    ) : (
                      <>
                        <Text style={s.addPhotoIcon}>+</Text>
                        <Text style={s.addPhotoLabel}>Add photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {!canAddUnverified && totalPhotoCount < 10 && (
                <Text style={s.photoHint}>
                  Your starter photos are set. Complete bookings to add verified photos.
                </Text>
              )}
              {totalPhotoCount >= 10 && (
                <Text style={s.photoHint}>
                  Profile full (10/10). Delete a photo to add more.
                </Text>
              )}
            </>
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

  nameSection: { alignItems: 'center', paddingVertical: 28, gap: 10 },
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  sectionTitleGold: { color: Colors.pioneerGoldDark },
  photoCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingRowGold: {
    backgroundColor: Colors.pioneerGoldSurface, borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.pioneerGold + '30', borderBottomWidth: 1,
    borderBottomColor: Colors.pioneerGold + '30',
  },
  settingLeft: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13 },
  editLabel: { fontSize: 13, fontWeight: '700', color: Colors.pioneerGoldDark },

  confirmBanner: {
    marginTop: 10, padding: 12,
    backgroundColor: Colors.pioneerGoldSurface, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.pioneerGold + '40',
  },
  confirmBannerText: { fontSize: 13, color: Colors.pioneerGoldDark, fontWeight: '600' },

  // Portfolio grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  photoWrapper: { width: PHOTO_SIZE, position: 'relative' },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 10 },
  photoBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
    paddingVertical: 3, alignItems: 'center',
  },
  photoBadgeText: { fontSize: 10, fontWeight: '700' },
  photoDeleteBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  addPhotoBtn: {
    width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoIcon: { fontSize: 24, color: Colors.primary, fontWeight: '300' },
  addPhotoLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  photoHint: {
    fontSize: 12, color: Colors.textMuted, marginTop: 4, marginBottom: 8, lineHeight: 17,
  },
});
