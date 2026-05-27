// ============================================================
// VARS — Supabase Storage helpers
// ============================================================
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/**
 * Pick an image from device library and upload to Supabase Storage.
 * Returns the public URL.
 */
export async function pickAndUploadImage(params: {
  bucket: string;
  path: string;       // e.g. `vendors/${userId}/avatar.jpg`
  aspect?: [number, number];
}): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: params.aspect ?? [1, 1],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop() ?? 'jpg';
  const filePath = `${params.path}.${ext}`;

  // Fetch the file as blob
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(filePath, blob, { upsert: true, contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from(params.bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export interface PortfolioUpload {
  path: string;
  url: string;
}

/**
 * Pick multiple portfolio photos and upload.
 * Returns array of { path, url }. Caller controls the max via selectionLimit.
 */
export async function pickAndUploadPortfolioPhotos(
  vendorId: string,
  existingCount: number,
  selectionLimit = 3,
): Promise<PortfolioUpload[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
    selectionLimit,
  });

  if (result.canceled || !result.assets.length) return [];

  const uploads: PortfolioUpload[] = [];

  for (let i = 0; i < result.assets.length; i++) {
    const asset = result.assets[i];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    const filePath = `vendors/${vendorId}/portfolio/${Date.now()}_${existingCount + i}.${ext}`;

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('portfolio')
      .upload(filePath, blob, { contentType: `image/${ext}` });

    if (error) {
      console.error(`Upload failed for photo ${i}:`, error);
      continue;
    }

    const { data } = supabase.storage.from('portfolio').getPublicUrl(filePath);
    uploads.push({ path: filePath, url: data.publicUrl });
  }

  return uploads;
}

/**
 * Pick a single portfolio photo and upload.
 * Returns { path, url } or null if cancelled.
 */
export async function uploadSinglePortfolioPhoto(
  vendorId: string,
): Promise<PortfolioUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.85,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const ext = asset.uri.split('.').pop() ?? 'jpg';
  const filePath = `vendors/${vendorId}/portfolio/${Date.now()}.${ext}`;

  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, blob, { contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from('portfolio').getPublicUrl(filePath);
  return { path: filePath, url: data.publicUrl };
}

/**
 * Delete a portfolio photo from storage.
 */
export async function deletePortfolioPhoto(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from('portfolio').remove([storagePath]);
  if (error) throw error;
}

/**
 * Upload a local image URI as the vendor's profile photo.
 * Overwrites any existing profile photo (upsert).
 * Returns the public URL.
 */
export async function uploadProfilePhotoFromUri(userId: string, uri: string): Promise<string> {
  const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const filePath = `vendors/${userId}/profile.${ext}`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, blob, { upsert: true, contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from('portfolio').getPublicUrl(filePath);
  return data.publicUrl;
}
