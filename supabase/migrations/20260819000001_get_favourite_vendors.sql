-- Favorites list screen needs the same vendor shape VendorCard already
-- renders (get_nearby_vendors), but scoped to the caller's favourited
-- vendors instead of a lat/lng radius. Distance has no meaning here, so
-- it's omitted — VendorCard's showDistance=false hides that part of the UI.
CREATE FUNCTION public.get_favourite_vendors()
 RETURNS TABLE(id uuid, full_name text, bio text, profile_image_url text, kyc_verified_at timestamptz, is_online boolean, is_busy boolean, avg_rating numeric, total_reviews integer, badge_vars_choice boolean, badge_top_rated boolean, badge_verified boolean, badge_new boolean, pioneer boolean, price_from integer, category_names text[], cheapest_by_category jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
  WITH vendor_base AS (
    SELECT
      v.id,
      v.full_name,
      v.bio,
      v.profile_image_url,
      v.kyc_verified_at,
      v.is_online,
      v.is_busy,
      v.avg_rating,
      v.total_reviews,
      v.badge_vars_choice,
      v.badge_top_rated,
      TRUE                             AS badge_verified,
      (v.created_at > NOW() - INTERVAL '30 days') AS badge_new,
      v.pioneer,
      f.created_at                     AS favourited_at
    FROM favourites f
    INNER JOIN vendors v ON v.id = f.vendor_id
    WHERE
      f.user_id      = auth.uid()
      AND v.kyc_status   = 'verified'
      AND v.is_active    = TRUE
      AND v.is_suspended = FALSE
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
  vendor_l1_stats AS (
    SELECT
      vs.vendor_id,
      vs.category_l1::text AS category_l1,
      COUNT(*)             AS service_count
    FROM vendor_services vs
    WHERE vs.is_active = TRUE
    GROUP BY vs.vendor_id, vs.category_l1
  ),
  vendor_l1_cheapest AS (
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
      c.vendor_id,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'category_l1', c.category_l1,
          'category_l2', c.category_l2,
          'price_kobo', c.price_kobo,
          'service_count', s.service_count
        )
        ORDER BY c.category_l1
      ) AS cheapest_by_category
    FROM vendor_l1_cheapest c
    INNER JOIN vendor_l1_stats s ON s.vendor_id = c.vendor_id AND s.category_l1 = c.category_l1
    GROUP BY c.vendor_id
  )
  SELECT
    vb.id,
    vb.full_name,
    vb.bio,
    vb.profile_image_url,
    vb.kyc_verified_at,
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
  ORDER BY vb.favourited_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_favourite_vendors() TO authenticated;
