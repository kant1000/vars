-- ============================================================
-- Migration 20260718000002: get_nearby_vendors returns per-service detail
--
-- Customer home search only matched full_name. Search is being
-- redirected to match what a vendor actually offers instead of who
-- they are: each service's subcategory (category_l2), service_name,
-- and description. Adds a `services` JSONB array (one object per
-- vendor_services row: category_l2, service_name, description)
-- alongside the existing category_names, so the client can score
-- and rank matches per field. No new round trip: still the same
-- single fetch.
--
-- Built on top of the function's actual live shape (20260603000002),
-- not the local-only 20260713000001_vendor_busy_status.sql file --
-- that migration was never applied to this project (is_busy/pioneer
-- don't exist on the live vendors table), discovered when this
-- migration first failed against the assumed shape.
-- ============================================================

DROP FUNCTION IF EXISTS get_nearby_vendors(double precision, double precision, text, double precision, integer, integer);

CREATE FUNCTION get_nearby_vendors(
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
  category_names    TEXT[],
  services          JSONB
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
      MIN(vs.price_kobo)                                                     AS price_from,
      ARRAY_AGG(DISTINCT vs.category_l1::TEXT ORDER BY vs.category_l1::TEXT) AS category_names,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'category_l2', vs.category_l2::TEXT,
          'service_name', vs.service_name,
          'description', vs.description
        )
      ) AS services
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
    COALESCE(vsa.category_names, '{}') AS category_names,
    COALESCE(vsa.services, '[]'::jsonb) AS services
  FROM vendor_base vb
  INNER JOIN vendor_services_agg vsa ON vsa.vendor_id = vb.id
  ORDER BY vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
