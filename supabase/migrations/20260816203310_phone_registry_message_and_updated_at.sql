-- Remediates two small gaps found in a review of 20260816201838_phone_identity_registry.sql:
--
-- 1. The raised exception still said "already registered under a different
--    account type", but the registry now also blocks same-table duplicates
--    (two profiles rows, or two vendors rows, sharing a phone) — the message
--    was stale for that case and could mislead support/debugging. Reworded
--    to be role-agnostic.
-- 2. updated_at was set by the column DEFAULT on first insert but never
--    refreshed afterward, so it was effectively just "inserted_at". Now
--    bumped whenever the same owner re-saves the same phone (a no-op that
--    previously did nothing to the row at all).
--
-- Combined into one UPDATE + FOUND check, replacing the separate
-- SELECT EXISTS probe: if the conflicting row belongs to this same owner,
-- the UPDATE finds and refreshes it (no-op re-save); if FOUND is false, the
-- conflict is a genuine different owner, so raise.

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
    -- Refresh updated_at if the conflicting row is already this same account
    -- (a no-op re-save); FOUND stays false only for a genuine different owner.
    UPDATE phone_identity_registry
       SET updated_at = now()
     WHERE normalized_phone = v_phone AND owner_id = NEW.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'phone_number already registered to another account'
        USING ERRCODE = 'unique_violation';
    END IF;
  END;

  RETURN NEW;
END;
$$;
