-- Same class of bug just fixed in check_customer_identity
-- (20260819040002_fix_check_customer_identity_plus_mismatch.sql): the
-- has_account phone branch compared auth.users.phone/vendors.phone_number
-- against normalise_nigerian_phone(p_phone), which always returns a value
-- WITH a leading '+'. auth.users.phone is always stored WITHOUT '+' (GoTrue
-- convention, see 20260815000004_strip_plus_from_vendor_phone_auth.sql).
-- vendors.phone_number is mixed in practice — some rows carry '+' (set
-- directly), some don't (trigger-synced via transfer_pioneer_from_lead) —
-- so both sides of that comparison are stripped of '+' rather than assuming
-- one fixed format. vendor_leads.phone is consistently stored WITH '+'
-- (confirmed live), so the lead_only branch is untouched — it was already
-- correct.
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
                  u.phone = LTRIM(normalise_nigerian_phone(p_phone), '+')
                  OR REPLACE(v.phone_number, '+', '') = LTRIM(normalise_nigerian_phone(p_phone), '+')
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
