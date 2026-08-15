-- Fix: fn_handle_new_user set vendors.phone_number from
-- raw_user_meta_data->>'phone_number' (only ever populated if the client
-- explicitly passes it, which nothing does) instead of the real
-- auth.users.phone column — asymmetric with how it already correctly uses
-- NEW.email for vendors.email. For a phone-first OTP signup (auth.users.phone
-- set, no metadata phone_number), this left vendors.phone_number blank,
-- which meant transfer_pioneer_from_lead's lead-matching (which matches on
-- vendors.phone_number, since that trigger fires AFTER INSERT ON vendors)
-- could never find the originating vendor_leads row by phone at all —
-- silently breaking full_name/service_type/pioneer backfill and the email
-- sync added in 20260816000001 for every phone-first signup.
--
-- Confirmed live via a direct auth.users insert simulating a phone signup:
-- the resulting vendors row had phone_number = '' despite auth.users.phone
-- being set, and no vendor_leads row was matched/converted.

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
      COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
