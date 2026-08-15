-- Fix: normalise_nigerian_phone only reconstructs a leading '+' for Nigerian
-- numbers (13 digits starting '234') or input that already has a '+'. Any
-- other supported country's bare, +-less digits (e.g. auth.users.phone,
-- which GoTrue always stores without '+') fell through to the final ELSE
-- and were returned unchanged — so transfer_pioneer_from_lead's phone match
-- against vendor_leads.phone (stored with '+') always failed for a non-NG
-- phone-first vendor signup. Invisible until today because phone-first
-- signup (the only code path that feeds a +-less, non-NG number into this
-- comparison) didn't exist before this session's work.
--
-- Confirmed live: a UK phone-first signup (+447770094446) matched an
-- existing unconverted vendor_leads row by that exact phone, but the vendor
-- ended up with blank full_name/email because normalise_nigerian_phone(
-- '447770094446') returned '447770094446' unchanged (12 digits, no '+',
-- doesn't hit the NG-only cases), which never equals the lead's stored
-- '+447770094446'.
--
-- Adds the two other supported countries (see packages/shared/src/phone.ts
-- PHONE_COUNTRIES: NG/US/UK) as explicit digit-count + prefix cases,
-- mirroring the existing NG case.

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

    -- UK: +44 + 10-digit local number, stored digits-only (no '+') by GoTrue
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 12
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 2) = '44'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    -- US/Canada: +1 + 10-digit local number, stored digits-only by GoTrue
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 11
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 1) = '1'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    WHEN LEFT(TRIM(raw), 1) = '+'
    THEN TRIM(raw)

    ELSE TRIM(raw)
  END
$$;

-- One-time re-match: any vendor whose phone_number matches an unconverted
-- lead's phone (once correctly normalised) but whose full_name/email are
-- still blank was hit by this bug at signup time. Re-run the same backfill
-- transfer_pioneer_from_lead already does, for existing affected vendors.
DO $$
DECLARE
  v RECORD;
  matched_lead vendor_leads%ROWTYPE;
  resolved_email TEXT;
BEGIN
  FOR v IN
    SELECT * FROM vendors
     WHERE COALESCE(TRIM(full_name), '') = ''
  LOOP
    SELECT * INTO matched_lead
      FROM vendor_leads
     WHERE converted = FALSE
       AND (
         email = LOWER(TRIM(v.email))
         OR phone = normalise_nigerian_phone(TRIM(v.phone_number))
       )
     ORDER BY pioneer DESC, created_at ASC
     LIMIT 1;

    IF FOUND THEN
      resolved_email := CASE
                           WHEN COALESCE(TRIM(v.email), '') = ''
                           THEN COALESCE(LOWER(TRIM(matched_lead.email)), v.email)
                           ELSE v.email
                         END;

      UPDATE vendors
         SET full_name         = COALESCE(NULLIF(TRIM(v.full_name), ''), matched_lead.full_name),
             email              = COALESCE(resolved_email, email),
             lead_service_type = matched_lead.service_type,
             pioneer           = CASE WHEN matched_lead.pioneer = TRUE THEN TRUE ELSE pioneer END
       WHERE id = v.id;

      UPDATE vendor_leads
         SET converted           = TRUE,
             converted_at        = NOW(),
             converted_vendor_id = v.id
       WHERE id = matched_lead.id;

      IF resolved_email IS NOT NULL THEN
        UPDATE auth.users
           SET email = resolved_email,
               email_confirmed_at = COALESCE(email_confirmed_at, NOW())
         WHERE id = v.id
           AND email IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM auth.users u2 WHERE u2.email = resolved_email AND u2.id <> v.id
           );

        IF NOT EXISTS (
          SELECT 1 FROM auth.identities WHERE user_id = v.id AND provider = 'email'
        ) AND EXISTS (
          SELECT 1 FROM auth.users WHERE id = v.id AND email = resolved_email
        ) THEN
          INSERT INTO auth.identities
            (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          VALUES (
            v.id::text,
            v.id,
            jsonb_build_object('sub', v.id::text, 'email', resolved_email),
            'email',
            NOW(), NOW(), NOW()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;
