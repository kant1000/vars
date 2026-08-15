-- Fix: phone-based vendor login ("has_account") could never succeed.
-- check_vendor_identity's phone branch only checked auth.users.phone, but
-- vendors.phone_number (set by transfer_pioneer_from_lead at signup, or
-- directly on the vendors row) is the actual business phone field vendors
-- see in the app. auth.users.phone was never populated by any code path,
-- so every vendor with a phone number failed phone lookup entirely.
--
-- This migration:
--   1. check_vendor_identity also matches vendors.phone_number (defensive
--      redundancy — correct even if the two fields ever drift).
--   2. transfer_pioneer_from_lead now syncs the resolved phone into
--      auth.users.phone at vendor-creation time, guarded by the column's
--      UNIQUE constraint, so future signups stay in sync automatically.
--   3. One-time backfill for existing vendors whose auth.users.phone is
--      still null.
--
-- Without auth.users.phone matching, supabase.auth.signInWithOtp({ phone })
-- would either fail (shouldCreateUser: false) or silently create a second,
-- disconnected auth identity (default shouldCreateUser: true) instead of
-- signing the vendor into their existing account — this migration and the
-- accompanying mobile change (shouldCreateUser: false on phone OTP send)
-- together close that gap.

CREATE OR REPLACE FUNCTION public.check_vendor_identity(p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
          FROM auth.users u
          JOIN vendors v ON v.id = u.id
         WHERE (p_email IS NOT NULL AND u.email = LOWER(TRIM(p_email)))
            OR (p_phone IS NOT NULL AND (
                  u.phone = normalise_nigerian_phone(p_phone)
                  OR v.phone_number = normalise_nigerian_phone(p_phone)
                ))
      ) THEN 'has_account'

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
$function$;

CREATE OR REPLACE FUNCTION public.transfer_pioneer_from_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
  resolved_phone TEXT;
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
    resolved_phone := CASE
                         WHEN COALESCE(TRIM(NEW.phone_number), '') = ''
                         THEN COALESCE(matched_lead.phone, NEW.phone_number)
                         ELSE NEW.phone_number
                       END;

    UPDATE vendors
       SET
         full_name         = CASE
                               WHEN COALESCE(TRIM(NEW.full_name), '') = ''
                               THEN COALESCE(matched_lead.full_name, NEW.full_name)
                               ELSE NEW.full_name
                             END,
         phone_number      = resolved_phone,
         lead_service_type = matched_lead.service_type,
         pioneer           = CASE WHEN matched_lead.pioneer = TRUE THEN TRUE ELSE pioneer END
     WHERE id = NEW.id;

    UPDATE vendor_leads
       SET converted           = TRUE,
           converted_at        = NOW(),
           converted_vendor_id = NEW.id
     WHERE id = matched_lead.id;
  ELSE
    resolved_phone := NULLIF(TRIM(NEW.phone_number), '');
  END IF;

  -- Keep auth.users.phone in sync with the vendor's business phone so
  -- phone-based WhatsApp OTP login resolves to this same account instead
  -- of failing or creating a duplicate identity. Guarded: only fill when
  -- unset, and only when no other auth user already owns that phone
  -- (auth.users.phone has a UNIQUE constraint).
  IF resolved_phone IS NOT NULL THEN
    UPDATE auth.users
       SET phone = resolved_phone
     WHERE id = NEW.id
       AND phone IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users u2 WHERE u2.phone = resolved_phone AND u2.id <> NEW.id
       );
  END IF;

  RETURN NEW;
END;
$function$;

-- One-time backfill for vendors created before this fix.
UPDATE auth.users u
   SET phone = v.phone_number
  FROM vendors v
 WHERE u.id = v.id
   AND u.phone IS NULL
   AND v.phone_number IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM auth.users u2 WHERE u2.phone = v.phone_number AND u2.id <> u.id
   );
