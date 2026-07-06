-- Storage RLS policies for the 'portfolio' bucket.
-- Upload path pattern: vendors/{vendor_uid}/portfolio/{filename}

-- Vendors can upload to their own subfolder
CREATE POLICY "portfolio_storage_vendor_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portfolio'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Vendors can overwrite their own files
CREATE POLICY "portfolio_storage_vendor_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Vendors can delete their own files
CREATE POLICY "portfolio_storage_vendor_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'portfolio'
    AND (storage.foldername(name))[1] = 'vendors'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Public read (bucket is already public, explicit policy for completeness)
CREATE POLICY "portfolio_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'portfolio');
