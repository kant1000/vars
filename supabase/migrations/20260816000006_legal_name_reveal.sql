-- Migration: Gate vendor legal (government) name behind a paid, on-way booking
--
-- vendors.kyc_legal_name was being selected unconditionally by the
-- customer-facing vendor profile screen (apps/mobile/app/vendor/[id].tsx) —
-- any customer viewing any vendor's profile received it, regardless of
-- whether they've ever booked that vendor. RLS on vendors is row-level only
-- (vendors_select_active), so this can't be fixed by RLS alone; the fix is
-- to stop selecting the column in the general profile query and expose it
-- only via a SECURITY DEFINER RPC gated on a real booking having reached
-- the point payment was captured ("I'm on my way", set atomically with
-- gate_fired in paystack-gate).
--
-- 1. New per-booking reveal flag, mirroring phone_revealed/phone_reveal_at.
-- 2. Freeze it in the booking RLS update policies — same attack class already
--    fixed once for gate_fired in 20260715000001 (a customer JWT PATCH of
--    the flag would self-reveal the name without ever paying).
-- 3. RPC that returns kyc_legal_name only if the requesting customer has at
--    least one booking with that vendor where the flag is set (EXISTS across
--    all bookings, not just the latest — reveal persists for that customer+
--    vendor pair once it has ever happened).

-- ============================================================
-- 1. Column
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS legal_name_revealed  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legal_name_reveal_at  TIMESTAMPTZ;

COMMENT ON COLUMN bookings.legal_name_revealed IS
  'Set atomically with gate_fired/status=on_way in paystack-gate. Once true, stays true — never re-hidden.';

-- ============================================================
-- 2. RLS: freeze legal_name_revealed / legal_name_reveal_at
-- ============================================================

DROP POLICY IF EXISTS "bookings_user_update" ON bookings;

CREATE POLICY "bookings_user_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
    AND total_amount IS NOT DISTINCT FROM
        (SELECT b.total_amount FROM bookings b WHERE b.id = bookings.id)
    AND service_summary IS NOT DISTINCT FROM
        (SELECT b.service_summary FROM bookings b WHERE b.id = bookings.id)
    AND service_price_kobo IS NOT DISTINCT FROM
        (SELECT b.service_price_kobo FROM bookings b WHERE b.id = bookings.id)
    AND paystack_reference IS NOT DISTINCT FROM
        (SELECT b.paystack_reference FROM bookings b WHERE b.id = bookings.id)
    AND gate_fired IS NOT DISTINCT FROM
        (SELECT b.gate_fired FROM bookings b WHERE b.id = bookings.id)
    AND gate_charged_at IS NOT DISTINCT FROM
        (SELECT b.gate_charged_at FROM bookings b WHERE b.id = bookings.id)
    AND gate_retry_expires_at IS NOT DISTINCT FROM
        (SELECT b.gate_retry_expires_at FROM bookings b WHERE b.id = bookings.id)
    AND legal_name_revealed IS NOT DISTINCT FROM
        (SELECT b.legal_name_revealed FROM bookings b WHERE b.id = bookings.id)
    AND legal_name_reveal_at IS NOT DISTINCT FROM
        (SELECT b.legal_name_reveal_at FROM bookings b WHERE b.id = bookings.id)
  );

DROP POLICY IF EXISTS "bookings_vendor_update" ON bookings;

CREATE POLICY "bookings_vendor_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = vendor_id)
  WITH CHECK (
    auth.uid() = vendor_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
    AND total_amount IS NOT DISTINCT FROM
        (SELECT b.total_amount FROM bookings b WHERE b.id = bookings.id)
    AND service_summary IS NOT DISTINCT FROM
        (SELECT b.service_summary FROM bookings b WHERE b.id = bookings.id)
    AND service_price_kobo IS NOT DISTINCT FROM
        (SELECT b.service_price_kobo FROM bookings b WHERE b.id = bookings.id)
    AND paystack_reference IS NOT DISTINCT FROM
        (SELECT b.paystack_reference FROM bookings b WHERE b.id = bookings.id)
    AND gate_fired IS NOT DISTINCT FROM
        (SELECT b.gate_fired FROM bookings b WHERE b.id = bookings.id)
    AND gate_charged_at IS NOT DISTINCT FROM
        (SELECT b.gate_charged_at FROM bookings b WHERE b.id = bookings.id)
    AND gate_retry_expires_at IS NOT DISTINCT FROM
        (SELECT b.gate_retry_expires_at FROM bookings b WHERE b.id = bookings.id)
    AND legal_name_revealed IS NOT DISTINCT FROM
        (SELECT b.legal_name_revealed FROM bookings b WHERE b.id = bookings.id)
    AND legal_name_reveal_at IS NOT DISTINCT FROM
        (SELECT b.legal_name_reveal_at FROM bookings b WHERE b.id = bookings.id)
  );

-- ============================================================
-- 3. RPC — the only path a customer client can read kyc_legal_name through
-- ============================================================

CREATE OR REPLACE FUNCTION get_vendor_legal_name(p_vendor_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.kyc_legal_name
  FROM vendors v
  WHERE v.id = p_vendor_id
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.vendor_id = p_vendor_id
        AND b.user_id = auth.uid()
        AND b.legal_name_revealed = TRUE
    );
$$;

GRANT EXECUTE ON FUNCTION get_vendor_legal_name(UUID) TO authenticated;
