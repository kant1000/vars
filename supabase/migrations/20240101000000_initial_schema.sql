-- ============================================================
-- VARS — Initial Database Schema
-- Phase 1: All tables, relationships, RLS policies
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE kyc_status_enum AS ENUM (
  'pending',    -- submitted, awaiting Youverify result
  'verified',   -- Youverify passed + admin approved
  'rejected'    -- failed verification, reason given
);

CREATE TYPE booking_status_enum AS ENUM (
  'pending',            -- payment authorized, awaiting vendor acceptance (2hr window)
  'accepted',           -- vendor accepted, payment captured, escrow begins
  'on_way',             -- vendor pressed "On My Way"
  'arrived',            -- vendor pressed "Arrived"
  'service_rendered',   -- vendor pressed "Service Rendered", awaiting user confirmation
  'completed',          -- user confirmed OR 2hr auto-release fired
  'cancelled',          -- cancelled by user (cancellation fee may apply)
  'expired',            -- vendor did not respond within 2 hours (auth released silently)
  'disputed'            -- user raised an issue, held for admin review
);

CREATE TYPE dispute_status_enum AS ENUM (
  'open',
  'resolved'
);

CREATE TYPE dispute_resolution_enum AS ENUM (
  'released_to_vendor',
  'refunded_to_user'
);

CREATE TYPE payout_status_enum AS ENUM (
  'pending',
  'success',
  'failed'
);

-- ============================================================
-- PROFILES (customer accounts)
-- Extends auth.users — one row per authenticated customer
-- ============================================================
CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL DEFAULT '',
  phone_number        TEXT,                        -- required at sign-up, editable with re-verification
  email               TEXT,
  profile_photo_url   TEXT,
  -- Location: session_location locked at home screen load, base_location is their saved home area
  base_location       GEOGRAPHY(POINT, 4326),
  session_location    GEOGRAPHY(POINT, 4326),      -- locked for the current booking session
  -- Tab preference: persisted across sessions per spec §12.3
  last_tab            TEXT NOT NULL DEFAULT 'barbing'
                        CHECK (last_tab IN ('barbing', 'hair_styling', 'makeovers')),
  push_token          TEXT,                        -- Expo push token for FCM/APNs
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Customer accounts. Extends auth.users.';
COMMENT ON COLUMN profiles.session_location IS 'Locked at home screen load — cannot change during booking flow.';
COMMENT ON COLUMN profiles.last_tab IS 'Persisted tab selection per §4.2 spec.';

-- ============================================================
-- VENDORS
-- Extends auth.users — one row per verified beauty professional
-- ============================================================
CREATE TABLE vendors (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                 TEXT NOT NULL DEFAULT '',
  username                  TEXT UNIQUE NOT NULL,
  phone_number              TEXT NOT NULL DEFAULT '',
  email                     TEXT NOT NULL DEFAULT '',
  profile_photo_url         TEXT,
  bio                       TEXT CHECK (CHAR_LENGTH(bio) <= 150),  -- 150 char max per spec §4.3

  -- Location
  base_location             GEOGRAPHY(POINT, 4326),               -- primary operating area, set at registration
  live_location             GEOGRAPHY(POINT, 4326),               -- updated in real-time when Online
  live_location_updated_at  TIMESTAMPTZ,

  -- Online/Offline status — gating discovery and push notifications
  is_online                 BOOLEAN NOT NULL DEFAULT FALSE,

  -- KYC via Youverify SDK (VARS never stores raw ID data)
  kyc_status                kyc_status_enum NOT NULL DEFAULT 'pending',
  kyc_verified_at           TIMESTAMPTZ,

  -- Bank account for Paystack payouts (verified at onboarding)
  bank_account_number       TEXT,
  bank_name                 TEXT,
  bank_account_name         TEXT,
  paystack_recipient_code   TEXT,                                  -- Transfer API recipient code

  -- Ratings (denormalised for query performance — updated by trigger)
  avg_rating                NUMERIC(3, 2) NOT NULL DEFAULT 0.00
                              CHECK (avg_rating BETWEEN 0 AND 5),
  total_reviews             INT NOT NULL DEFAULT 0,

  -- Admin-controlled status
  is_active                 BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE after admin approval
  is_suspended              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Badges (awarded by VARS team or automatically)
  badge_vars_choice         BOOLEAN NOT NULL DEFAULT FALSE,        -- manual award by VARS team
  badge_top_rated           BOOLEAN NOT NULL DEFAULT FALSE,        -- sustained high ratings

  push_token                TEXT,                                  -- Expo push token
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vendors IS 'Beauty professional accounts. Extends auth.users.';
COMMENT ON COLUMN vendors.is_online IS 'Vendor must have push notifications enabled to toggle Online. Enforced at app layer.';
COMMENT ON COLUMN vendors.live_location IS 'Tracked only when is_online = TRUE. Never stored when Offline per §7 spec.';
COMMENT ON COLUMN vendors.paystack_recipient_code IS 'Paystack Transfer API recipient code for automatic split settlements.';
COMMENT ON COLUMN vendors.badge_vars_choice IS 'Manually awarded by VARS team via admin dashboard.';

-- ============================================================
-- SERVICE CATEGORIES
-- The three V1 categories: Barbing, Hair Styling, Makeovers
-- ============================================================
CREATE TABLE service_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,   -- 'barbing' | 'hair_styling' | 'makeovers'
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE service_categories IS 'V1 categories: Barbing, Hair Styling, Makeovers. Drives tab bar in home screen.';

-- ============================================================
-- SERVICES (master list)
-- Platform-defined services per category
-- ============================================================
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id      UUID NOT NULL REFERENCES service_categories(id),
  name             TEXT NOT NULL,
  -- V1 bookable services = Barbing/Hair Styling/Makeover items per §1 spec
  -- is_bookable_v1 = FALSE means "Also offered" — visible on profile, not bookable
  is_bookable_v1   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE services IS 'Master service list. is_bookable_v1 = FALSE shows as "Also offered" on vendor profiles.';

-- ============================================================
-- VENDOR SERVICES
-- Services a specific vendor offers, with their own price + duration
-- ============================================================
CREATE TABLE vendor_services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id        UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id),
  -- Price stored in kobo (smallest NGN unit) to avoid floating point issues
  price_kobo       INT NOT NULL CHECK (price_kobo > 0),
  -- Duration in 30-minute blocks — all scheduling uses 30-min increments per spec §12.3
  duration_blocks  INT NOT NULL DEFAULT 1 CHECK (duration_blocks > 0 AND duration_blocks <= 48),
  -- TRUE = bookable, FALSE = "Also offered" informational entry
  is_bookable      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, service_id)
);

