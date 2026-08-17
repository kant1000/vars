-- Vendor-side equivalent of get_vendor_reveal_state (20260816000007): the
-- vendor's booking-list query (schedule.tsx) was joining recipient_phone
-- and profiles.phone_number directly into every active booking regardless
-- of phone_revealed — the raw number reached the client the whole time,
-- gating only happened at render time. This RPC is the only path a vendor
-- client should read a booking's contact phone numbers through going
-- forward, fetched on-demand when a booking's detail sheet opens rather
-- than joined into the list.
--
-- Also adds the "original booker" fallback: when a booking is for someone
-- else (recipient_name set), the vendor previously had no way to reach the
-- account holder who actually made and paid for the booking if the
-- recipient turned out to be unreachable. booker_name/booker_phone return
-- the account holder's identity in that case, gated by the same
-- phone_revealed flag as the recipient's own number.
--
-- Scope decision: this protects phone digits only, not names.
-- recipient_name/booker_name are returned unconditionally (pre-reveal
-- included), matching existing behavior where client_name/the sheet's
-- header row already show the name unmoderated today. Only the phone
-- columns are time-gated behind phone_revealed.
CREATE OR REPLACE FUNCTION get_booking_client_contact(p_booking_id UUID)
RETURNS TABLE(
  recipient_name TEXT,
  recipient_phone TEXT,
  booker_name TEXT,
  booker_phone TEXT,
  has_different_recipient BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(b.recipient_name, p.full_name),
    CASE WHEN b.phone_revealed THEN COALESCE(b.recipient_phone, p.phone_number) ELSE NULL END,
    CASE WHEN b.recipient_name IS NOT NULL THEN p.full_name END,
    CASE WHEN b.recipient_name IS NOT NULL AND b.phone_revealed THEN p.phone_number END,
    b.recipient_name IS NOT NULL
  FROM bookings b
  JOIN profiles p ON p.id = b.user_id
  WHERE b.id = p_booking_id AND b.vendor_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_booking_client_contact(UUID) TO authenticated;
