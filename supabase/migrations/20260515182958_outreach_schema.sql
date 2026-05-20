-- ============================================================
-- VARS — Migration: outreach_schema
-- Admin RLS policies on vendor_leads for the outreach panel.
-- ============================================================

-- Admins can read all leads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendor_leads' AND policyname = 'vendor_leads_admin_select'
  ) THEN
    CREATE POLICY "vendor_leads_admin_select"
      ON vendor_leads FOR SELECT
      USING (is_admin());
  END IF;
END $$;

-- Admins can update leads (lead_state, last_outreach, converted)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vendor_leads' AND policyname = 'vendor_leads_admin_update'
  ) THEN
    CREATE POLICY "vendor_leads_admin_update"
      ON vendor_leads FOR UPDATE
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
