-- ============================================================
-- Migration 008: Portfolio photos schema overhaul
--
-- Replaces photo_url / is_consented with:
--   storage_path   TEXT NOT NULL  — path inside 'portfolio' bucket
--   consent_state  consent_state_enum — unverified | pending | approved | declined
--   consent_expires_at TIMESTAMPTZ — set for pending photos (72hr window)
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

-- 3. Migrate existing rows: extract storage path from full public URL
UPDATE portfolio_photos SET
  storage_path  = COALESCE(
    SUBSTRING(photo_url FROM '/object/public/portfolio/(.+)$'),
    photo_url
  ),
  consent_state = 'unverified'
WHERE storage_path IS NULL;

-- 4. Enforce NOT NULL after migration
ALTER TABLE portfolio_photos
  ALTER COLUMN storage_path  SET NOT NULL,
  ALTER COLUMN consent_state SET NOT NULL,
  ALTER COLUMN consent_state SET DEFAULT 'unverified';

-- 5. Drop ALL policies that reference is_consented before dropping the column
--    (must come before DROP COLUMN or Postgres will reject it)
DROP POLICY IF EXISTS "portfolio_photos_public_read"       ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_select_own" ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_manage"     ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_admin_all"         ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_all"        ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_client_pending"    ON portfolio_photos;

-- 6. Now safe to drop old columns
ALTER TABLE portfolio_photos
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS is_consented,
  DROP COLUMN IF EXISTS caption;

-- 7. Drop old partial index (referenced dropped columns)
DROP INDEX IF EXISTS idx_portfolio_photos_vendor_id;

-- 8. New indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_photos_visible
  ON portfolio_photos (vendor_id, consent_state)
  WHERE consent_state IN ('unverified', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_photos_booking_unique
  ON portfolio_photos (booking_id)
  WHERE booking_id IS NOT NULL;

-- 9. Correct RLS policies
CREATE POLICY "portfolio_photos_public_read"
  ON portfolio_photos FOR SELECT
  USING (consent_state IN ('unverified', 'approved'));

CREATE POLICY "portfolio_photos_vendor_all"
  ON portfolio_photos FOR ALL
  USING (auth.uid() = vendor_id);

CREATE POLICY "portfolio_photos_client_pending"
  ON portfolio_photos FOR SELECT
  USING (
    consent_state = 'pending'
    AND booking_id IN (
      SELECT id FROM bookings WHERE user_id = auth.uid()
    )
  );
