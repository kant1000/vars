-- Bug caught via SQL simulation (not device testing): fn_handle_new_user's
-- customer branch was writing profiles.phone_number from NEW.phone
-- unconditionally on INSERT — but for a phone-OTP signup, the auth.users
-- row is created (INSERT) the moment the OTP is *sent*, with
-- phone_confirmed_at still NULL. verifyOtp() only fires later, as an
-- UPDATE. So the previous version wrote an UNCONFIRMED phone number into
-- profiles at signup-request time, before the user ever entered a code —
-- exactly the unverified write this whole migration series exists to
-- eliminate. Confirmed empirically: inserting a test row with
-- phone_confirmed_at NULL still produced a populated profiles.phone_number.
--
-- Fix: never trust NEW.phone at INSERT time for customers. The only
-- legitimate writer of profiles.phone_number is the AFTER UPDATE trigger
-- (fn_sync_customer_phone_from_auth, 20260819010001), which only fires once
-- phone_confirmed_at is actually set. Vendor branch is untouched — vendors
-- have a different trust model (lead-sourced phone, synced+confirmed by
-- transfer_pioneer_from_lead), out of scope here.
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
      CASE WHEN NEW.phone_confirmed_at IS NOT NULL THEN NEW.phone ELSE '' END
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
