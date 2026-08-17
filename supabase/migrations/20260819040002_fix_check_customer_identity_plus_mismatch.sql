-- Second, deeper bug behind the same "existing customer routed through
-- OTP+signup" report: check_customer_identity's phone match compared
-- u.phone/p.phone_number (both stored WITHOUT a leading '+' -- GoTrue's
-- own convention, see 20260815000004_strip_plus_from_vendor_phone_auth.sql
-- for the vendor-side precedent of this exact issue) against
-- normalise_nigerian_phone(p_phone), which always returns a value WITH a
-- leading '+'. The comparison could never match, for any phone, ever --
-- confirmed live: querying with the exact phone on file for an existing
-- account still returned not_found. Fixed by stripping the '+' before
-- comparing, on both sides of the OR.
--
-- Note: check_vendor_identity (20260816000001_sync_vendor_email_from_lead)
-- has the identical '+' vs no-'+' mismatch in its phone branch and was not
-- touched here -- flagged separately, not fixed in this migration.
CREATE OR REPLACE FUNCTION public.check_customer_identity(p_phone text)
 RETURNS TABLE(status text, has_password boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM auth.users u JOIN profiles p ON p.id = u.id
      WHERE u.phone = LTRIM(normalise_nigerian_phone(p_phone), '+')
         OR p.phone_number = LTRIM(normalise_nigerian_phone(p_phone), '+')
    ) THEN 'has_account' ELSE 'not_found' END,
    COALESCE((
      SELECT p.password_set FROM auth.users u JOIN profiles p ON p.id = u.id
      WHERE u.phone = LTRIM(normalise_nigerian_phone(p_phone), '+')
         OR p.phone_number = LTRIM(normalise_nigerian_phone(p_phone), '+')
      LIMIT 1
    ), false)
$function$;
