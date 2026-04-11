-- ============================================================
-- VARS — Pioneer Lead Conversion
-- Closes the loop between landing page leads and full vendor accounts:
--
-- 1. Adds converted tracking fields to vendor_leads
-- 2. DB trigger: when a vendor account is created, automatically
--    checks vendor_leads by email/phone — if a pioneer lead is found,
--    grants pioneer = TRUE on the vendor record and marks the lead
--    as converted.
--
-- Counter note: the Pioneer counter on the landing page reads ONLY
-- from vendor_leads WHERE pioneer = TRUE. All pioneers register as
-- leads first; once converted the lead stays (with converted = TRUE)
-- so the count remains accurate and never double-counts.
-- ============================================================

-- --------------------------------------------------------
-- 1. Add conversion tracking to vendor_leads
-- --------------------------------------------------------
ALTER TABLE vendor_leads
  ADD COLUMN IF NOT EXISTS converted           BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS converted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_vendor_id UUID      REFERENCES vendors(id) ON DELETE SET NULL;

COMMENT ON COLUMN vendor_leads.converted           IS 'TRUE once this lead completes full in-app vendor onboarding.';
COMMENT ON COLUMN vendor_leads.converted_at        IS 'Timestamp of conversion.';
COMMENT ON COLUMN vendor_leads.converted_vendor_id IS 'FK to the vendors row created from this lead.';

-- Index for admin queries on unconverted leads
CREATE INDEX IF NOT EXISTS idx_vendor_leads_converted
  ON vendor_leads (converted) WHERE converted = FALSE;

-- --------------------------------------------------------
-- 2. Trigger function: transfer pioneer status on vendor INSERT
-- Runs AFTER INSERT on vendors. Looks up vendor_leads by email
-- or phone. If a pioneer lead is found (and not yet converted),
-- grants pioneer = TRUE on the new vendor and marks the lead done.
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION transfer_pioneer_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
BEGIN
  -- Match on email first, fall back to phone number.
  -- Takes the earliest pioneer lead that hasn't been converted yet.
  SELECT *
    INTO matched_lead
    FROM vendor_leads
   WHERE pioneer   = TRUE
     AND converted = FALSE
     AND (
       email = LOWER(TRIM(NEW.email))
       OR phone = TRIM(NEW.phone_number)
     )
   ORDER BY created_at ASC
   LIMIT 1;

  IF FOUND THEN
    -- Grant pioneer status on the newly created vendor row
    UPDATE vendors
       SET pioneer = TRUE
     WHERE id = NEW.id;

    -- Mark the lead as converted and link it back to the vendor
    UPDATE vendor_leads
       SET converted           = TRUE,
           converted_at        = NOW(),
           converted_vendor_id = NEW.id
     WHERE id = matched_lead.id;
  END IF;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------
-- 3. Attach trigger to vendors table
-- --------------------------------------------------------
DROP TRIGGER IF EXISTS on_vendor_created_transfer_pioneer ON vendors;

CREATE TRIGGER on_vendor_created_transfer_pioneer
  AFTER INSERT ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION transfer_pioneer_from_lead();
