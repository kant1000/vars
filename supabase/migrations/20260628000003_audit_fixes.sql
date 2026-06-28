-- ============================================================
-- Audit fixes (2026-06-28)
-- 1. UNIQUE(booking_id) on disputes — prevents duplicate disputes per booking
-- 2. increment_pioneer_bookings_completed() — atomic counter increment via RPC
-- ============================================================

-- 1. One dispute per booking
ALTER TABLE disputes
  ADD CONSTRAINT disputes_booking_id_unique UNIQUE (booking_id);

-- 2. Atomic pioneer counter increment (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION increment_pioneer_bookings_completed(vendor_id_arg UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
  UPDATE vendors
  SET pioneer_bookings_completed = COALESCE(pioneer_bookings_completed, 0) + 1
  WHERE id = vendor_id_arg AND pioneer = TRUE;
$$;
