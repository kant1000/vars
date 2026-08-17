-- WhatsApp-first customer auth: phone is now the only signup/login
-- identifier for customers (email is profile metadata only, never used
-- to identify an account). Drops the p_email branch entirely rather than
-- leaving it unused — a real reduction in surface area.
DROP FUNCTION IF EXISTS public.check_customer_identity(text, text);

CREATE FUNCTION public.check_customer_identity(p_phone text)
 RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM auth.users u JOIN profiles p ON p.id = u.id
      WHERE u.phone = normalise_nigerian_phone(p_phone)
         OR p.phone_number = normalise_nigerian_phone(p_phone)
    ) THEN 'has_account'
    ELSE 'not_found'
  END
$function$;
