-- ============================================================
-- VARS — Migration: kyc_rejection_reason
-- Adds rejection reason storage to vendors.
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;
