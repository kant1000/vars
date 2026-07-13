// ============================================================
// VARS — Supabase Storage helpers
// ============================================================
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { imageContainsContact } from './ocr';

const UPLOAD_SIZE = 1024;

/**
 * Read a local file URI as an ArrayBuffer.
 * `fetch('file://...')` fails silently on Android — use expo-file-system instead.
 */
async function readUriAsArrayBuffer(uri: string): Promise<{ buffer: ArrayBuffer; ext: string }> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return { buffer: bytes.buffer as ArrayBuffer, ext: 'jpg' };
}

/**
 * Resize and compress a local image URI to a UPLOAD_SIZE×UPLOAD_SIZE JPEG.
 * The crop is done by the OS picker (aspect [1,1]); this only resizes down.
 */
async function resizeToSquare(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: UPLOAD_SIZE, height: UPLOAD_SIZE } }],
    { compress: 0.8, format: SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Pick a single image from device library, crop to square, resize, and upload.
 * Returns the public URL.
 */
export async function pickAndUploadImage(params: {
  bucket: string;
  path: string;
}): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  const resized = await resizeToSquare(result.assets[0].uri);
  const { buffer } = await readUriAsArrayBuffer(resized);
  const filePath = `${params.path}.jpg`;

  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(filePath, buffer, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from(params.bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export interface PortfolioUpload {
  path: string;
  url: string;
}

/**
 * Pick a single portfolio photo, crop to square, resize, and upload.
 * Returns { path, url } or null if cancelled.
 */
export async function uploadSinglePortfolioPhoto(
  vendorId: string,
): Promise<PortfolioUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;

  if (await imageContainsContact(result.assets[0].uri)) {
    throw new Error("Photos can't include contact details like phone numbers or handles. Try a different one.");
  }

  const resized = await resizeToSquare(result.assets[0].uri);
  const { buffer } = await readUriAsArrayBuffer(resized);
  const filePath = `vendors/${vendorId}/portfolio/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, buffer, { contentType: 'image/jpeg' });

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
  const resized = await resizeToSquare(uri);
  const { buffer } = await readUriAsArrayBuffer(resized);
  const filePath = `vendors/${userId}/profile.jpg`;

  const { error } = await supabase.storage
    .from('portfolio')
    .upload(filePath, buffer, { upsert: true, contentType: 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from('portfolio').getPublicUrl(filePath);
  return data.publicUrl;
}
