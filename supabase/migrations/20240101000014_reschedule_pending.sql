-- Migration 014: Vendor reschedule suggestion flow
-- Adds rescheduled_pending booking status and the column that stores the
-- vendor's suggested alternative time.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rescheduled_pending';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS suggested_scheduled_at timestamptz;

COMMENT ON COLUMN bookings.suggested_scheduled_at IS
  'When a vendor suggests a new time (status = rescheduled_pending), the
   proposed slot is stored here. Cleared once the customer responds.';
