-- Extend notification idempotency index to cover on_way_nudge and phone_revealed.
-- Original index (20260525140000) only covered the three reminder types.

DROP INDEX IF EXISTS notifications_reminder_idempotency;

CREATE UNIQUE INDEX notifications_reminder_idempotency
  ON notifications (booking_id, type)
  WHERE type IN (
    'reminder_24h',
    'reminder_1h',
    'vendor_reminder_30min',
    'on_way_nudge',
    'phone_revealed'
  );