COMMENT ON TABLE vendor_services IS 'Vendor-specific pricing and duration per service. Duration in 30-min blocks.';
COMMENT ON COLUMN vendor_services.price_kobo IS 'Price in kobo (NGN × 100). e.g. ₦3,500 = 350000 kobo.';
COMMENT ON COLUMN vendor_services.duration_blocks IS '1 block = 30 minutes. Max 48 blocks = 24 hours.';

-- ============================================================
-- VENDOR UNAVAILABILITY
-- Time slots a vendor has explicitly blocked out
-- ============================================================
CREATE TABLE vendor_unavailability (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  -- Align to 30-min blocks: start minutes must be :00 or :30
  CHECK (EXTRACT(MINUTE FROM start_time) IN (0, 30)),
  CHECK (EXTRACT(MINUTE FROM end_time) IN (0, 30))
);

COMMENT ON TABLE vendor_unavailability IS 'Explicitly blocked time slots. Used in booking availability calculation.';

-- ============================================================
-- PORTFOLIO PHOTOS
-- Vendor work photos — consent-gated per spec §4.3 / §6.1
-- ============================================================
CREATE TABLE portfolio_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  -- Photos tagged from bookings require client consent before appearing on profile
  is_consented  BOOLEAN NOT NULL DEFAULT TRUE,
  -- If tagged from a booking, booking_id is set
  booking_id    UUID,                              -- FK added after bookings table created
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE portfolio_photos IS 'Vendor portfolio. Photos tagged from bookings need is_consented = TRUE before showing.';

