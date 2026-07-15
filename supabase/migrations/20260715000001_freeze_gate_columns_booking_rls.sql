-- ============================================================
-- Migration: Freeze payment-critical columns in booking RLS
--
-- The bookings_user_update and bookings_vendor_update policies
-- (last recreated in 20260603000001_service_taxonomy_v2) froze
-- only transport and summary columns. Gate fields
-- (gate_fired, gate_charged_at, gate_retry_expires_at,
-- paystack_reference) and the compat charge column
-- (service_price_kobo) were left writable by JWT clients.
--
-- Attack vector: a customer JWT PATCH of gate_fired=true
-- prevents the real paystack-gate atomic claim from finding
-- any rows (WHERE gate_fired=false), so no Paystack charge
-- ever fires — vendor delivers the service for free.
--
-- A customer JWT PATCH of service_price_kobo=0 causes the gate
-- to charge the wrong amount (total computed as
-- service_price_kobo + transport_fee_kobo at gate time).
--
-- This migration adds those columns to the frozen list in both
-- policies. Service role (edge functions) bypasses RLS freely.
-- ============================================================

-- ── bookings_user_update ─────────────────────────────────────

DROP POLICY IF EXISTS "bookings_user_update" ON bookings;

CREATE POLICY "bookings_user_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- transport / summary (frozen since 20260531000002 + 20260603000001)
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
    -- payment columns (frozen here for the first time)
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
  );

-- ── bookings_vendor_update ───────────────────────────────────

DROP POLICY IF EXISTS "bookings_vendor_update" ON bookings;

CREATE POLICY "bookings_vendor_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = vendor_id)
  WITH CHECK (
    auth.uid() = vendor_id
    -- transport / summary
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
    -- payment columns
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
  );
