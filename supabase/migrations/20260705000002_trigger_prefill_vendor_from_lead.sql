-- ============================================================
-- VARS — Migration: extend transfer_pioneer_from_lead
-- Previously only transferred pioneer = TRUE when a pioneer lead matched.
-- Now also:
--   1. Adds vendors.lead_service_type (TEXT, nullable) to carry the
--      service_type from vendor_leads for Step 2 pre-selection.
--   2. Copies full_name, phone, and service_type from the matched lead
--      onto the new vendor row so Step 1 can pre-fill from the vendor
--      row (readable by authenticated users) rather than vendor_leads
--      (service_role only).
--   3. Matches non-pioneer leads too — any unmatched lead gets its
--      data copied; pioneer flag only granted if lead.pioneer = TRUE.
-- ============================================================

-- 1. Add lead_service_type to vendors
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS lead_service_type TEXT;

COMMENT ON COLUMN vendors.lead_service_type IS 'Service type from the vendor_leads record (barbing | hair_styling | makeovers | other). Used to pre-select L1 category in Step 2 of onboarding.';

-- 2. Replace trigger function
CREATE OR REPLACE FUNCTION transfer_pioneer_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
BEGIN
  -- Match on email first, fall back to phone.
  -- Prefer pioneer leads; within that, take the earliest unconverted one.
  SELECT *
    INTO matched_lead
    FROM vendor_leads
   WHERE converted = FALSE
     AND (
       email = LOWER(TRIM(NEW.email))
       OR phone = TRIM(NEW.phone_number)
     )
   ORDER BY pioneer DESC, created_at ASC
   LIMIT 1;

  IF FOUND THEN
    UPDATE vendors
       SET
         -- Pre-fill name/phone only when the auth signup sent empty strings
         full_name         = CASE
                               WHEN COALESCE(TRIM(NEW.full_name), '') = ''
                               THEN COALESCE(matched_lead.full_name, NEW.full_name)
                               ELSE NEW.full_name
                             END,
         phone_number      = CASE
                               WHEN COALESCE(TRIM(NEW.phone_number), '') = ''
                               THEN COALESCE(matched_lead.phone, NEW.phone_number)
                               ELSE NEW.phone_number
                             END,
         lead_service_type = matched_lead.service_type,
         pioneer           = CASE WHEN matched_lead.pioneer = TRUE THEN TRUE ELSE pioneer END
     WHERE id = NEW.id;

    UPDATE vendor_leads
       SET converted           = TRUE,
           converted_at        = NOW(),
           converted_vendor_id = NEW.id
     WHERE id = matched_lead.id;
  END IF;

  RETURN NEW;
END;
$$;
