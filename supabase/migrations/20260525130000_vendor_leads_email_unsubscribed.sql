-- ============================================================
-- VARS — Migration: vendor_leads email_unsubscribed column
-- 2026-05-25
-- ============================================================

ALTER TABLE vendor_leads
ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN vendor_leads.email_unsubscribed IS
  'Set true when the lead unsubscribes via the marketing email link. Excludes them from all future bulk marketing sends.';
