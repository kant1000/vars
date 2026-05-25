-- Migration 026: Add UNIQUE constraint on payout_history.booking_id
--
-- Without this, a race between user confirm, auto-release, and admin dispute
-- resolution can all pass the "does a payout exist?" read check before any
-- of them inserts, resulting in duplicate vendor transfers.
--
-- The constraint makes the second insert fail at the DB level, so only one
-- payout per booking can ever be created regardless of concurrency.

ALTER TABLE payout_history
  ADD CONSTRAINT payout_history_booking_id_unique UNIQUE (booking_id);
