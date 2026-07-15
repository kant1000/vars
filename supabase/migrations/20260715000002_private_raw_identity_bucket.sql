-- ============================================================
-- Migration: Move raw KYC liveness images to a private bucket
--
-- The vendor-identity-images bucket is public=true so that the
-- cropped profile.jpg can be loaded in React Native <Image>
-- without auth headers. raw.jpg (the unprocessed Youverify
-- liveness capture) was also uploaded there, making the full
-- biometric image publicly addressable by anyone who knows a
-- vendor's UUID — a violation of NDPA sensitive data rules.
--
-- Fix: create a separate vendor-identity-raw bucket with
-- public=false. vendor-kyc-webhook now uploads raw.jpg there
-- and stores the storage path (not a public URL) in
-- profile_image_raw_url. The admin vendors page generates
-- short-lived signed URLs server-side when rendering audit images.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-identity-raw',
  'vendor-identity-raw',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- No client RLS policies — only service role (edge functions) may read or write.
-- The admin Next.js app uses the service-role key server-side to generate
-- signed URLs; raw images are never served directly to browsers.
