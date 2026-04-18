-- ============================================================
-- Migration 008: Portfolio photos schema overhaul
--
-- Replaces photo_url / is_consented with:
--   storage_path   TEXT NOT NULL  — path inside 'portfolio' bucket
--   consent_state  consent_state_enum — unverified | pending | approved | declined
--   consent_expires_at TIMESTAMPTZ — set to created_at + 72hrs for pending photos
--
-- booking_id column already exists (FK added in migration 000).
-- ============================================================

-- 1. New enum
CREATE TYPE consent_state_enum AS ENUM ('unverified', 'pending', 'approved', 'declined');

-- 2. Add new columns (nullable while we migrate existing rows)
ALTER TABLE portfolio_photos
  ADD COLUMN IF NOT EXISTS storage_path        TEXT,
  ADD COLUMN IF NOT EXISTS consent_state       consent_state_enum,
  ADD COLUMN IF NOT EXISTS consent_expires_at  TIMESTAMPTZ;

-- 3. Migrate existing rows
--    photo_url is a full Supabase public URL; extract the storage path.
--    All existing self-uploaded photos become 'unverified' (not 'approved').
UPDATE portfolio_photos SET
  storage_path  = COALESCE(
    SUBSTRING(photo_url FROM '/object/public/portfolio/(.+)$'),
    photo_url   -- fallback: keep raw value if regex fails
  ),
  consent_state = 'unverified'
WHERE storage_path IS NULL;

-- 4. Enforce NOT NULL after migration
ALTER TABLE portfolio_photos
  ALTER COLUMN storage_path  SET NOT NULL,
  ALTER COLUMN consent_state SET NOT NULL,
  ALTER COLUMN consent_state SET DEFAULT 'unverified';

-- 5. Drop old columns
ALTER TABLE portfolio_photos
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS is_consented,
  DROP COLUMN IF EXISTS caption;

-- 6. Drop the old partial index (referenced the dropped column)
DROP INDEX IF EXISTS idx_portfolio_photos_vendor_id;

-- 7. New index for public portfolio queries (the hot path)
CREATE INDEX idx_portfolio_photos_visible
  ON portfolio_photos (vendor_id, consent_state)
  WHERE consent_state IN ('unverified', 'approved');

-- 8. Enforce one photo per completed booking
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_photos_booking_unique
  ON portfolio_photos (booking_id)
  WHERE booking_id IS NOT NULL;

-- 9. Update RLS policies
DROP POLICY IF EXISTS "portfolio_photos_public_read"         ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_select_own"   ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_manage"       ON portfolio_photos;

-- Public: only unverified + approved photos visible
CREATE POLICY "portfolio_photos_public_read"
  ON portfolio_photos FOR SELECT
  USING (consent_state IN ('unverified', 'approved'));

-- Vendor: full access to all own photos (any consent state)
CREATE POLICY "portfolio_photos_vendor_all"
  ON portfolio_photos FOR ALL
  USING (auth.uid() = vendor_id);

-- Client: can read pending photos from their own bookings (consent screen)
CREATE POLICY "portfolio_photos_client_pending"
  ON portfolio_photos FOR SELECT
  USING (
    consent_state = 'pending'
    AND booking_id IN (
      SELECT id FROM bookings WHERE user_id = auth.uid()
    )
  );
