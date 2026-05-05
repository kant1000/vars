-- Migration 018: Fix missing rescheduled_pending enum value
--
-- Migration 014 attempted to add this value with:
--   ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rescheduled_pending'
-- but the type is named booking_status_enum, so that statement was a no-op
-- (PostgreSQL rejects an ALTER TYPE on a non-existent type name rather than
-- silently ignoring it). This migration adds the missing value correctly.
--
-- Idempotent: IF NOT EXISTS ensures this is safe to re-run.

ALTER TYPE booking_status_enum ADD VALUE IF NOT EXISTS 'rescheduled_pending';
