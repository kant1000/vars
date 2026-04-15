-- ============================================================
-- VARS — Auto-Accept Migration
-- Adds three-state calendar, vendor zone settings, and
-- auto-accept fields to bookings.
--
-- Changes:
--   1. New block_state_enum
--   2. Rename vendor_unavailability → vendor_calendar
--      + add block_state + transport_buffer FK
--   3. Vendor zone and auto-accept columns
--   4. Booking auto-accept + grace period columns
-- ============================================================

-- --------------------------------------------------------
-- 1. block_state enum
-- --------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'block_state_enum') THEN
    CREATE TYPE block_state_enum AS ENUM (
      'unavailable',      -- vendor blocked this slot
      'available',        -- explicitly marked open (same as default)
      'auto_accept',      -- eligible for automatic booking acceptance
      'transport_buffer'  -- system-reserved travel buffer after a booking
    );
  END IF;
END $$;

-- --------------------------------------------------------
-- 2. Rename vendor_unavailability → vendor_calendar
--    and add new columns
-- --------------------------------------------------------
ALTER TABLE vendor_unavailability
  ADD COLUMN IF NOT EXISTS block_state block_state_enum NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS transport_buffer_source_booking_id UUID
    REFERENCES bookings(id) ON DELETE CASCADE;

-- All existing rows are blocked slots — block_state default 'unavailable' is correct.

ALTER TABLE vendor_unavailability RENAME TO vendor_calendar;

-- Update index (old index preserved under old name after rename)
DROP INDEX IF EXISTS idx_vendor_unavailability_lookup;
CREATE INDEX IF NOT EXISTS idx_vendor_calendar_lookup
  ON vendor_calendar (vendor_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_vendor_calendar_auto_accept
  ON vendor_calendar (vendor_id, block_state)
  WHERE block_state = 'auto_accept';

CREATE INDEX IF NOT EXISTS idx_vendor_calendar_transport_buffer
  ON vendor_calendar (transport_buffer_source_booking_id)
  WHERE transport_buffer_source_booking_id IS NOT NULL;

-- --------------------------------------------------------
-- 3. Vendor zone + auto-accept settings
-- --------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS auto_accept_zone_lat              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS auto_accept_zone_lng              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS auto_accept_zone_radius_km        INT
    CHECK (auto_accept_zone_radius_km IN (1, 2, 3, 5, 10)),
  ADD COLUMN IF NOT EXISTS auto_accept_enabled               BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_accept_paused_due_to_drift   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_accept_zone_confirmed_date   DATE,
  ADD COLUMN IF NOT EXISTS vendor_current_lat                DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vendor_current_lng                DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vendor_location_updated_at        TIMESTAMPTZ;

COMMENT ON COLUMN vendors.auto_accept_zone_lat IS 'Centre latitude of vendor''s auto-accept operating zone.';
COMMENT ON COLUMN vendors.auto_accept_zone_lng IS 'Centre longitude of vendor''s auto-accept operating zone.';
COMMENT ON COLUMN vendors.auto_accept_zone_radius_km IS 'Radius in km for auto-accept zone (1/2/3/5/10).';
COMMENT ON COLUMN vendors.auto_accept_enabled IS 'Master switch: vendor has configured and enabled auto-accept.';
COMMENT ON COLUMN vendors.auto_accept_paused_due_to_drift IS 'TRUE when vendor is >zone_radius+3km from zone centre. Set by vendor-update-location.';
COMMENT ON COLUMN vendors.auto_accept_zone_confirmed_date IS 'The date the vendor last confirmed their zone. Must equal TODAY for auto-accept to fire.';
COMMENT ON COLUMN vendors.vendor_current_lat IS 'Last known vendor latitude, updated by vendor-update-location.';
COMMENT ON COLUMN vendors.vendor_current_lng IS 'Last known vendor longitude, updated by vendor-update-location.';

-- --------------------------------------------------------
-- 4. Booking auto-accept + grace period columns
-- --------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS auto_accepted                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_accept_grace_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_cancelled              BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN bookings.auto_accepted IS 'TRUE when booking was accepted automatically via the auto-accept system.';
COMMENT ON COLUMN bookings.auto_accept_grace_expires_at IS '5-minute window after auto-accept during which vendor can cancel penalty-free.';
COMMENT ON COLUMN bookings.grace_cancelled IS 'TRUE if vendor cancelled during the 5-minute grace period.';

-- --------------------------------------------------------
-- 5. RLS for vendor_calendar
--    (policies survive table rename but we comment for clarity)
-- --------------------------------------------------------
-- Existing policies retained from migration 001 (now apply to vendor_calendar):
--   vendor_unavailability_public_read   → anyone can SELECT (for availability checks)
--   vendor_unavailability_vendor_manage → vendor can INSERT/UPDATE/DELETE own rows
--   vendor_unavailability_admin_all     → admin can do anything
-- No policy changes needed — policies follow the renamed table.
