-- Add kyc_verified_at to get_nearby_vendors so the discovery feed card can
-- cache-bust the profile photo the same way the vendor detail page already
-- does (see a6a7b80 "stale cached profile photo" fix, which only covered
-- the vendor's own profile + the customer-facing vendor detail page, not
-- this RPC / the VendorCard used on the discovery feed).
-- Return type is changing (new kyc_verified_at column), so CREATE OR REPLACE
-- alone would fail with "cannot change return type of existing function".
DROP FUNCTION IF EXISTS public.get_nearby_vendors(double precision, double precision, text, double precision, integer, integer);

CREATE FUNCTION public.get_nearby_vendors(lat double precision, lng double precision, category_slug text DEFAULT NULL::text, radius_km double precision DEFAULT 25, lim integer DEFAULT 50, ofst integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, bio text, profile_image_url text, kyc_verified_at timestamptz, base_location_lat double precision, base_location_lng double precision, distance_km double precision, is_online boolean, is_busy boolean, avg_rating numeric, total_reviews integer, badge_vars_choice boolean, badge_top_rated boolean, badge_verified boolean, badge_new boolean, pioneer boolean, price_from integer, category_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH vendor_base AS (
    SELECT
      v.id,
      v.full_name,
      v.bio,
      v.profile_image_url,
      v.kyc_verified_at,
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
    vb.kyc_verified_at,
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_nearby_vendors(double precision, double precision, text, double precision, integer, integer) TO anon, authenticated;
