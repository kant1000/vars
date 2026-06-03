-- ============================================================
-- VARS — Service Taxonomy V2
-- Replaces fixed master catalogue (service_categories + services)
-- with free-name vendor_services organised under a two-level
-- taxonomy (L1: hair / barber / face / nails).
-- Introduces booking_services join table for multi-service bookings.
-- ============================================================

-- ============================================================
-- STEP 1: Break bookings dependency on old vendor_services
--
-- Drop FK + column before we can drop the old vendor_services table.
-- New multi-service bookings reference vendor_services via the
-- booking_services join table instead.
-- ============================================================

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_vendor_service_id_fkey;
ALTER TABLE bookings DROP COLUMN IF EXISTS vendor_service_id;

-- Add canonical new columns (nullable — existing bookings not backfilled)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS total_amount    INTEGER,
  ADD COLUMN IF NOT EXISTS service_summary TEXT;

-- ============================================================
-- STEP 2: Lock new columns against client JWT writes
--
-- Mirrors the same guard pattern as the transport_surcharge migration.
-- Recreate both update policies to include total_amount and
-- service_summary in the frozen-column list.
-- Service role (edge functions) bypasses RLS and writes freely.
-- ============================================================

DROP POLICY IF EXISTS "bookings_user_update" ON bookings;
CREATE POLICY "bookings_user_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
    AND total_amount IS NOT DISTINCT FROM
        (SELECT b.total_amount FROM bookings b WHERE b.id = bookings.id)
    AND service_summary IS NOT DISTINCT FROM
        (SELECT b.service_summary FROM bookings b WHERE b.id = bookings.id)
  );

DROP POLICY IF EXISTS "bookings_vendor_update" ON bookings;
CREATE POLICY "bookings_vendor_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = vendor_id)
  WITH CHECK (
    auth.uid() = vendor_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
    AND total_amount IS NOT DISTINCT FROM
        (SELECT b.total_amount FROM bookings b WHERE b.id = bookings.id)
    AND service_summary IS NOT DISTINCT FROM
        (SELECT b.service_summary FROM bookings b WHERE b.id = bookings.id)
  );

-- ============================================================
-- STEP 3: Drop old catalogue tables
--
-- vendor_services FK to services already cleared above.
-- services FK to service_categories cleared by dropping services.
-- ============================================================

DROP TABLE IF EXISTS vendor_services;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS service_categories;

-- ============================================================
-- STEP 4: New taxonomy enums
-- ============================================================

CREATE TYPE category_l1_enum AS ENUM ('hair', 'barber', 'face', 'nails');

CREATE TYPE category_l2_enum AS ENUM (
  -- hair
  'braids', 'weaves', 'locs', 'natural', 'relaxed',
  -- barber
  'cuts', 'shaves', 'beard', 'colour',
  -- face
  'makeup', 'skincare', 'lashes', 'brows',
  -- nails
  'manicure', 'pedicure', 'nail_art'
);

-- ============================================================
-- STEP 5: L2 → L1 validation function
-- Must exist before the CHECK constraint in vendor_services.
-- ============================================================

CREATE OR REPLACE FUNCTION valid_l2_for_l1(l1 category_l1_enum, l2 category_l2_enum)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE l1
    WHEN 'hair'   THEN l2 IN ('braids', 'weaves', 'locs', 'natural', 'relaxed')
    WHEN 'barber' THEN l2 IN ('cuts', 'shaves', 'beard', 'colour')
    WHEN 'face'   THEN l2 IN ('makeup', 'skincare', 'lashes', 'brows')
    WHEN 'nails'  THEN l2 IN ('manicure', 'pedicure', 'nail_art')
    ELSE FALSE
  END;
$$;

-- ============================================================
-- STEP 6: New vendor_services table
--
-- Free-name services organised under L1/L2 taxonomy.
-- duration_blocks keeps the existing 30-min block convention
-- used throughout the codebase (1 block = 30 minutes).
-- price_kobo keeps the *_kobo naming convention.
-- Minimum price: ₦10,000 = 1,000,000 kobo.
-- ============================================================

CREATE TABLE vendor_services (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_l1     category_l1_enum NOT NULL,
  category_l2     category_l2_enum NOT NULL,
  service_name    TEXT NOT NULL
                    CHECK (CHAR_LENGTH(service_name) BETWEEN 2 AND 60),
  description     TEXT
                    CHECK (description IS NULL OR CHAR_LENGTH(description) <= 200),
  price_kobo      INTEGER NOT NULL
                    CHECK (price_kobo >= 1000000),
  duration_blocks INTEGER NOT NULL DEFAULT 2
                    CHECK (duration_blocks BETWEEN 1 AND 48),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_l2_for_l1_check CHECK (valid_l2_for_l1(category_l1, category_l2))
);

