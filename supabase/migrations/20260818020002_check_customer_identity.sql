-- Customer-side counterpart to check_vendor_identity
-- (20260815000001_fix_vendor_phone_identity_check.sql) — same shape, joined
-- to profiles instead of vendors. Simpler than the vendor version: customers
-- have no waitlist/lead concept, so there's no 'lead_only' state — just
-- has_account or not_found (a not_found result means "let's create your
-- account", not an error screen).
CREATE OR REPLACE FUNCTION public.check_customer_identity(p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
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
          JOIN profiles p ON p.id = u.id
         WHERE (p_email IS NOT NULL AND u.email = LOWER(TRIM(p_email)))
            OR (p_phone IS NOT NULL AND (
                  u.phone = normalise_nigerian_phone(p_phone)
                  OR p.phone_number = normalise_nigerian_phone(p_phone)
                ))
      ) THEN 'has_account'
      ELSE 'not_found'
    END
$function$;
