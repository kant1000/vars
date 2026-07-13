-- ============================================================
-- Migration 20260713000001: Vendor busy status
--
-- Adds is_busy to vendors, maintained by a trigger on bookings.
-- Busy = vendor has an active booking in on_way, arrived, or
-- service_rendered. on_way (transport buffer) counts as busy.
-- Updates get_nearby_vendors to return is_busy.
-- ============================================================

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_busy BOOLEAN NOT NULL DEFAULT false;

-- Trigger function: keep is_busy in sync with booking transitions
CREATE OR REPLACE FUNCTION sync_vendor_busy_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('on_way', 'arrived', 'service_rendered') THEN
    UPDATE vendors SET is_busy = true WHERE id = NEW.vendor_id;
  ELSE
    -- Only clear if no other booking is still in a busy state
    UPDATE vendors SET is_busy = false
    WHERE id = NEW.vendor_id
      AND NOT EXISTS (
        SELECT 1 FROM bookings
        WHERE vendor_id = NEW.vendor_id
          AND id <> NEW.id
          AND status IN ('on_way', 'arrived', 'service_rendered')
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_busy_status ON bookings;
CREATE TRIGGER trg_vendor_busy_status
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION sync_vendor_busy_status();

-- Update get_nearby_vendors to return is_busy alongside is_online
CREATE OR REPLACE FUNCTION get_nearby_vendors(
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  category_slug TEXT             DEFAULT NULL,
  radius_km     DOUBLE PRECISION DEFAULT 25,
  lim           INT              DEFAULT 50,
  ofst          INT              DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  full_name         TEXT,
  bio               TEXT,
  profile_image_url TEXT,
  base_location_lat DOUBLE PRECISION,
  base_location_lng DOUBLE PRECISION,
  distance_km       DOUBLE PRECISION,
  is_online         BOOLEAN,
  is_busy           BOOLEAN,
  avg_rating        NUMERIC,
  total_reviews     INT,
  badge_vars_choice BOOLEAN,
  badge_top_rated   BOOLEAN,
  badge_verified    BOOLEAN,
  badge_new         BOOLEAN,
  pioneer           BOOLEAN,
  price_from        INT,
  category_names    TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH vendor_base AS (
    SELECT
      v.id,
      v.full_name,
      v.bio,
      v.profile_image_url,
      ST_Y(v.base_location::geometry)  AS base_location_lat,
      ST_X(v.base_location::geometry)  AS base_location_lng,
      ST_Distance(
        v.base_location,
        ST_MakePoint(lng, lat)::geography
      ) / 1000.0                       AS distance_km,
      v.is_online,
      v.is_busy,
      v.avg_rating,
      v.total_reviews,
      v.badge_vars_choice,
      v.badge_top_rated,
      TRUE                             AS badge_verified,
      (v.created_at > NOW() - INTERVAL '30 days') AS badge_new,
      v.pioneer
    FROM vendors v
    WHERE
      v.is_online    = TRUE
      AND v.kyc_status   = 'verified'
      AND v.is_active    = TRUE
      AND v.is_suspended = FALSE
      AND v.base_location IS NOT NULL
      AND ST_DWithin(
        v.base_location,
        ST_MakePoint(lng, lat)::geography,
        radius_km * 1000
      )
  ),
  vendor_services_agg AS (
    SELECT
      vs.vendor_id,
      MIN(vs.price_kobo)                                                      AS price_from,
      ARRAY_AGG(DISTINCT vs.category_l1::TEXT ORDER BY vs.category_l1::TEXT) AS category_names
    FROM vendor_services vs
    WHERE vs.is_active = TRUE
    GROUP BY vs.vendor_id
  )
  SELECT
    vb.id,
    vb.full_name,
    vb.bio,
    vb.profile_image_url,
    vb.base_location_lat,
    vb.base_location_lng,
    ROUND(vb.distance_km::numeric, 1)::double precision AS distance_km,
    vb.is_online,
    vb.is_busy,
    vb.avg_rating,
    vb.total_reviews,
    vb.badge_vars_choice,
    vb.badge_top_rated,
    vb.badge_verified,
    vb.badge_new,
    vb.pioneer,
    vsa.price_from,
    COALESCE(vsa.category_names, '{}') AS category_names
  FROM vendor_base vb
  INNER JOIN vendor_services_agg vsa ON vsa.vendor_id = vb.id
  ORDER BY vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
