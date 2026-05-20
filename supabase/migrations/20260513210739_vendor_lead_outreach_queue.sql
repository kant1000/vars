-- ============================================================
-- VARS — Migration: vendor_lead_outreach_queue
-- Creates the vendor_lead_outreach table.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_lead_outreach (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID        NOT NULL REFERENCES vendor_leads(id) ON DELETE CASCADE,
  state_from           TEXT        NOT NULL,
  message_type         TEXT        NOT NULL,
  channel              TEXT        NOT NULL,
  message_template     TEXT        NOT NULL,
  message_body         TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'blocked')),
  approved_by          UUID        REFERENCES admin_users(id),
  approved_at          TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  response_status      TEXT,
  response_text        TEXT,
  response_at          TIMESTAMPTZ,
  provider_message_id  TEXT,
  provider_error       TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlo_lead_id      ON vendor_lead_outreach (lead_id);
CREATE INDEX IF NOT EXISTS idx_vlo_status       ON vendor_lead_outreach (status);
CREATE INDEX IF NOT EXISTS idx_vlo_message_type ON vendor_lead_outreach (message_type);

ALTER TABLE vendor_lead_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "vlo_service_all"
  ON vendor_lead_outreach FOR ALL
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY IF NOT EXISTS "vlo_admin_all"
  ON vendor_lead_outreach FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
