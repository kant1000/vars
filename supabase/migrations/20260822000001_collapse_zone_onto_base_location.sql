-- ============================================================
-- VARS — Collapse the auto-accept zone onto base_location
--
-- Vendors had two unrelated location fields:
--   • base_location            — discovery ranking + transport fee distance
--   • auto_accept_zone_lat/lng — auto-accept eligibility + drift detection
--
-- That duplication caused a production bug (991f6d6: transport fee was
-- measured from auto_accept_zone_lat/lng instead of base_location). It also
-- meant a vendor had two separate location UIs meaning two different things,
-- which got worse once base_location became editable from the profile screen.
--
-- base_location is now the single vendor location. The auto-accept zone is
-- derived from it plus auto_accept_zone_radius_km, which survives as the only
-- zone-specific setting. "Zone configured" therefore now means *radius is
-- set*, not *pin is set*.
--
-- Safe to drop without a data migration: verified immediately before applying
-- that 0 rows had a zone pin and 0 rows had live_location populated.
--
-- Also removes live_location / live_location_updated_at, dead since the
-- vendor_current_lat/lng design replaced them (zero code references, zero
-- populated rows). See docs/audit/regression-sweep-2026-08-22.md.
-- ============================================================

-- --------------------------------------------------------
-- 1. Drop the duplicate zone centre
-- --------------------------------------------------------
ALTER TABLE vendors
  DROP COLUMN IF EXISTS auto_accept_zone_lat,
  DROP COLUMN IF EXISTS auto_accept_zone_lng;

-- --------------------------------------------------------
-- 2. Drop dead pre-vendor_current_lat/lng location columns
-- --------------------------------------------------------
ALTER TABLE vendors
  DROP COLUMN IF EXISTS live_location,
  DROP COLUMN IF EXISTS live_location_updated_at;

-- --------------------------------------------------------
-- 3. Restate the meaning of what survives
-- --------------------------------------------------------
COMMENT ON COLUMN vendors.base_location IS
  'The vendor''s single operating location. Drives discovery proximity sort (get_nearby_vendors), transport-fee distance (get_vendor_base_location), and the auto-accept zone centre. Editable by the vendor from the profile screen via vendor-set-base-location, which nulls auto_accept_zone_confirmed_date in the same update.';

COMMENT ON COLUMN vendors.auto_accept_zone_radius_km IS
  'Radius in km (1 / 1.5) around base_location defining the auto-accept zone. The only zone-specific setting: non-null means the vendor has configured a zone.';

COMMENT ON COLUMN vendors.vendor_location_updated_at IS
  'When vendor_current_lat/lng was last written by vendor-update-location. Required so send-reminders can reject stale coordinates before firing a proximity payment gate.';
