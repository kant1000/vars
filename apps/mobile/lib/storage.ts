// ============================================================
// VARS — Supabase Storage helpers
// ============================================================
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

/**
 * Read a local file URI as an ArrayBuffer.
 * `fetch('file://...')` fails silently on Android — use expo-file-system instead.
 */
async function readUriAsArrayBuffer(uri: string): Promise<{ buffer: ArrayBuffer; ext: string }> {
  const ext = (uri.split('.').pop()?.split('?')[0] ?? 'jpg').toLowerCase();
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { buffer: bytes.buffer as ArrayBuffer, ext };
}

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
  const { buffer, ext } = await readUriAsArrayBuffer(asset.uri);
  const filePath = `${params.path}.${ext}`;

  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(filePath, buffer, { upsert: true, contentType: `image/${ext}` });

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
    const { buffer, ext } = await readUriAsArrayBuffer(asset.uri);
    const filePath = `vendors/${vendorId}/portfolio/${Date.now()}_${existingCount + i}.${ext}`;

    const { error } = await supabase.storage
      .from('portfolio')
      .upload(filePath, buffer, { contentType: `image/${ext}` });

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
  const { buffer, ext } = await readUriAsArrayBuffer(asset.uri);
  const filePath = `vendors/${vendorId}/portfolio/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, buffer, { contentType: `image/${ext}` });

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
  const { buffer, ext } = await readUriAsArrayBuffer(uri);
  const filePath = `vendors/${userId}/profile.${ext}`;

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, buffer, { upsert: true, contentType: `image/${ext}` });

  if (error) throw error;

  const { data } = supabase.storage.from('portfolio').getPublicUrl(filePath);
  return data.publicUrl;
}
