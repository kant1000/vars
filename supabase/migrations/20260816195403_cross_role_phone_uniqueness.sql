-- Close a duplicate-account gap: neither profiles.phone_number nor
-- vendors.phone_number has a UNIQUE constraint, and nothing checks the two
-- tables against each other. A person could register as a customer, then
-- separately register as a vendor with a different email but the SAME
-- phone number (or vice versa), and nothing anywhere noticed.
--
-- This adds a cross-table BEFORE INSERT/UPDATE trigger — the only mechanism
-- that uniformly covers every write path to either table's phone_number
-- (fn_handle_new_user's signup insert, savePhoneNumber's post-OAuth update,
-- and transfer_pioneer_from_lead's vendor update all go through this).
--
-- Blank phone (vendors.phone_number is NOT NULL DEFAULT '', profiles.phone_number
-- is nullable) is never treated as a collision. Reuses normalise_nigerian_phone
-- (see 20260816000003_fix_phone_normalise_non_nigerian.sql) rather than a new
-- normalizer, so this agrees with every other phone comparison in the schema.
--
-- This is a trigger, not a table-wide constraint, so it only blocks NEW
-- writes going forward — it cannot fail applying against existing data, and
-- no backfill is required. Run the diagnostic query at the bottom against
-- prod before shipping to see whether any accounts are already affected;
-- remediation for those (if any) is a separate, manual decision.

CREATE OR REPLACE FUNCTION public.fn_check_cross_role_phone_unique()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_phone TEXT;
BEGIN
  normalized_phone := NULLIF(TRIM(normalise_nigerian_phone(NEW.phone_number)), '');
  IF normalized_phone IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'profiles' THEN
    IF EXISTS (
      SELECT 1 FROM vendors v
       WHERE normalise_nigerian_phone(v.phone_number) = normalized_phone
         AND v.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'phone_number already registered under a different account type'
        USING ERRCODE = 'unique_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    IF EXISTS (
      SELECT 1 FROM profiles p
       WHERE normalise_nigerian_phone(p.phone_number) = normalized_phone
         AND p.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'phone_number already registered under a different account type'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_cross_role_phone ON profiles;
CREATE TRIGGER trg_profiles_cross_role_phone
  BEFORE INSERT OR UPDATE OF phone_number ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_check_cross_role_phone_unique();

DROP TRIGGER IF EXISTS trg_vendors_cross_role_phone ON vendors;
CREATE TRIGGER trg_vendors_cross_role_phone
  BEFORE INSERT OR UPDATE OF phone_number ON vendors
  FOR EACH ROW EXECUTE FUNCTION fn_check_cross_role_phone_unique();

-- Diagnostic only — not run by this migration. Expected: 0 rows.
-- SELECT p.id AS profile_id, v.id AS vendor_id, normalise_nigerian_phone(p.phone_number) AS phone
--   FROM profiles p
--   JOIN vendors v ON normalise_nigerian_phone(v.phone_number) = normalise_nigerian_phone(p.phone_number)
--  WHERE NULLIF(TRIM(normalise_nigerian_phone(p.phone_number)), '') IS NOT NULL;
