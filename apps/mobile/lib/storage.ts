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

/**
 * Upload multiple portfolio photos.
 * Returns array of public URLs.
 */
export async function pickAndUploadPortfolioPhotos(
  vendorId: string,
  existingCount: number
): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.8,
    selectionLimit: 10,
  });

  if (result.canceled || !result.assets.length) return [];

  const urls: string[] = [];

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
    urls.push(data.publicUrl);
  }

  return urls;
}
