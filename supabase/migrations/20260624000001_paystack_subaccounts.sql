-- ============================================================
-- Migration: Paystack Subaccount per-vendor split model
--
-- Vendors now have a dedicated Paystack subaccount created during
-- onboarding. Customer payments split at transaction time: vendor's
-- share (80%, or 100% for Pioneer) goes directly into their subaccount
-- balance. Settlement to their bank account is triggered manually by
-- VARS ops from the Paystack dashboard (settlement_schedule = manual)
-- and is gated on zero open disputes for that vendor.
-- ============================================================

-- 1. vendors: subaccount code and settlement hold flag
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT,
  ADD COLUMN IF NOT EXISTS settlement_on_hold BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN vendors.paystack_subaccount_code IS
  'Paystack subaccount code (ACCT_xxx) created during onboarding. Used to split payments at transaction time.';

COMMENT ON COLUMN vendors.settlement_on_hold IS
  'TRUE when a bank chargeback (charge.dispute.create) is active. Prevents VARS from triggering subaccount settlement for this vendor until the dispute resolves.';

-- 2. payout_history: track which settlement event cleared each payout row
ALTER TABLE payout_history
  ADD COLUMN IF NOT EXISTS paystack_settlement_reference TEXT;

COMMENT ON COLUMN payout_history.paystack_settlement_reference IS
  'Reference from the Paystack settlement event that cleared this payout row. Null until settlement is confirmed.';

-- 3. Add settlement_queued status: booking is completed and payout is
--    ready but VARS ops has not yet triggered the subaccount settlement
--    from the Paystack dashboard.
ALTER TYPE payout_status_enum ADD VALUE IF NOT EXISTS 'settlement_queued';
