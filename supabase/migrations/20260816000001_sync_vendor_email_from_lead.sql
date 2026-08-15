-- Symmetric counterpart to 20260815000003_add_vendor_phone_identity.sql.
-- That migration made transfer_pioneer_from_lead sync a matched lead's phone
-- into auth.users.phone/phone_confirmed_at/auth.identities so email-first
-- vendor signups could also log in by phone. This migration does the same
-- for email so phone-first vendor signups (lead_only + phone, previously a
-- dead end in the app) can also log in by email afterward.
--
-- Without this, fn_handle_new_user inserts vendors.email = COALESCE(NEW.email,
-- '') — for a phone-only auth.users row NEW.email is NULL, so vendors.email
-- stays '' and auth.users.email stays unset forever. check_vendor_identity(
-- p_email) would then never find that vendor again.

CREATE OR REPLACE FUNCTION public.transfer_pioneer_from_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
  resolved_phone TEXT;
  resolved_email TEXT;
  phone_synced_count INT := 0;
  email_synced_count INT := 0;
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

    resolved_email := CASE
                         WHEN COALESCE(TRIM(NEW.email), '') = ''
                         THEN COALESCE(LOWER(TRIM(matched_lead.email)), NEW.email)
                         ELSE NEW.email
                       END;

    UPDATE vendors
       SET
         full_name         = CASE
                               WHEN COALESCE(TRIM(NEW.full_name), '') = ''
                               THEN COALESCE(matched_lead.full_name, NEW.full_name)
                               ELSE NEW.full_name
                             END,
         phone_number      = resolved_phone,
         email              = COALESCE(resolved_email, email),
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
    resolved_email := NULLIF(TRIM(NEW.email), '');
  END IF;

  -- Keep auth.users.phone (+ phone_confirmed_at + a matching auth.identities
  -- row) in sync with the vendor's business phone so phone-based WhatsApp
  -- OTP login resolves to this same account instead of failing or creating
  -- a duplicate identity. Guarded: only fill when unset, and only when no
  -- other auth user already owns that phone (auth.users.phone has a UNIQUE
  -- constraint).
  IF resolved_phone IS NOT NULL THEN
    UPDATE auth.users
       SET phone = resolved_phone,
           phone_confirmed_at = COALESCE(phone_confirmed_at, NOW())
     WHERE id = NEW.id
       AND phone IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users u2 WHERE u2.phone = resolved_phone AND u2.id <> NEW.id
       );

    GET DIAGNOSTICS phone_synced_count = ROW_COUNT;

    IF phone_synced_count > 0 AND NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = NEW.id AND provider = 'phone'
    ) THEN
      INSERT INTO auth.identities
        (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        resolved_phone,
        NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'phone', resolved_phone),
        'phone',
        NOW(), NOW(), NOW()
      );
    END IF;
  END IF;

  -- Mirror of the phone sync above, for email: keeps auth.users.email in
  -- sync for phone-first vendor signups so email-based login/OTP resolves
  -- to this same account afterward.
  IF resolved_email IS NOT NULL THEN
    UPDATE auth.users
       SET email = resolved_email,
           email_confirmed_at = COALESCE(email_confirmed_at, NOW())
     WHERE id = NEW.id
       AND email IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users u2 WHERE u2.email = resolved_email AND u2.id <> NEW.id
       );

    GET DIAGNOSTICS email_synced_count = ROW_COUNT;

    IF email_synced_count > 0 AND NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = NEW.id AND provider = 'email'
    ) THEN
      INSERT INTO auth.identities
        (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        NEW.id::text,
        NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'email', resolved_email),
        'email',
        NOW(), NOW(), NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Defensive symmetry: check_vendor_identity's phone branch also matches
-- vendors.phone_number (in case the two fields ever drift); do the same for
-- email now that vendors.email can be populated independently of
-- auth.users.email momentarily (e.g. mid-request before the trigger above
-- has run for a not-yet-existing case). Not required for correctness once
-- the sync above is in place, but cheap and consistent with the phone fix.
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
         WHERE (p_email IS NOT NULL AND (
                  u.email = LOWER(TRIM(p_email))
                  OR v.email = LOWER(TRIM(p_email))
                ))
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
