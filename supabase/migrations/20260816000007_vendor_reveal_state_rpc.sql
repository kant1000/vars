-- Migration: combined legal-name + phone-number reveal state RPC
--
-- Extends 20260816000006_legal_name_reveal.sql. Two customer-facing
-- surfaces (vendor/[id].tsx profile page, live/[bookingId].tsx tracking
-- screen) need to show a pending-loader placeholder for the vendor's legal
-- name and phone number while a paid booking is in progress, and pop in
-- the real value the moment each field's own gate flips. Rather than two
-- separate RPCs plus client-side guesswork about whether to show a loader
-- at all, one call returns both values and a "pending" flag.
--
-- Also closes a leak of the same class as kyc_legal_name: live/[bookingId].tsx
-- was joining vendors(phone_number) directly into its booking select and
-- gating only at render time (`showPhone = booking.phone_revealed && ...`)
-- — the raw number reached the client regardless of phone_revealed. This
-- RPC is the only path a customer client should read vendors.phone_number
-- through going forward for that screen.

CREATE OR REPLACE FUNCTION get_vendor_reveal_state(p_vendor_id UUID)
RETURNS TABLE(legal_name TEXT, phone_number TEXT, pending BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT v.kyc_legal_name FROM vendors v
      WHERE v.id = p_vendor_id
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.vendor_id = p_vendor_id AND b.user_id = auth.uid()
            AND b.legal_name_revealed = TRUE
        )
    ) AS legal_name,
    (
      SELECT v.phone_number FROM vendors v
      WHERE v.id = p_vendor_id
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.vendor_id = p_vendor_id AND b.user_id = auth.uid()
            AND b.phone_revealed = TRUE
        )
    ) AS phone_number,
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.vendor_id = p_vendor_id AND b.user_id = auth.uid()
        AND b.gate_fired = TRUE
        AND b.status NOT IN ('completed', 'cancelled', 'expired', 'disputed')
    ) AS pending;
$$;

GRANT EXECUTE ON FUNCTION get_vendor_reveal_state(UUID) TO authenticated;