COMMENT ON TABLE vendor_services IS 'Free-name services per vendor. Taxonomy V2: L1 (hair/barber/face/nails) + L2 subcategory.';
COMMENT ON COLUMN vendor_services.price_kobo IS 'Price in kobo. Min ₦10,000 = 1,000,000 kobo.';
COMMENT ON COLUMN vendor_services.duration_blocks IS '1 block = 30 minutes. Max 48 = 24 hours.';

-- ============================================================
-- STEP 7: booking_services join table
--
-- One row per service included in a booking.
-- Snapshots service_name and price_kobo at booking time
-- so vendor edits after booking do not affect existing records.
-- No INSERT policy — only the service-role webhook can create rows.
-- ============================================================

CREATE TABLE booking_services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  vendor_service_id UUID NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  service_name      TEXT    NOT NULL,
  price_kobo        INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE booking_services IS 'Services included in a booking. Snapshot at booking time.';

-- ============================================================
-- STEP 8: Indexes
-- ============================================================

CREATE INDEX idx_vendor_services_vendor_id   ON vendor_services(vendor_id);
CREATE INDEX idx_vendor_services_category_l1 ON vendor_services(category_l1);
CREATE INDEX idx_vendor_services_active      ON vendor_services(vendor_id, is_active);
CREATE INDEX idx_booking_services_booking_id ON booking_services(booking_id);

-- ============================================================
-- STEP 9: Fix profiles.last_tab CHECK constraint
--
-- Old categories: barbing / hair_styling / makeovers
-- New L1 categories: hair / barber / face / nails
-- Dynamically find and drop the old constraint by inspecting
-- pg_constraint so this is safe regardless of the auto-generated name.
-- ============================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'profiles'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%last_tab%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END;
$$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_last_tab_check
    CHECK (last_tab IN ('hair', 'barber', 'face', 'nails'));

ALTER TABLE profiles ALTER COLUMN last_tab SET DEFAULT 'hair';

-- ============================================================
-- STEP 10: RLS policies for vendor_services
-- ============================================================

ALTER TABLE vendor_services ENABLE ROW LEVEL SECURITY;

-- Vendors manage their own services (all operations)
CREATE POLICY "vendor_services_vendor_manage"
  ON vendor_services FOR ALL
  USING (auth.uid() = vendor_id);

-- Customers can read active services
CREATE POLICY "vendor_services_customer_read"
  ON vendor_services FOR SELECT
  USING (is_active = TRUE);

-- ============================================================
-- STEP 11: RLS policies for booking_services
--
-- No INSERT policy: only service-role (webhook) can create rows.
-- Vendor reads via correlated subquery on bookings.vendor_id.
-- Customer reads via correlated subquery on bookings.user_id.
-- ============================================================

ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_services_vendor_select"
  ON booking_services FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_services.booking_id
        AND b.vendor_id = auth.uid()
    )
  );

CREATE POLICY "booking_services_customer_select"
  ON booking_services FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = booking_services.booking_id
        AND b.user_id = auth.uid()
    )
  );

-- ============================================================
-- STEP 12: Vendor service count limit trigger
--
-- Max 10 active services per vendor.
-- Fires on INSERT (new service) and UPDATE (reactivation).
-- On UPDATE, excludes the row being updated from the count.
-- ============================================================

CREATE OR REPLACE FUNCTION check_vendor_service_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    IF (
      SELECT COUNT(*)
      FROM vendor_services
      WHERE vendor_id = NEW.vendor_id
        AND is_active = TRUE
        AND (TG_OP = 'INSERT' OR id != NEW.id)
    ) >= 10 THEN
      RAISE EXCEPTION 'vendor_service_limit_exceeded';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vendor_service_limit
  BEFORE INSERT OR UPDATE ON vendor_services
  FOR EACH ROW EXECUTE FUNCTION check_vendor_service_limit();

-- ============================================================
-- STEP 13: Replace get_nearby_vendors
--
-- Changes from previous version:
-- • Removes the services/service_categories join (tables dropped)
-- • Aggregates category_l1 values from new vendor_services
-- • category_slug param kept (optional, ignored) for safe rollout:
--   old mobile app calls still pass it; new app omits it.
--   Client-side L1 filtering replaces server-side slug filtering.
-- • profile_image_url preserved from trust-layer migration
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
      v.kyc_status   = 'verified'
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
      MIN(vs.price_kobo)                                               AS price_from,
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
  ORDER BY vb.is_online DESC, vb.distance_km ASC
  LIMIT lim OFFSET ofst;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_vendors TO anon, authenticated;