-- ============================================================
-- BOOKINGS (core transaction record)
-- ============================================================
CREATE TABLE bookings (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                         UUID NOT NULL REFERENCES profiles(id),
  vendor_id                       UUID NOT NULL REFERENCES vendors(id),
  vendor_service_id               UUID NOT NULL REFERENCES vendor_services(id),

  -- Snapshot of service at booking time — prices/names may change later
  service_name                    TEXT NOT NULL,
  service_price_kobo              INT NOT NULL CHECK (service_price_kobo > 0),
  service_duration_blocks         INT NOT NULL CHECK (service_duration_blocks > 0),

  -- Appointment
  scheduled_at                    TIMESTAMPTZ NOT NULL,

  -- User's locked session location (cannot change after booking per spec §4.2)
  user_location                   GEOGRAPHY(POINT, 4326) NOT NULL,
  user_location_address           TEXT,

  -- Booking lifecycle status
  status                          booking_status_enum NOT NULL DEFAULT 'pending',

  -- Paystack fields
  -- Reference used for authorization and capture
  paystack_reference              TEXT UNIQUE,
  -- Access code for Paystack inline (used in mobile checkout)
  paystack_access_code            TEXT,
  -- Authorization code returned after successful charge (for capture)
  paystack_authorization_code     TEXT,
  payment_captured                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cancellation details
  cancelled_by                    TEXT CHECK (cancelled_by IN ('user', 'vendor', 'system')),
  cancellation_reason             TEXT,
  -- Cancellation fee split per §5 policy table
  cancellation_fee_percent        INT,
  cancellation_vars_amount_kobo   INT,
  cancellation_vendor_amount_kobo INT,
  cancellation_refund_amount_kobo INT,

  -- Status transition timestamps
  accepted_at                     TIMESTAMPTZ,
  on_way_at                       TIMESTAMPTZ,
  arrived_at                      TIMESTAMPTZ,
  service_rendered_at             TIMESTAMPTZ,
  completed_at                    TIMESTAMPTZ,
  -- Auto-release fires 2 hours after service_rendered_at if user has not confirmed
  auto_release_at                 TIMESTAMPTZ,

  -- Phone reveal: phone numbers exchanged only at 15-min-before-service trigger
  phone_revealed                  BOOLEAN NOT NULL DEFAULT FALSE,
  phone_reveal_at                 TIMESTAMPTZ,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bookings IS 'Core booking record. Payment is authorized at creation, captured on vendor acceptance.';
COMMENT ON COLUMN bookings.service_price_kobo IS 'Snapshot of price at booking time — immutable after creation.';
COMMENT ON COLUMN bookings.paystack_reference IS 'Unique reference for Paystack authorization → capture → settlement chain.';
COMMENT ON COLUMN bookings.auto_release_at IS 'Set to service_rendered_at + 2 hours by trigger. Cron job fires settlement at this time.';
COMMENT ON COLUMN bookings.phone_revealed IS 'TRUE when 15-min-before trigger fires. Handled by scheduled edge function.';

-- Now add the FK for portfolio_photos.booking_id
ALTER TABLE portfolio_photos
  ADD CONSTRAINT fk_portfolio_photos_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

-- ============================================================
-- DISPUTES
-- "Raise an Issue" flow — routes to admin dashboard queue
-- ============================================================
CREATE TABLE disputes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID NOT NULL REFERENCES bookings(id),
  raised_by    UUID NOT NULL REFERENCES profiles(id),   -- always the user
  statement    TEXT NOT NULL,
  status       dispute_status_enum NOT NULL DEFAULT 'open',
  resolution   dispute_resolution_enum,
  admin_notes  TEXT,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES auth.users(id),          -- admin user id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE disputes IS 'Dispute queue. Admin decides: release_to_vendor or refund_to_user. All decisions logged.';

-- ============================================================
-- REVIEWS
-- Post-completion review — star rating mandatory, comment optional
-- ============================================================
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID UNIQUE NOT NULL REFERENCES bookings(id),   -- one review per booking
  user_id     UUID NOT NULL REFERENCES profiles(id),
  vendor_id   UUID NOT NULL REFERENCES vendors(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,                                            -- optional per spec §4.6
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reviews IS 'One review per booking. Star rating mandatory. vendor.avg_rating updated by trigger.';

-- ============================================================
-- FAVOURITES
-- User saved/hearted vendors
-- ============================================================
CREATE TABLE favourites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, vendor_id)
);

COMMENT ON TABLE favourites IS 'Vendor heart/save. Quick save from feed without opening profile per spec §4.2.';

-- ============================================================
-- NOTIFICATIONS (in-app inbox)
-- All push notifications also logged here as persistent record
-- ============================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id    UUID NOT NULL,                         -- auth.users id (user or vendor)
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('user', 'vendor')),
  type            TEXT NOT NULL,                         -- e.g. 'booking_accepted', 'payment_released'
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',           -- extra context (booking_id, amounts, etc.)
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Optional direct booking link for in-app deep-link
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE notifications IS 'In-app notification inbox. Mirrors every push sent. Readable anytime per spec §9.';

-- ============================================================
-- NOTIFICATION PREFERENCES
-- Per-user, per-type on/off toggles
-- ============================================================
CREATE TABLE notification_preferences (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL,                      -- auth.users id (user or vendor)
  notification_type  TEXT NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, notification_type)
);

COMMENT ON TABLE notification_preferences IS 'Per-user notification type toggles per spec §10.2 / §10.4.';

-- ============================================================
-- PAYOUT HISTORY
-- Settlement records after each completed booking
-- ============================================================
CREATE TABLE payout_history (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id                 UUID NOT NULL REFERENCES bookings(id),
  vendor_id                  UUID NOT NULL REFERENCES vendors(id),
  -- Amounts in kobo
  vendor_amount_kobo         INT NOT NULL,
  vars_commission_kobo       INT NOT NULL,                -- always 20% of service price per spec §8
  -- Paystack Transfer API response fields
  paystack_transfer_code     TEXT,
  paystack_transfer_reference TEXT,
  status                     payout_status_enum NOT NULL DEFAULT 'pending',
  settled_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payout_history IS 'Automatic split settlement records. Vendor gets 80%, VARS gets 20% commission.';

-- ============================================================
-- ADMIN USERS
-- Internal VARS team accounts with elevated privileges
-- ============================================================
CREATE TABLE admin_users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_users IS 'Internal VARS admin accounts. Used for is_admin() RLS helper.';
