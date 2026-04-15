-- ============================================================
-- Migration 006: Vendor cancellation tracking
-- Adds cancellation_flagged flag to vendors table.
-- Set to true automatically when a vendor accumulates 3+
-- cancellations within a rolling 30-day window (handled by
-- the vendor-cancel-booking edge function).
-- Admin can clear the flag via the vendors panel once reviewed.
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS cancellation_flagged BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for admin panel query (filter flagged vendors)
CREATE INDEX IF NOT EXISTS idx_vendors_cancellation_flagged
  ON vendors (cancellation_flagged)
  WHERE cancellation_flagged = TRUE;

-- Comment for documentation
COMMENT ON COLUMN vendors.cancellation_flagged IS
  'True when vendor has 3+ cancellations in a rolling 30-day window. Cleared by admin after review.';
