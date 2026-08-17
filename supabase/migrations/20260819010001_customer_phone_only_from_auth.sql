-- WhatsApp-first customer auth: profiles.phone_number must only ever come
-- from a confirmed auth.users.phone, never client-typed metadata. The old
-- raw_user_meta_data fallback let an unverified, self-reported phone number
-- become "the" number on file for a brand-new customer row — exactly the
-- kind of unverified write this migration exists to eliminate. Vendor
-- branch is untouched (out of scope, different trust model).
CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_type TEXT;
BEGIN
  user_type := NEW.raw_user_meta_data->>'user_type';

  IF user_type = 'vendor' THEN
    INSERT INTO vendors (id, full_name, email, username, phone_number)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.raw_user_meta_data->>'username', 'vendor_' || SUBSTRING(NEW.id::TEXT, 1, 8)),
      COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number', '')
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO profiles (id, full_name, email, phone_number)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.phone, '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Syncs profiles.phone_number from auth.users.phone whenever GoTrue
-- confirms a phone (initial signup handled above via fn_handle_new_user;
-- this covers the phone-change flow, i.e. an UPDATE on an existing row).
-- WHEN clause fires only on genuine confirmation transitions — never on
-- unrelated auth.users writes like last_sign_in_at (which changes on
-- every login and must not re-trigger this).
CREATE OR REPLACE FUNCTION public.fn_sync_customer_phone_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles SET phone_number = NEW.phone WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_customer_phone_from_auth ON auth.users;
CREATE TRIGGER sync_customer_phone_from_auth
AFTER UPDATE ON auth.users
FOR EACH ROW
WHEN (
  NEW.phone IS NOT NULL
  AND NEW.phone_confirmed_at IS NOT NULL
  AND (OLD.phone_confirmed_at IS NULL OR OLD.phone IS DISTINCT FROM NEW.phone)
)
EXECUTE FUNCTION public.fn_sync_customer_phone_from_auth();
