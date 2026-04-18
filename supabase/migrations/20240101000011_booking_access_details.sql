-- ============================================================
-- Migration 011: Booking access details + denormalised location
--
-- access_building / access_floor / access_flat / access_code
--   Structured access details entered by the customer at booking time.
--   Revealed to the vendor alongside the client phone at the 15-min mark.
--
-- user_location_lat / user_location_lng
--   Denormalised float columns alongside the existing PostGIS geography.
--   Allows React Native components to render map thumbnails without
--   parsing WKB/GeoJSON from the geography column.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS access_building   TEXT,
  ADD COLUMN IF NOT EXISTS access_floor      TEXT,
  ADD COLUMN IF NOT EXISTS access_flat       TEXT,
  ADD COLUMN IF NOT EXISTS access_code       TEXT,
  ADD COLUMN IF NOT EXISTS user_location_lat FLOAT8,
  ADD COLUMN IF NOT EXISTS user_location_lng FLOAT8;
