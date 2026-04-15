-- ============================================================
-- Migration 007: Disputes table corrections
--
-- Fixes four schema/code mismatches found before first deploy:
--
-- 1. Rename disputes.statement → disputes.reason
--    Code (dispute-raise fn + admin page) uses 'reason' everywhere.
--
-- 2. Add disputes.raised_at
--    dispute-raise edge fn inserts raised_at; admin SLA timer reads it.
--    Back-fill from created_at for any existing rows.
--
-- 3. Add 'under_review' to dispute_status_enum
--    Admin panel has a "Mark under review" action that sets this value.
--
-- 4. Extend dispute_resolution_enum with 'pay_vendor', 'refund_user', 'split'
--    Admin DisputeActions.tsx sends these values.
--    (Legacy values 'released_to_vendor' / 'refunded_to_user' retained.)
--
-- 5. Correct stale comment on bookings.auto_release_at — it is now set at
--    booking creation time (scheduled_end + 1hr), not by a post-service trigger.
-- ============================================================

-- 1. Rename statement → reason
ALTER TABLE disputes RENAME COLUMN statement TO reason;

-- 2. Add raised_at
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS raised_at TIMESTAMPTZ;

UPDATE disputes SET raised_at = created_at WHERE raised_at IS NULL;

ALTER TABLE disputes
  ALTER COLUMN raised_at SET NOT NULL,
  ALTER COLUMN raised_at SET DEFAULT NOW();

-- 3. Extend dispute_status_enum
ALTER TYPE dispute_status_enum ADD VALUE IF NOT EXISTS 'under_review';

-- 4. Extend dispute_resolution_enum
ALTER TYPE dispute_resolution_enum ADD VALUE IF NOT EXISTS 'pay_vendor';
ALTER TYPE dispute_resolution_enum ADD VALUE IF NOT EXISTS 'refund_user';
ALTER TYPE dispute_resolution_enum ADD VALUE IF NOT EXISTS 'split';

-- 5. Update stale comment on auto_release_at
COMMENT ON COLUMN bookings.auto_release_at IS
  'Set at booking creation to scheduled_end + 1hr. Cron job (paystack-settle) '
  'fires settlement when this timestamp is reached AND status = service_rendered.';
