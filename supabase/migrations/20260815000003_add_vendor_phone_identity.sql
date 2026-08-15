-- Fix part 3: auth.users.phone + phone_confirmed_at alone aren't enough.
-- GoTrue's "does this user already exist for phone sign-in" check queries
-- auth.identities for a row with provider = 'phone', not the auth.users.phone
-- column directly. This vendor only had an 'email' identity row, so
-- signInWithOtp({ phone, shouldCreateUser: false }) still errored with
-- "Signups not allowed for otp" even after the previous two migrations --
-- confirmed live via a real device test.
--
-- This migration adds the missing 'phone' identity row for vendors whose
-- auth.users.phone was backfilled, and extends transfer_pioneer_from_lead to
-- create one going forward whenever it syncs a new vendor's phone.

CREATE OR REPLACE FUNCTION public.transfer_pioneer_from_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
  resolved_phone TEXT;
  phone_synced_count INT := 0;
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

  RETURN NEW;
END;
$function$;

-- One-time backfill: add the missing 'phone' identity row for vendors whose
-- auth.users.phone was already synced by the previous two migrations.
INSERT INTO auth.identities
  (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.phone, u.id, jsonb_build_object('sub', u.id::text, 'phone', u.phone), 'phone', NOW(), NOW(), NOW()
  FROM auth.users u
  JOIN vendors v ON v.id = u.id
 WHERE u.phone IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'phone'
   );
