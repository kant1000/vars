-- ============================================================
-- Migration: Gate-at-departure payment model
--
-- Replaces charge-at-booking with charge-at-gate:
--   No money moves until the vendor commits to travel (gate).
--   All pre-gate cancellations are free. Post-gate vendor cancel
--   triggers a full refund and vendor account restriction.
--
-- Changes:
--   bookings  — add gate tracking fields; drop obsolete payment
--               and tiered-cancel fields
--   profiles  — add paystack_authorization_code for reusable card auth
--   vendors   — add restriction fields (separate from settlement_on_hold)
-- ============================================================

-- ── bookings: gate tracking ───────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS gate_fired           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gate_trigger_type    TEXT
    CHECK (gate_trigger_type IN ('manual', 'proximity')),
  ADD COLUMN IF NOT EXISTS gate_triggered_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gate_charged_at      TIMESTAMPTZ,
  -- When non-null, a first-time checkout or failed charge-auth retry is open.
  -- If customer does not complete payment before this time the booking is cancelled.
  ADD COLUMN IF NOT EXISTS gate_retry_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.gate_fired IS
  'TRUE once the gate has been atomically claimed. Prevents double-fire from concurrent manual + proximity triggers.';
COMMENT ON COLUMN bookings.gate_trigger_type IS
  'How the gate fired: ''manual'' = vendor tapped On My Way, ''proximity'' = cron detected vendor near customer.';
COMMENT ON COLUMN bookings.gate_triggered_at IS
  'When the gate was claimed. Set atomically with gate_fired = TRUE.';
COMMENT ON COLUMN bookings.gate_charged_at IS
  'When the Paystack charge completed successfully. NULL until payment succeeds.';
COMMENT ON COLUMN bookings.gate_retry_expires_at IS
  'Deadline for the customer to complete payment after a failed or pending checkout. NULL when not in retry state.';

-- ── bookings: drop obsolete columns ──────────────────────────
-- payment_captured was a vendor-accept flag, never a real Paystack action.
-- The tiered cancellation fee columns are replaced by the binary model.
-- grace_cancelled / auto_accept_grace_expires_at are removed with vendor-cancel-grace.
-- paystack_access_code was set at initialize time; booking init no longer calls Paystack.
ALTER TABLE bookings
  DROP COLUMN IF EXISTS payment_captured,
  DROP COLUMN IF EXISTS paystack_access_code,
  DROP COLUMN IF EXISTS cancellation_fee_percent,
  DROP COLUMN IF EXISTS cancellation_vars_amount_kobo,
  DROP COLUMN IF EXISTS cancellation_vendor_amount_kobo,
  DROP COLUMN IF EXISTS cancellation_refund_amount_kobo,
  DROP COLUMN IF EXISTS grace_cancelled,
  DROP COLUMN IF EXISTS auto_accept_grace_expires_at;

-- ── profiles: store reusable Paystack card authorization ─────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS paystack_authorization_code TEXT;

COMMENT ON COLUMN profiles.paystack_authorization_code IS
  'Reusable Paystack card authorization_code from the most recent successful charge. Used to charge the customer at gate time without a new checkout WebView.';

-- ── vendors: restriction state ────────────────────────────────
-- Distinct from settlement_on_hold (which freezes subaccount settlement for disputes).
-- is_restricted blocks all vendor app functionality until the vendor repays
-- the amount owed from a post-gate cancellation.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_restricted                   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS restriction_amount_owed_kobo    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restriction_reason              TEXT,
  ADD COLUMN IF NOT EXISTS restriction_repayment_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN vendors.is_restricted IS
  'TRUE when vendor cancelled after the gate and owes VARS the customer refund amount. Blocks all app functionality.';
COMMENT ON COLUMN vendors.restriction_amount_owed_kobo IS
  'Amount in kobo the vendor must repay to VARS before restriction is lifted (their subaccount share of the refunded booking).';
COMMENT ON COLUMN vendors.restriction_reason IS
  'Human-readable reason for the restriction, shown on the vendor blocking screen.';
COMMENT ON COLUMN vendors.restriction_repayment_claimed_at IS
  'When the vendor tapped "I''ve paid" — creates an admin queue entry to confirm and lift the restriction.';
