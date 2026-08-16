-- Remediates two gaps found in a review of 20260816195403_cross_role_phone_uniqueness.sql:
--
-- 1. That migration's trigger did a plain EXISTS check with no lock and no
--    shared unique object — two concurrent transactions could both pass the
--    check and both commit the same phone under different accounts.
-- 2. It only checked profiles against vendors (and vice versa), never within
--    the same table — two profiles rows (or two vendors rows) could still
--    share a phone.
--
-- Fixes both by replacing the EXISTS-based trigger with a real table backed
-- by a PRIMARY KEY. A duplicate-key insert is resolved atomically by
-- Postgres — there is no time-of-check/time-of-use window — and the
-- registry doesn't care which table a phone came from, so same-table and
-- cross-table collisions are caught by the same mechanism. Confirmed live
-- before writing this migration: zero same-table or cross-table phone
-- conflicts exist in profiles/vendors today, so the backfill below applies
-- cleanly with no manual remediation.
--
-- Also fixes a real bug in normalise_nigerian_phone: any input already
-- starting with '+' was returned via bare TRIM(raw), so
-- '+44 7770 094446' and '+447770094446' didn't collapse to the same value.
-- Fixed using the same strip-non-digits-after-+ pattern already proven in
-- 20260706000001_normalize_vendor_leads_phone_e164.sql. This must ship
-- before the backfill below, since the backfill depends on the corrected
-- function.

CREATE OR REPLACE FUNCTION normalise_nigerian_phone(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 11
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 1) = '0'
    THEN '+234' || SUBSTRING(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 2)

    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 13
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 3) = '234'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    -- UK: +44 + 10-digit local number, stored digits-only (no '+') by GoTrue
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 12
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 2) = '44'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    -- US/Canada: +1 + 10-digit local number, stored digits-only by GoTrue
    WHEN LENGTH(REGEXP_REPLACE(raw, '[^0-9]', '', 'g')) = 11
         AND LEFT(REGEXP_REPLACE(raw, '[^0-9]', '', 'g'), 1) = '1'
    THEN '+' || REGEXP_REPLACE(raw, '[^0-9]', '', 'g')

    -- Already has a '+' — strip any spaces/dashes/etc. after it rather than
    -- trusting the caller's formatting verbatim (was bare TRIM(raw) before).
    WHEN LEFT(TRIM(raw), 1) = '+'
    THEN '+' || REGEXP_REPLACE(SUBSTRING(TRIM(raw) FROM 2), '[^0-9]', '', 'g')

    ELSE TRIM(raw)
  END
$$;

CREATE TABLE phone_identity_registry (
  normalized_phone TEXT PRIMARY KEY,
  owner_table       TEXT NOT NULL CHECK (owner_table IN ('profiles', 'vendors')),
  owner_id          UUID NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill from current data.
INSERT INTO phone_identity_registry (normalized_phone, owner_table, owner_id)
SELECT normalise_nigerian_phone(phone_number), 'profiles', id FROM profiles
 WHERE NULLIF(TRIM(normalise_nigerian_phone(phone_number)), '') IS NOT NULL
UNION ALL
SELECT normalise_nigerian_phone(phone_number), 'vendors', id FROM vendors
 WHERE NULLIF(TRIM(normalise_nigerian_phone(phone_number)), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_sync_phone_identity_registry()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  v_phone := NULLIF(TRIM(normalise_nigerian_phone(NEW.phone_number)), '');

  -- Clear any stale registry row this account held (phone changed or cleared).
  DELETE FROM phone_identity_registry
   WHERE owner_id = NEW.id AND normalized_phone IS DISTINCT FROM v_phone;

  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO phone_identity_registry (normalized_phone, owner_table, owner_id)
    VALUES (v_phone, TG_TABLE_NAME, NEW.id);
  EXCEPTION WHEN unique_violation THEN
    -- Genuine collision unless the existing row is already this same account
    -- re-saving the same phone (e.g. no-op profile update).
    IF NOT EXISTS (
      SELECT 1 FROM phone_identity_registry
       WHERE normalized_phone = v_phone AND owner_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'phone_number already registered under a different account type'
        USING ERRCODE = 'unique_violation';
    END IF;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_cross_role_phone ON profiles;
DROP TRIGGER IF EXISTS trg_vendors_cross_role_phone ON vendors;
DROP FUNCTION IF EXISTS fn_check_cross_role_phone_unique();

CREATE TRIGGER trg_profiles_phone_identity_registry
  BEFORE INSERT OR UPDATE OF phone_number ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_sync_phone_identity_registry();

CREATE TRIGGER trg_vendors_phone_identity_registry
  BEFORE INSERT OR UPDATE OF phone_number ON vendors
  FOR EACH ROW EXECUTE FUNCTION fn_sync_phone_identity_registry();
