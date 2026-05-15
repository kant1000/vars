-- ============================================================
-- VARS — Migration 020: Outreach schema
-- Adds missing columns to vendor_leads and creates the
-- vendor_lead_outreach table referenced by admin + edge functions.
-- ============================================================

-- ── 1. Add missing columns to vendor_leads ──────────────────

ALTER TABLE vendor_leads
  ADD COLUMN IF NOT EXISTS lead_state   TEXT NOT NULL DEFAULT 'PROSPECT'
    CHECK (lead_state IN ('PROSPECT', 'COLD', 'VERIFIED', 'CONVERTED')),
  ADD COLUMN IF NOT EXISTS last_outreach TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted     BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Create vendor_lead_outreach ──────────────────────────

CREATE TABLE IF NOT EXISTS vendor_lead_outreach (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID        NOT NULL REFERENCES vendor_leads(id) ON DELETE CASCADE,
  state_from           TEXT        NOT NULL DEFAULT 'PROSPECT',
  message_type         TEXT        NOT NULL,      -- welcome_email | custom
  channel              TEXT        NOT NULL,      -- email | whatsapp | sms
  message_template     TEXT,
  message_body         TEXT        NOT NULL,
  status               TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'blocked')),
  approved_by          UUID        REFERENCES admin_users(id),
  approved_at          TIMESTAMPTZ,
  sent_at              TIMESTAMPTZ,
  provider_message_id  TEXT,
  response_status      TEXT,
  response_text        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlo_lead_id      ON vendor_lead_outreach (lead_id);
CREATE INDEX IF NOT EXISTS idx_vlo_status       ON vendor_lead_outreach (status);
CREATE INDEX IF NOT EXISTS idx_vlo_message_type ON vendor_lead_outreach (message_type);

-- ── 3. RLS for vendor_lead_outreach ─────────────────────────

ALTER TABLE vendor_lead_outreach ENABLE ROW LEVEL SECURITY;

-- Edge functions (service role) can do everything
CREATE POLICY "vlo_service_all"
  ON vendor_lead_outreach FOR ALL
  TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- Admin users can do everything
CREATE POLICY "vlo_admin_all"
  ON vendor_lead_outreach FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ── 4. RLS: extend vendor_leads for admin reads/updates ─────

-- Admins can read all leads
CREATE POLICY "vendor_leads_admin_select"
  ON vendor_leads FOR SELECT
  USING (is_admin());

-- Admins can update leads (lead_state, last_outreach, converted)
CREATE POLICY "vendor_leads_admin_update"
  ON vendor_leads FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());
