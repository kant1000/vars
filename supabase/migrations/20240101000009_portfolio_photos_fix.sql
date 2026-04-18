-- ============================================================
-- Migration 009: Complete portfolio_photos schema migration
--
-- Migration 008 failed at DROP COLUMN because the existing
-- "portfolio_photos_public_read" policy (migration 001) references
-- the is_consented column. Fix: drop policies first, then columns.
--
-- Columns already added by 008: storage_path, consent_state, consent_expires_at
-- Columns still to drop: photo_url, is_consented, caption
-- ============================================================

-- 1. Drop policies that reference is_consented (must precede DROP COLUMN)
DROP POLICY IF EXISTS "portfolio_photos_public_read"         ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_select_own"   ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_manage"       ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_admin_all"           ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_vendor_all"          ON portfolio_photos;
DROP POLICY IF EXISTS "portfolio_photos_client_pending"      ON portfolio_photos;

-- 2. Now safe to drop old columns
ALTER TABLE portfolio_photos
  DROP COLUMN IF EXISTS photo_url,
  DROP COLUMN IF EXISTS is_consented,
  DROP COLUMN IF EXISTS caption;

-- 3. Drop old partial index (referenced is_consented)
DROP INDEX IF EXISTS idx_portfolio_photos_vendor_id;

-- 4. New indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_photos_visible
  ON portfolio_photos (vendor_id, consent_state)
  WHERE consent_state IN ('unverified', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_photos_booking_unique
  ON portfolio_photos (booking_id)
  WHERE booking_id IS NOT NULL;

-- 5. Correct RLS policies
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
