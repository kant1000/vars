-- Restore auto_accept_grace_expires_at on bookings.
-- This column was dropped in 20260624000002 (gate payment model migration)
-- alongside the old tiered-cancel columns. It is unrelated to the binary cancel
-- model and should have been retained: it controls the 5-minute penalty-free
-- cancellation window for auto-accepted bookings.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS auto_accept_grace_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.auto_accept_grace_expires_at IS
  'Set to NOW() + 5 minutes when a booking is auto-accepted. Vendor may cancel penalty-free (no cancellation count, no flag check) before this timestamp. NULL for manually-accepted bookings.';
