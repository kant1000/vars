-- Drop the get_cancellation_policy() function which implemented the old
-- three-tier cancellation fee schedule. The binary gate cancel model
-- (pre-gate free / post-gate locked) replaced it in 20260624000002.
-- The function referenced bookings columns dropped in that same migration
-- and would error if called.
DROP FUNCTION IF EXISTS get_cancellation_policy(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ);
