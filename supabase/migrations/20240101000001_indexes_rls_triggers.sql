-- ============================================================
-- VARS — Indexes, RLS Policies, Triggers & Functions
-- Phase 1 (part 2)
-- ============================================================

-- ============================================================
-- INDEXES
-- ============================================================

-- Spatial indexes (PostGIS) — critical for location-based discovery
CREATE INDEX idx_vendors_base_location      ON vendors USING GIST (base_location);
CREATE INDEX idx_vendors_live_location      ON vendors USING GIST (live_location);
CREATE INDEX idx_profiles_base_location     ON profiles USING GIST (base_location);
CREATE INDEX idx_profiles_session_location  ON profiles USING GIST (session_location);
CREATE INDEX idx_bookings_user_location     ON bookings USING GIST (user_location);

-- Vendor discovery filters
CREATE INDEX idx_vendors_is_online          ON vendors (is_online)    WHERE is_online = TRUE;
CREATE INDEX idx_vendors_is_active          ON vendors (is_active)    WHERE is_active = TRUE;
CREATE INDEX idx_vendors_is_suspended       ON vendors (is_suspended) WHERE is_suspended = FALSE;
CREATE INDEX idx_vendors_kyc_status         ON vendors (kyc_status);

-- Booking lookups
CREATE INDEX idx_bookings_user_id           ON bookings (user_id);
CREATE INDEX idx_bookings_vendor_id         ON bookings (vendor_id);
CREATE INDEX idx_bookings_status            ON bookings (status);
CREATE INDEX idx_bookings_scheduled_at      ON bookings (scheduled_at);
-- Auto-release cron job scans this index
CREATE INDEX idx_bookings_auto_release_at   ON bookings (auto_release_at)
  WHERE auto_release_at IS NOT NULL AND status = 'service_rendered';
-- Phone reveal cron scans this
CREATE INDEX idx_bookings_phone_reveal      ON bookings (scheduled_at)
  WHERE phone_revealed = FALSE AND status = 'accepted';

-- Vendor services
CREATE INDEX idx_vendor_services_vendor_id  ON vendor_services (vendor_id);
CREATE INDEX idx_vendor_services_service_id ON vendor_services (service_id);

-- Vendor unavailability — availability calculation queries
CREATE INDEX idx_vendor_unavailability_lookup
  ON vendor_unavailability (vendor_id, start_time, end_time);

-- Portfolio photos
CREATE INDEX idx_portfolio_photos_vendor_id ON portfolio_photos (vendor_id)
  WHERE is_consented = TRUE;

-- Notifications — inbox queries
CREATE INDEX idx_notifications_recipient    ON notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_unread       ON notifications (recipient_id, is_read)
  WHERE is_read = FALSE;

-- Reviews
CREATE INDEX idx_reviews_vendor_id          ON reviews (vendor_id);
CREATE INDEX idx_reviews_user_id            ON reviews (user_id);

-- Disputes — admin queue sorted oldest-first
CREATE INDEX idx_disputes_open              ON disputes (created_at ASC)
  WHERE status = 'open';

-- Payout history
CREATE INDEX idx_payout_history_vendor_id   ON payout_history (vendor_id, created_at DESC);
CREATE INDEX idx_payout_history_booking_id  ON payout_history (booking_id);

-- Favourites
CREATE INDEX idx_favourites_user_id         ON favourites (user_id);


-- ============================================================
-- HELPER FUNCTIONS
-- Used in RLS policies and business logic
-- ============================================================

-- Check if the current authenticated user is a VARS admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users WHERE id = auth.uid()
  );
$$;

-- Check if the current authenticated user is a vendor
CREATE OR REPLACE FUNCTION is_vendor()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vendors WHERE id = auth.uid()
  );
$$;

-- Check if the current authenticated user is a customer (profile)
CREATE OR REPLACE FUNCTION is_customer()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
  );
$$;

-- Calculate distance in km between two geography points
CREATE OR REPLACE FUNCTION distance_km(point_a GEOGRAPHY, point_b GEOGRAPHY)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT ROUND((ST_Distance(point_a, point_b) / 1000)::NUMERIC, 2);
$$;

-- Compute cancellation fee split per spec §5 policy table
-- Returns (fee_percent, vars_share_percent, vendor_share_percent)
CREATE OR REPLACE FUNCTION get_cancellation_policy(
  booking_created_at TIMESTAMPTZ,
  service_scheduled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  fee_percent            INT,
  vars_share_percent     INT,
  vendor_share_percent   INT,
  refund_percent         INT
)
LANGUAGE PLPGSQL
STABLE
AS $$
DECLARE
  mins_since_booking  NUMERIC;
  mins_to_service     NUMERIC;
