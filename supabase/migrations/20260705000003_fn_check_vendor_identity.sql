-- ============================================================
-- VARS — Migration: vendor identity check helpers
-- 1. normalise_nigerian_phone(TEXT) — shared SQL normalisation,
--    mirrors the JS normalisePhone in vendor-register-lead.
-- 2. check_vendor_identity(p_email, p_phone) — used by the
--    vendor-check-identity edge function to determine whether
--    a given email or phone belongs to an existing vendor account,
--    a pre-registered lead (not yet in app), or neither.
-- 3. Patch transfer_pioneer_from_lead to normalise phone before
--    comparison so E.164 mismatches no longer silently miss leads.
-- ============================================================

-- 1. Phone normalisation helper
CREATE OR REPLACE FUNCTION normalise_nigerian_phone(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 11
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 1) = '0'
    THEN '+234' || SUBSTRING(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 2)

    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 13
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 3) = '234'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    WHEN LEFT(TRIM(raw), 1) = '+'
    THEN TRIM(raw)

    ELSE TRIM(raw)
  END
$$;

-- 2. Vendor identity check — returns 'has_account' | 'lead_only' | 'not_found'
CREATE OR REPLACE FUNCTION check_vendor_identity(
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      -- Existing vendor app account
      WHEN EXISTS (
        SELECT 1
          FROM auth.users u
          JOIN vendors v ON v.id = u.id
         WHERE (p_email IS NOT NULL AND u.email = LOWER(TRIM(p_email)))
            OR (p_phone IS NOT NULL AND u.phone = normalise_nigerian_phone(p_phone))
      ) THEN 'has_account'

      -- Pre-registered on landing page but not yet in app
      WHEN EXISTS (
        SELECT 1
          FROM vendor_leads
         WHERE converted = FALSE
           AND (
             (p_email IS NOT NULL AND email = LOWER(TRIM(p_email)))
             OR (p_phone IS NOT NULL AND phone = normalise_nigerian_phone(p_phone))
           )
      ) THEN 'lead_only'

      ELSE 'not_found'
    END
$$;

-- 3. Patch transfer_pioneer_from_lead to normalise phone before comparing
--    (replaces the version from 20260705000002 which used raw TRIM only)
CREATE OR REPLACE FUNCTION transfer_pioneer_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
BEGIN
  SELECT *
    INTO matched_lead
    FROM vendor_leads
   WHERE converted = FALSE
     AND (
       email = LOWER(TRIM(NEW.email))
       OR phone = normalise_nigerian_phone(TRIM(NEW.phone_number))
     )
   ORDER BY pioneer DESC, created_at ASC
   LIMIT 1;

  IF FOUND THEN
    UPDATE vendors
       SET
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
