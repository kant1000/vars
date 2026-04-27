-- Migration 017: Remove vestigial 'available' value from block_state_enum
-- The 'available' state was defined in migration 005 but is never used.
-- Available slots carry no vendor_calendar row at all — absence of a row
-- means the slot is open. This migration removes the unused value to
-- prevent confusion when reading the schema.
--
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE, so we recreate
-- the enum. No rows use 'available' so the USING cast is safe.

-- Step 1: drop column default so we can alter the type
ALTER TABLE vendor_calendar ALTER COLUMN block_state DROP DEFAULT;

-- Step 2: swap to a new enum without 'available'
CREATE TYPE block_state_enum_new AS ENUM (
  'unavailable',
  'auto_accept',
  'transport_buffer'
);

ALTER TABLE vendor_calendar
  ALTER COLUMN block_state TYPE block_state_enum_new
    USING block_state::text::block_state_enum_new;

-- Step 3: restore default, clean up
ALTER TABLE vendor_calendar ALTER COLUMN block_state SET DEFAULT 'unavailable';

DROP TYPE block_state_enum;
ALTER TYPE block_state_enum_new RENAME TO block_state_enum;
