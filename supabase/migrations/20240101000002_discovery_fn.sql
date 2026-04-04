-- ============================================================
-- VARS Migration 003: Vendor Discovery RPC (PostGIS)
-- get_nearby_vendors(lat, lng, category_slug, radius_km)
-- Returns vendor cards sorted by distance, only online/verified vendors.
-- Called via supabase.rpc('get_nearby_vendors', {...})
-- ============================================================

CREATE OR REPLACE FUNCTION get_nearby_vendors(
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  category_slug TEXT    DEFAULT NULL,   -- NULL = all categories
  radius_km    DOUBLE PRECISION DEFAULT 25,
  lim          INT     DEFAULT 50,
  ofst         INT     DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  full_name         TEXT,
  bio               TEXT,
  profile_photo_url TEXT,
  base_location_lat DOUBLE PRECISION,
  base_location_lng DOUBLE PRECISION,
  distance_km       DOUBLE PRECISION,
  is_online         BOOLEAN,
  rating            NUMERIC,
  review_count      INT,
  badge_vars_choice BOOLEAN,
  badge_top_rated   BOOLEAN,
  badge_verified    BOOLEAN,
  badge_new         BOOLEAN,
  price_from        INT,   -- kobo (cheapest active vendor_service)
  category_names    TEXT[] -- distinct categories vendor offers
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
      v.profile_photo_url,
      ST_Y(v.base_location::geometry) AS base_location_lat,
      ST_X(v.base_location::geometry) AS base_location_lng,
      ST_Distance(
        v.base_location,
        ST_MakePoint(lng, lat)::geography
      ) / 1000.0 AS distance_km,
      v.is_online,
      v.rating,
      v.review_count,
      v.badge_vars_choice,
      v.badge_top_rated,
      v.badge_verified,
      v.badge_new,
      v.kyc_status
    FROM vendors v
    WHERE
      v.kyc_status = 'verified'
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
      MIN(vs.price_kobo) AS price_from,
      ARRAY_AGG(DISTINCT sc.name ORDER BY sc.name) AS category_names
    FROM vendor_services vs
    JOIN services s ON s.id = vs.service_id
    JOIN service_categories sc ON sc.id = s.category_id
    WHERE vs.is_available = true
      AND (category_slug IS NULL OR sc.slug = category_slug)
    GROUP BY vs.vendor_id
  )
  SELECT
    vb.id,
    vb.full_name,
    vb.bio,
    vb.avatar_url,
    vb.base_location_lat,
    vb.base_location_lng,
    ROUND(vb.distance_km::numeric, 1)::double precision AS distance_km,
    vb.is_online,
    vb.rating,
    vb.review_count,
    vb.badge_vars_choice,
    vb.badge_top_rated,
    vb.badge_verified,
    vb.badge_new,
    vsa.price_from,
    COALESCE(vsa.category_names, '{}') AS category_names
  FROM vendor_base vb
  INNER JOIN vendor_services_agg vsa ON vsa.vendor_id = vb.id
  ORDER BY vb.is_online DESC, vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

-- Grant execute to anon and authenticated (RLS still applies on tables)
GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
