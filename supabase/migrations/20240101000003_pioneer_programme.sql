-- ============================================================
-- VARS — Pioneer Programme Migration
-- Adds pioneer fields to vendors table
-- Creates vendor_leads table for landing page registrations
-- ============================================================

-- --------------------------------------------------------
-- 1. Add pioneer fields to vendors table
-- --------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS pioneer                    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pioneer_bookings_completed INT     NOT NULL DEFAULT 0
    CHECK (pioneer_bookings_completed >= 0);

COMMENT ON COLUMN vendors.pioneer IS 'TRUE for the first 50 verified vendors — VARS Pioneers programme.';
COMMENT ON COLUMN vendors.pioneer_bookings_completed IS 'Counts completed bookings for Pioneers. Commission waived until this reaches 3.';

-- --------------------------------------------------------
-- 2. Create vendor_leads table
-- Captures pre-registrations from the landing page.
-- pioneer flag set at submission time based on spots remaining.
-- Full vendor onboarding happens in-app after download.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  service_type    TEXT NOT NULL,   -- barbing | hair_styling | makeovers | other
  location        TEXT NOT NULL,   -- free text city/area
  pioneer         BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE if spots were available at submission
  waitlist        BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE if 0 spots remaining at submission
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vendor_leads IS 'Landing page registrations before full in-app onboarding.';
COMMENT ON COLUMN vendor_leads.pioneer IS 'Pre-flagged at submission — confirmed on full KYC verification.';
COMMENT ON COLUMN vendor_leads.waitlist IS 'TRUE when Pioneer spots were exhausted at time of registration.';

-- Index for pioneer count queries (used by live counter)
CREATE INDEX IF NOT EXISTS idx_vendors_pioneer ON vendors (pioneer) WHERE pioneer = TRUE;
CREATE INDEX IF NOT EXISTS idx_vendor_leads_pioneer ON vendor_leads (pioneer) WHERE pioneer = TRUE;

-- --------------------------------------------------------
-- 3. RLS for vendor_leads
-- Anyone can insert (public landing page form)
-- Only service role can read (admin/edge functions only)
-- --------------------------------------------------------
ALTER TABLE vendor_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a lead"
  ON vendor_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Service role reads leads"
  ON vendor_leads FOR SELECT
  TO service_role
  USING (TRUE);
