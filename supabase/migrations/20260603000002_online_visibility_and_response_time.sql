-- ============================================================
-- Migration 20260603000002: Online = visibility + avg response time
--
-- Changes:
-- 1. vendors.avg_response_minutes — rolling average of how quickly a
--    vendor manually accepts booking requests (EMA, 80/20 weight).
--    NULL = not enough data. Auto-accepted bookings are excluded.
-- 2. Trigger update_vendor_avg_response — fires after a booking moves
--    from pending → accepted (manual only) and updates the EMA.
-- 3. get_nearby_vendors — add AND v.is_online = TRUE so offline vendors
--    are invisible to customers. Sort changed to distance-only since
--    all returned vendors are online.
-- ============================================================

-- 1. Add avg_response_minutes to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS avg_response_minutes INT;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION update_vendor_avg_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_mins DOUBLE PRECISION;
BEGIN
  -- Only count manual acceptances; auto-accepted bookings skip this
  IF NEW.status = 'accepted'
     AND OLD.status = 'pending'
     AND (NEW.auto_accepted IS NULL OR NEW.auto_accepted = FALSE)
  THEN
    response_mins := EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 60.0;

    UPDATE vendors
    SET avg_response_minutes = ROUND(
      COALESCE(avg_response_minutes, response_mins) * 0.8
      + response_mins * 0.2
    )::INT
    WHERE id = NEW.vendor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendor_response_time ON bookings;
CREATE TRIGGER trg_vendor_response_time
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status = 'pending')
  EXECUTE FUNCTION update_vendor_avg_response();

-- 3. get_nearby_vendors: filter to is_online=TRUE, sort by distance only
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
  avg_rating        NUMERIC,
  total_reviews     INT,
  badge_vars_choice BOOLEAN,
  badge_top_rated   BOOLEAN,
  badge_verified    BOOLEAN,
  badge_new         BOOLEAN,
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
      v.avg_rating,
      v.total_reviews,
      v.badge_vars_choice,
      v.badge_top_rated,
      TRUE                             AS badge_verified,
      (v.created_at > NOW() - INTERVAL '30 days') AS badge_new
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
      MIN(vs.price_kobo)                                                    AS price_from,
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
    vb.avg_rating,
    vb.total_reviews,
    vb.badge_vars_choice,
    vb.badge_top_rated,
    vb.badge_verified,
    vb.badge_new,
    vsa.price_from,
    COALESCE(vsa.category_names, '{}') AS category_names
  FROM vendor_base vb
  INNER JOIN vendor_services_agg vsa ON vsa.vendor_id = vb.id
  ORDER BY vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
