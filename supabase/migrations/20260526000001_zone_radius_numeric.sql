-- Migration 027: Update auto_accept_zone_radius_km to support fractional values
--
-- The original column (migration 005) was INT with CHECK IN (1, 2, 3, 5, 10).
-- Zone options are now [1, 1.5] km, requiring NUMERIC and an updated constraint.
--
-- Steps:
--   1. Change column type from INT to NUMERIC(4,1)
--   2. Drop the old auto-named check constraint
--   3. Add new check constraint for (1, 1.5)
--
-- Existing rows with values 2, 3, 5, 10 are not invalidated by the type change
-- (they cast cleanly). They will pass the new constraint only if their value
-- happens to be 1 or 1.5 — vendors with other stored values will simply have
-- a legacy radius that remains readable but cannot be re-saved via the app.

ALTER TABLE vendors
  ALTER COLUMN auto_accept_zone_radius_km TYPE NUMERIC(4,1),
  DROP CONSTRAINT IF EXISTS vendors_auto_accept_zone_radius_km_check,
  ADD CONSTRAINT vendors_auto_accept_zone_radius_km_check
    CHECK (auto_accept_zone_radius_km IN (1, 1.5));

COMMENT ON COLUMN vendors.auto_accept_zone_radius_km IS 'Radius in km for auto-accept zone (1 / 1.5).';
