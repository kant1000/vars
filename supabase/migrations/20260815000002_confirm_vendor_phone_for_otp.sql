-- Fix part 2: auth.users.phone was backfilled in the previous migration, but
-- GoTrue treats a phone as "not existing" for signInWithOtp purposes unless
-- phone_confirmed_at is also set (same requirement as email_confirmed_at for
-- email OTP). With shouldCreateUser: false, an unconfirmed phone produces
-- "Signups not allowed for otp" even though auth.users.phone matches --
-- confirmed live via a real device test after the previous migration.
--
-- The phone is the vendor's own business-registered number (sourced from
-- their vendor_leads registration or vendors.phone_number), so marking it
-- confirmed here is equivalent to how their email is already trusted.

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
  -- (auth.users.phone has a UNIQUE constraint). phone_confirmed_at must be
  -- set too, or GoTrue treats the phone as non-existent for OTP sign-in.
  IF resolved_phone IS NOT NULL THEN
    UPDATE auth.users
       SET phone = resolved_phone,
           phone_confirmed_at = COALESCE(phone_confirmed_at, NOW())
     WHERE id = NEW.id
       AND phone IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users u2 WHERE u2.phone = resolved_phone AND u2.id <> NEW.id
       );
  END IF;

  RETURN NEW;
END;
$function$;

-- One-time confirm for the phone numbers backfilled by the previous migration.
UPDATE auth.users u
   SET phone_confirmed_at = NOW()
  FROM vendors v
 WHERE u.id = v.id
   AND u.phone IS NOT NULL
   AND u.phone_confirmed_at IS NULL;
