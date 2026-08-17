-- Confirmed-location-first discovery: read/write helpers for the existing
-- (previously unused) profiles.session_location geography column, so the
-- Discover tab can persist a customer-confirmed browsing location instead
-- of silently using whatever live GPS reading happened to be on hand.
--
-- Also adds recipient_name/recipient_phone to bookings, for "booking for
-- someone else" — null on both means the booking is for the account holder.

CREATE OR REPLACE FUNCTION public.get_my_session_location()
RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT ST_Y(session_location::geometry), ST_X(session_location::geometry)
  FROM public.profiles
  WHERE id = auth.uid() AND session_location IS NOT NULL;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_session_location() TO authenticated;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_phone text;
