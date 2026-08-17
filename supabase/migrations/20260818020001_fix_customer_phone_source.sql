-- Fix: fn_handle_new_user's customer branch set profiles.phone_number from
-- raw_user_meta_data->>'phone_number' only, never NEW.phone — the exact bug
-- already fixed for the vendor branch in 20260815000001_fix_vendor_phone_
-- identity_check.sql, left open here. For a phone-first customer OTP
-- signup (auth.users.phone set, no metadata phone_number), this would
-- leave profiles.phone_number blank despite auth.users.phone being set.
-- Required before customer phone/WhatsApp OTP signup can work correctly.

CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
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
      COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone_number', '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
