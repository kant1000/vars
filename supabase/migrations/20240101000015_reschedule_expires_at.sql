-- Migration 015: Reschedule expiry timestamp
-- Adds the column that tracks when a vendor's reschedule suggestion expires.
-- The reschedule-expire cron reads this to cancel stale rescheduled_pending bookings.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_expires_at timestamptz;

COMMENT ON COLUMN bookings.reschedule_expires_at IS
  'Set to now() + 1 hour when a vendor suggests a reschedule (status = rescheduled_pending).
   The reschedule-expire cron cancels any rescheduled_pending booking where this is in the past.
   Cleared (set to null) once the booking leaves rescheduled_pending for any reason.';
