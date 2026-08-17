-- Discovery card price label needs to be section-aware: a vendor shown
-- under "Hair" should show its cheapest Hair L2 subcategory + price, and
-- the same vendor shown under "Nails" should show its cheapest Nails L2
-- subcategory + price — not one global "From ₦X" across every category.
--
-- Adds `cheapest_by_category jsonb` — one {category_l1, category_l2,
-- price_kobo} entry per L1 the vendor has active services in, each entry
-- being that vendor's single cheapest service within that L1.
--
-- Also retires the unused `services` jsonb column (added in
-- 20260718000002 for a subcategory-search feature that has since been
-- removed from the client — nothing reads it anymore).
DROP FUNCTION IF EXISTS public.get_nearby_vendors(double precision, double precision, text, double precision, integer, integer);

CREATE FUNCTION public.get_nearby_vendors(lat double precision, lng double precision, category_slug text DEFAULT NULL::text, radius_km double precision DEFAULT 25, lim integer DEFAULT 50, ofst integer DEFAULT 0)
 RETURNS TABLE(id uuid, full_name text, bio text, profile_image_url text, kyc_verified_at timestamptz, base_location_lat double precision, base_location_lng double precision, distance_km double precision, is_online boolean, is_busy boolean, avg_rating numeric, total_reviews integer, badge_vars_choice boolean, badge_top_rated boolean, badge_verified boolean, badge_new boolean, pioneer boolean, price_from integer, category_names text[], cheapest_by_category jsonb)
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
  ),
  vendor_l1_cheapest AS (
    -- One row per (vendor, L1): the single cheapest active service in
    -- that L1. Ties broken by category_l2 for a deterministic pick.
    SELECT DISTINCT ON (vs.vendor_id, vs.category_l1)
      vs.vendor_id,
      vs.category_l1::text AS category_l1,
      vs.category_l2::text AS category_l2,
      vs.price_kobo
    FROM vendor_services vs
    WHERE vs.is_active = TRUE
    ORDER BY vs.vendor_id, vs.category_l1, vs.price_kobo ASC, vs.category_l2::text ASC
  ),
  vendor_pricing_agg AS (
    SELECT
      vendor_id,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'category_l1', category_l1,
          'category_l2', category_l2,
          'price_kobo', price_kobo
        )
        ORDER BY category_l1
      ) AS cheapest_by_category
    FROM vendor_l1_cheapest
    GROUP BY vendor_id
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
    COALESCE(vsa.category_names, '{}') AS category_names,
    COALESCE(vpa.cheapest_by_category, '[]'::jsonb) AS cheapest_by_category
  FROM vendor_base vb
  INNER JOIN vendor_services_agg vsa ON vsa.vendor_id = vb.id
  LEFT JOIN vendor_pricing_agg vpa ON vpa.vendor_id = vb.id
  ORDER BY vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$function$;

GRANT EXECUTE ON FUNCTION public.get_nearby_vendors(double precision, double precision, text, double precision, integer, integer) TO anon, authenticated;
