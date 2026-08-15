-- Fix part 4: auth.users.phone and auth.identities.provider_id must be
-- stored WITHOUT a leading '+' -- GoTrue's own internal convention (visible
-- in Supabase's docs: verifyOtp/updateUser examples use bare digits, only
-- the signInWithOtp client call itself accepts a '+' prefixed E.164 string).
-- The previous migrations backfilled these with a leading '+', which never
-- matched GoTrue's own lookup -- confirmed live: with shouldCreateUser:
-- true, GoTrue attempted to create a NEW user for this phone rather than
-- recognizing the existing vendor (creation then rolled back because the
-- Send SMS hook errored, so no orphan user was left behind).

UPDATE auth.users
   SET phone = LTRIM(phone, '+')
 WHERE phone LIKE '+%';

UPDATE auth.identities
   SET provider_id = LTRIM(provider_id, '+'),
       identity_data = jsonb_set(identity_data, '{phone}', to_jsonb(LTRIM(identity_data->>'phone', '+')))
 WHERE provider = 'phone'
   AND provider_id LIKE '+%';

CREATE OR REPLACE FUNCTION public.transfer_pioneer_from_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  matched_lead vendor_leads%ROWTYPE;
  resolved_phone TEXT;
  auth_phone TEXT;
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
  -- a duplicate identity. GoTrue stores phone WITHOUT a leading '+' --
  -- strip it here. Guarded: only fill when unset, and only when no other
  -- auth user already owns that phone (auth.users.phone has a UNIQUE
  -- constraint).
  IF resolved_phone IS NOT NULL THEN
    auth_phone := LTRIM(resolved_phone, '+');

    UPDATE auth.users
       SET phone = auth_phone,
           phone_confirmed_at = COALESCE(phone_confirmed_at, NOW())
     WHERE id = NEW.id
       AND phone IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users u2 WHERE u2.phone = auth_phone AND u2.id <> NEW.id
       );

    GET DIAGNOSTICS phone_synced_count = ROW_COUNT;

    IF phone_synced_count > 0 AND NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = NEW.id AND provider = 'phone'
    ) THEN
      INSERT INTO auth.identities
        (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (
        auth_phone,
        NEW.id,
        jsonb_build_object('sub', NEW.id::text, 'phone', auth_phone),
        'phone',
        NOW(), NOW(), NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
