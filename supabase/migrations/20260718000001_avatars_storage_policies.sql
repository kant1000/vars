-- Storage RLS policies for the 'avatars' bucket.
-- Upload path pattern: users/{user_uid}/avatar.jpg
--
-- The bucket existed (public=true, created outside migrations) but had zero
-- storage.objects RLS policies, so every upload was rejected with "new row
-- violates row-level security policy" — customers could never set a profile
-- photo. Mirrors the portfolio bucket's policy shape (see
-- 20260705000004_portfolio_storage_policies.sql).

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own subfolder
CREATE POLICY "avatars_storage_user_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Users can overwrite their own files (upsert on re-upload)
CREATE POLICY "avatars_storage_user_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Users can delete their own files
CREATE POLICY "avatars_storage_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Public read (bucket is already public, explicit policy for completeness)
CREATE POLICY "avatars_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
