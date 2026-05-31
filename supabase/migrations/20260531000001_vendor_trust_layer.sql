-- Migration: Vendor trust layer — KYC identity image columns, RLS, storage, discovery fn
--
-- 1. Adds profile_image_url, profile_image_raw_url, profile_image_locked to vendors
-- 2. Replaces vendors_update_own RLS policy to block client writes on the three new columns
--    (service role used by edge functions bypasses RLS and can write freely)
-- 3. Creates vendor-identity-images storage bucket (public read — profile images appear
--    in the customer discovery feed and must be loadable without auth headers in mobile)
-- 4. Replaces get_nearby_vendors to surface profile_image_url instead of profile_photo_url

-- ============================================================
-- 1. Columns
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN profile_image_url      TEXT,
  ADD COLUMN profile_image_raw_url  TEXT,
  ADD COLUMN profile_image_locked   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vendors.profile_image_url     IS 'Cropped profile image from Youverify liveness capture. Set by vendor-kyc-webhook. Locked — client writes blocked by RLS.';
COMMENT ON COLUMN vendors.profile_image_raw_url IS 'Original uncropped liveness capture. Admin audit only. Locked — client writes blocked by RLS.';
COMMENT ON COLUMN vendors.profile_image_locked  IS 'TRUE once set by KYC webhook. Prevents all client-side overwrite attempts.';

-- ============================================================
-- 2. RLS: replace vendors_update_own
--
-- PostgreSQL RLS WITH CHECK does not expose OLD values directly.
-- A correlated subquery reads the current stored value so that any
-- attempt by a vendor client to change the three locked columns fails.
-- Service role bypasses RLS entirely — the webhook writes go through.
-- ============================================================

DROP POLICY "vendors_update_own" ON vendors;

CREATE POLICY "vendors_update_own"
  ON vendors FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND profile_image_url IS NOT DISTINCT FROM
        (SELECT v.profile_image_url FROM vendors v WHERE v.id = auth.uid())
    AND profile_image_raw_url IS NOT DISTINCT FROM
        (SELECT v.profile_image_raw_url FROM vendors v WHERE v.id = auth.uid())
    AND profile_image_locked IS NOT DISTINCT FROM
        (SELECT v.profile_image_locked FROM vendors v WHERE v.id = auth.uid())
  );

-- ============================================================
-- 3. Storage bucket: vendor-identity-images
--
-- Public = true so that profile.jpg URLs work in React Native <Image>
-- without requiring custom auth headers on every render.
-- The raw.jpg audit URL is only stored in profile_image_raw_url,
-- a column only visible to the vendor themselves and admin clients.
-- Write access: no client INSERT/UPDATE/DELETE policies — only service
-- role (which bypasses RLS) can upload via the webhook.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vendor-identity-images',
  'vendor-identity-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. get_nearby_vendors: return profile_image_url
--
-- Replaces profile_photo_url with profile_image_url in the return
-- signature and body. CREATE OR REPLACE is safe — no signature change
-- beyond the column alias, so callers must update their field reference.
-- ============================================================

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
      v.kyc_status    = 'verified'
      AND v.is_active     = TRUE
      AND v.is_suspended  = FALSE
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
      MIN(vs.price_kobo)                          AS price_from,
      ARRAY_AGG(DISTINCT sc.name ORDER BY sc.name) AS category_names
    FROM vendor_services vs
    JOIN services s           ON s.id  = vs.service_id
    JOIN service_categories sc ON sc.id = s.category_id
    WHERE (category_slug IS NULL OR sc.slug = category_slug)
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
  ORDER BY vb.is_online DESC, vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