BEGIN
  mins_since_booking := EXTRACT(EPOCH FROM (cancelled_at - booking_created_at)) / 60;
  mins_to_service    := EXTRACT(EPOCH FROM (service_scheduled_at - cancelled_at)) / 60;

  -- Within 1 hour of service time — non-refundable
  IF mins_to_service <= 60 THEN
    RETURN QUERY SELECT 100, 30, 70, 0;
  -- 0–15 minutes after booking
  ELSIF mins_since_booking <= 15 THEN
    RETURN QUERY SELECT 15, 10, 5, 85;
  -- 15 minutes – 1 hour after booking
  ELSIF mins_since_booking <= 60 THEN
    RETURN QUERY SELECT 50, 30, 20, 50;
  -- Beyond 1 hour after booking (default — same as 15min-1hr band)
  ELSE
    RETURN QUERY SELECT 50, 30, 20, 50;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_cancellation_policy IS
  'Returns fee splits per §5 cancellation policy table. Used in booking cancellation edge function.';


-- ============================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE services                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_unavailability     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE favourites                ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users               ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- RLS POLICIES — PROFILES
-- ============================================================

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles_admin_all"
  ON profiles FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — VENDORS
-- ============================================================

-- Public can view active, non-suspended vendors (discovery feed)
CREATE POLICY "vendors_select_active"
  ON vendors FOR SELECT
  USING (is_active = TRUE AND is_suspended = FALSE);

-- Vendors can always view their own profile (even if pending/suspended)
CREATE POLICY "vendors_select_own"
  ON vendors FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "vendors_insert_own"
  ON vendors FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "vendors_update_own"
  ON vendors FOR UPDATE
  USING (auth.uid() = id);

-- Admins have full access
CREATE POLICY "vendors_admin_all"
  ON vendors FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — SERVICE CATEGORIES & SERVICES
-- Public read — no auth required for browsing
-- ============================================================

CREATE POLICY "service_categories_public_read"
  ON service_categories FOR SELECT
  USING (TRUE);

CREATE POLICY "services_public_read"
  ON services FOR SELECT
  USING (TRUE);

-- Only admins can insert/update master service data
CREATE POLICY "service_categories_admin_write"
  ON service_categories FOR ALL
  USING (is_admin());

CREATE POLICY "services_admin_write"
  ON services FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — VENDOR SERVICES
-- ============================================================

-- Anyone can read vendor services (needed for profile browsing before auth)
CREATE POLICY "vendor_services_public_read"
  ON vendor_services FOR SELECT
  USING (TRUE);

-- Vendors manage their own services
CREATE POLICY "vendor_services_vendor_manage"
  ON vendor_services FOR ALL
  USING (auth.uid() = vendor_id);

CREATE POLICY "vendor_services_admin_all"
  ON vendor_services FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — VENDOR UNAVAILABILITY
-- ============================================================

-- Anyone can read for availability calculation
CREATE POLICY "vendor_unavailability_public_read"
  ON vendor_unavailability FOR SELECT
  USING (TRUE);

CREATE POLICY "vendor_unavailability_vendor_manage"
  ON vendor_unavailability FOR ALL
  USING (auth.uid() = vendor_id);

CREATE POLICY "vendor_unavailability_admin_all"
  ON vendor_unavailability FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — PORTFOLIO PHOTOS
-- ============================================================

-- Only consented photos are publicly visible
CREATE POLICY "portfolio_photos_public_read"
  ON portfolio_photos FOR SELECT
  USING (is_consented = TRUE);

-- Vendors can view all their own photos (including pending consent)
CREATE POLICY "portfolio_photos_vendor_select_own"
  ON portfolio_photos FOR SELECT
  USING (auth.uid() = vendor_id);

CREATE POLICY "portfolio_photos_vendor_manage"
  ON portfolio_photos FOR ALL
  USING (auth.uid() = vendor_id);

CREATE POLICY "portfolio_photos_admin_all"
  ON portfolio_photos FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — BOOKINGS
-- ============================================================

-- Users can read and manage their own bookings
CREATE POLICY "bookings_user_select"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bookings_user_insert"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookings_user_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id);

-- Vendors can read and update their assigned bookings
CREATE POLICY "bookings_vendor_select"
  ON bookings FOR SELECT
  USING (auth.uid() = vendor_id);

CREATE POLICY "bookings_vendor_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = vendor_id);

-- Edge functions run as service role — bypass RLS for automated processes
-- (auto-release, phone reveal, settlement)

CREATE POLICY "bookings_admin_all"
  ON bookings FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — DISPUTES
-- ============================================================

-- Users can raise disputes for their own bookings
CREATE POLICY "disputes_user_insert"
  ON disputes FOR INSERT
  WITH CHECK (
    auth.uid() = raised_by
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = disputes.booking_id
        AND bookings.user_id = auth.uid()
    )
  );

-- Users can read their own disputes
CREATE POLICY "disputes_user_select"
  ON disputes FOR SELECT
  USING (auth.uid() = raised_by);

-- Vendors can read disputes on their bookings
CREATE POLICY "disputes_vendor_select"
  ON disputes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = disputes.booking_id
        AND bookings.vendor_id = auth.uid()
    )
  );

