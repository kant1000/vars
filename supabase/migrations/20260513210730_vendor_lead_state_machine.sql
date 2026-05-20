-- ============================================================
-- VARS — Migration: vendor_lead_state_machine
-- Adds outreach tracking columns to vendor_leads.
-- ============================================================

ALTER TABLE vendor_leads
  ADD COLUMN IF NOT EXISTS converted            BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_vendor_id  UUID        REFERENCES vendors(id),
  ADD COLUMN IF NOT EXISTS lead_state           TEXT        NOT NULL DEFAULT 'PROSPECT'
    CHECK (lead_state IN ('PROSPECT', 'COLD', 'VERIFIED', 'CONVERTED')),
  ADD COLUMN IF NOT EXISTS last_state_change    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_outreach        TIMESTAMPTZ;
