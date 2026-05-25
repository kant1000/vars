-- ============================================================
-- Partial unique index on notifications for reminder idempotency.
--
-- send-reminders currently checks for duplicate rows with a
-- SELECT maybeSingle() before each send. Under concurrent cron
-- runs that check is not atomic — two runs can both pass the
-- SELECT and both insert, producing duplicate notifications.
--
-- This index makes the insert itself the idempotency gate:
-- the second concurrent insert will fail with a unique violation,
-- which is caught by the DB and bubbled up as an error the
-- function logs and ignores. One reminder per (booking, type).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS notifications_reminder_idempotency
  ON notifications (booking_id, type)
  WHERE type IN ('reminder_24h', 'reminder_1h', 'vendor_reminder_30min');