-- Admins manage all disputes (resolve, add notes)
CREATE POLICY "disputes_admin_all"
  ON disputes FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — REVIEWS
-- ============================================================

-- Anyone can read reviews (shown on vendor profiles)
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  USING (TRUE);

-- Users can only review completed bookings they made
CREATE POLICY "reviews_user_insert"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
        AND bookings.user_id = auth.uid()
        AND bookings.status = 'completed'
    )
  );

CREATE POLICY "reviews_admin_all"
  ON reviews FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — FAVOURITES
-- ============================================================

CREATE POLICY "favourites_user_manage"
  ON favourites FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- RLS POLICIES — NOTIFICATIONS
-- ============================================================

-- Recipients read and mark their own notifications
CREATE POLICY "notifications_recipient_select"
  ON notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "notifications_recipient_update"
  ON notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Insertion handled by edge functions via service role (bypasses RLS)
-- This policy allows the service role; app-layer inserts go through edge fns
CREATE POLICY "notifications_admin_all"
  ON notifications FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — NOTIFICATION PREFERENCES
-- ============================================================

CREATE POLICY "notification_prefs_user_manage"
  ON notification_preferences FOR ALL
  USING (auth.uid() = user_id);


-- ============================================================
-- RLS POLICIES — PAYOUT HISTORY
-- ============================================================

-- Vendors view their own payout history (earnings screen per spec §6.2)
CREATE POLICY "payout_history_vendor_select"
  ON payout_history FOR SELECT
  USING (auth.uid() = vendor_id);

-- Admins view all (Paystack reconciliation per spec §11.5)
CREATE POLICY "payout_history_admin_all"
  ON payout_history FOR ALL
  USING (is_admin());


-- ============================================================
-- RLS POLICIES — ADMIN USERS
-- ============================================================

CREATE POLICY "admin_users_admin_select"
  ON admin_users FOR SELECT
  USING (is_admin());


-- ============================================================
-- TRIGGERS & TRIGGER FUNCTIONS
-- ============================================================

-- Auto-update updated_at on every row update
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_vendor_services_updated_at
  BEFORE UPDATE ON vendor_services
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_payout_history_updated_at
  BEFORE UPDATE ON payout_history
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();


-- Set auto_release_at = service_rendered_at + 2 hours when service is marked rendered
-- Per spec §4.6 / §12.3: "Auto-release fires 2 hours after Service Rendered"
CREATE OR REPLACE FUNCTION fn_set_auto_release_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.service_rendered_at IS NOT NULL AND OLD.service_rendered_at IS NULL THEN
    NEW.auto_release_at := NEW.service_rendered_at + INTERVAL '2 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_set_auto_release
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_set_auto_release_at();


-- Update vendor avg_rating and total_reviews after every new review
CREATE OR REPLACE FUNCTION fn_update_vendor_rating()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE vendors
  SET
    avg_rating    = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM reviews WHERE vendor_id = NEW.vendor_id),
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE vendor_id = NEW.vendor_id),
    -- Automatically award Top Rated badge if avg >= 4.5 with at least 10 reviews
    badge_top_rated = (
      SELECT (ROUND(AVG(rating)::NUMERIC, 2) >= 4.50 AND COUNT(*) >= 10)
      FROM reviews WHERE vendor_id = NEW.vendor_id
    )
  WHERE id = NEW.vendor_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_vendor_rating
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION fn_update_vendor_rating();


-- Clear vendor live_location when they go Offline (privacy per spec §7)
CREATE OR REPLACE FUNCTION fn_clear_live_location_on_offline()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  IF NEW.is_online = FALSE AND OLD.is_online = TRUE THEN
    NEW.live_location            := NULL;
    NEW.live_location_updated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vendor_clear_location_on_offline
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION fn_clear_live_location_on_offline();


-- Create a default profile row when a new auth.users entry is created
-- (called via Supabase Auth hook — user_type determined by signup metadata)
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  user_type TEXT;
BEGIN
  -- user_type is passed in raw_user_meta_data at signup
  user_type := NEW.raw_user_meta_data->>'user_type';

  IF user_type = 'vendor' THEN
    INSERT INTO vendors (id, full_name, email, username, phone_number)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.email, ''),
      -- Temporary username — vendor updates in onboarding
      COALESCE(NEW.raw_user_meta_data->>'username', 'vendor_' || SUBSTRING(NEW.id::TEXT, 1, 8)),
      COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    -- Default: customer profile
    INSERT INTO profiles (id, full_name, email, phone_number)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Wire the trigger to auth.users (Supabase pattern)
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();


-- ============================================================
-- REALTIME — Enable publications for live tracking tables
-- Edge: bookings status, vendor live location
-- ============================================================

-- Drop existing publication if any, then recreate selectively
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Set REPLICA IDENTITY FULL so Realtime subscribers receive old + new row data
ALTER TABLE bookings   REPLICA IDENTITY FULL;
ALTER TABLE vendors    REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
