// ============================================================
// VARS — Vendor Profile / Settings
// Sections: Auto-Accept zone, My Services, Portfolio, Account
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View,
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
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { CATEGORY_L2_LABELS, MAX_VENDOR_SERVICES } from '@vars/shared';

const PHOTO_SIZE = (Dimensions.get('window').width - 48 - 16) / 3;

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

interface VendorServiceItem {
  id: string;
  category_l1: string;
  category_l2: string;
  service_name: string;
  price_kobo: number;
  duration_blocks: number;
  sort_order: number;
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

  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const [services, setServices] = useState<VendorServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  const [photos, setPhotos] = useState<PortfolioPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, []));

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setZoneLoading(false);
      setServicesLoading(false);
      setPhotosLoading(false);
      return;
    }

    const [zoneRes, servicesRes, photosRes] = await Promise.all([
      supabase
        .from('vendors')
        .select(`
          auto_accept_enabled, auto_accept_paused_due_to_drift,
          auto_accept_zone_confirmed_date, auto_accept_zone_radius_km,
          auto_accept_zone_lat, auto_accept_zone_lng,
          profile_image_url
        `)
        .eq('id', user.id)
        .single(),

      supabase
        .from('vendor_services')
        .select('id, category_l1, category_l2, service_name, price_kobo, duration_blocks, sort_order')
        .eq('vendor_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),

      supabase
        .from('portfolio_photos')
        .select('id, storage_path, consent_state, booking_id')
        .eq('vendor_id', user.id)
        .neq('consent_state', 'declined')
        .order('created_at', { ascending: false }),
    ]);

    setZoneInfo(zoneRes.data ?? null);
    setProfileImageUrl(zoneRes.data?.profile_image_url ?? null);
    setServices((servicesRes.data ?? []) as VendorServiceItem[]);
    setPhotos((photosRes.data ?? []) as PortfolioPhoto[]);
    setZoneLoading(false);
    setServicesLoading(false);
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

  const handleDeleteService = (id: string) => {
    Alert.alert(
      'Remove service',
      'This service will be removed from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('vendor_services').delete().eq('id', id);
            if (error) { Alert.alert('Error', error.message); return; }
            setServices((prev) => prev.filter((s) => s.id !== id));
          },
        },
      ]
    );
  };

  const handleDragEnd = async (data: VendorServiceItem[]) => {
    setServices(data);
    await Promise.all(
      data.map((s, i) =>
        supabase.from('vendor_services').update({ sort_order: i }).eq('id', s.id)
      )
    );
  };

  const renderServiceItem = ({ item, drag, isActive }: RenderItemParams<VendorServiceItem>) => (
    <ScaleDecorator>
      <View style={[s.svcRow, isActive && s.svcRowDragging]}>
        <TouchableOpacity onLongPress={drag} hitSlop={8} style={s.dragHandle} activeOpacity={0.6}>
          <Text style={s.dragHandleIcon}>⠿</Text>
        </TouchableOpacity>
        <View style={s.svcInfo}>
          <Text style={s.svcMeta}>{CATEGORY_L2_LABELS[item.category_l2] ?? item.category_l2}</Text>
          <Text style={s.svcName}>{item.service_name}</Text>
          <Text style={s.svcPrice}>₦{(item.price_kobo / 100).toLocaleString('en-NG')}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteService(item.id)} style={s.svcDeleteBtn} hitSlop={8}>
          <CloseIcon size={11} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  );

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

      <NestableScrollContainer contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Name */}
        <View style={s.nameSection}>
          <View style={s.avatarWrapper}>
            {profileImageUrl ? (
              <Image source={{ uri: profileImageUrl }} style={s.avatarImage} contentFit="cover" />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarText}>
                  {(profile?.full_name ?? 'V').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
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
                  <Text style={[s.statusText, { color: Colors.inkMuted }]}>
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

        {/* My Services */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>My Services</Text>
            <Text style={s.photoCount}>{services.length}/{MAX_VENDOR_SERVICES}</Text>
          </View>

          {servicesLoading ? (
            <View style={{ margin: 16, alignItems: 'center' }}><ScissorsLoader size="small" color="dark" /></View>
          ) : (
            <>
              {services.length > 0 && (
                <Text style={s.dragHint}>Long-press a row to reorder</Text>
              )}
              <NestableDraggableFlatList
                data={services}
                keyExtractor={(item) => item.id}
                renderItem={renderServiceItem}
                onDragEnd={({ data }) => handleDragEnd(data)}
              />
              {services.length < MAX_VENDOR_SERVICES && (
                <TouchableOpacity
                  style={s.addSvcBtn}
                  onPress={() => router.push('/vendor-services/add')}
                  activeOpacity={0.8}
                >
                  <Text style={s.addSvcText}>+ Add service</Text>
                </TouchableOpacity>
              )}
              {services.length === 0 && (
                <Text style={s.photoHint}>No services yet. Add your first one.</Text>
              )}
            </>
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
            <Text style={s.settingLabel}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </NestableScrollContainer>
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
  avatarWrapper: { width: 72, height: 72, borderRadius: 36, position: 'relative' },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.white },
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
  photoCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingRowGold: {
    backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: Colors.ink, borderBottomWidth: 1,
    borderBottomColor: Colors.ink,
  },
  settingLeft: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13 },
  editLabel: { fontSize: 13, fontWeight: '700', color: Colors.ink },

  confirmBanner: {
    marginTop: 10, padding: 12,
    backgroundColor: 'transparent', borderRadius: 10,
    borderWidth: 1, borderColor: Colors.ink + '40',
  },
  confirmBannerText: { fontSize: 13, color: Colors.ink, fontWeight: '600' },

  // My Services
  dragHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  svcRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  svcRowDragging: { backgroundColor: Colors.surface, borderRadius: 10 },
  dragHandle: { paddingRight: 12, paddingVertical: 4 },
  dragHandleIcon: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },
  svcInfo: { flex: 1 },
  svcMeta: {
    fontSize: 11, color: Colors.textMuted, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 1,
  },
  svcName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  svcPrice: { fontSize: 13, color: Colors.textSecondary, marginTop: 1 },
  svcDeleteBtn: { padding: 8 },
  addSvcBtn: {
    marginTop: 12, height: 42,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addSvcText: { fontSize: 14, fontWeight: '600', color: Colors.text },

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
    borderWidth: 1.5, borderColor: Colors.ink, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoIcon: { fontSize: 24, color: Colors.ink, fontWeight: '300' },
  addPhotoLabel: { fontSize: 11, color: Colors.inkMuted, fontWeight: '500' },
  photoHint: {
    fontSize: 12, color: Colors.textMuted, marginTop: 4, marginBottom: 8, lineHeight: 17,
  },
});
