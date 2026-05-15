-- ============================================================
-- VARS — Migration 021: Atomic pioneer slot grant
-- Replaces the count-then-insert pattern in vendor-register-lead
-- with a single SECURITY DEFINER function that holds an advisory
-- lock for the duration of the insert, preventing over-allocation
-- when concurrent requests race for the last pioneer slot.
-- ============================================================

-- Unique constraint to prevent duplicate email registrations
ALTER TABLE vendor_leads
  ADD CONSTRAINT vendor_leads_email_unique UNIQUE (email);

-- Atomic function: returns the inserted row id, pioneer flag, and
-- spots_remaining AFTER this insert. Raises on duplicate email.
CREATE OR REPLACE FUNCTION register_vendor_lead(
  p_full_name    TEXT,
  p_email        TEXT,
  p_phone        TEXT,
  p_service_type TEXT,
  p_location     TEXT,
  p_pioneer_max  INT DEFAULT 50
)
RETURNS TABLE (
  lead_id         UUID,
  is_pioneer      BOOLEAN,
  spots_remaining INT,
  already_existed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email        TEXT  := lower(trim(p_email));
  v_existing_id  UUID;
  v_existing_pio BOOLEAN;
  v_count        INT;
  v_is_pioneer   BOOLEAN;
  v_new_id       UUID;
BEGIN
  -- Check duplicate first (fast path, no lock needed)
  SELECT id, pioneer INTO v_existing_id, v_existing_pio
  FROM vendor_leads
  WHERE email = v_email
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT GREATEST(0, p_pioneer_max - COUNT(*))
    INTO spots_remaining
    FROM vendor_leads
    WHERE pioneer = TRUE;

    RETURN QUERY SELECT
      v_existing_id,
      v_existing_pio,
      spots_remaining::INT,
      TRUE;
    RETURN;
  END IF;

  -- Advisory lock scoped to pioneer slot allocation.
  -- pg_try_advisory_xact_lock holds until end of transaction.
  -- Key 1234567890 is arbitrary — just needs to be consistent.
  PERFORM pg_advisory_xact_lock(1234567890);

  -- Re-count inside the lock to get the authoritative value
  SELECT COUNT(*) INTO v_count
  FROM vendor_leads
  WHERE pioneer = TRUE;

  v_is_pioneer := (v_count < p_pioneer_max);

  INSERT INTO vendor_leads (
    full_name, email, phone, service_type, location, pioneer, waitlist
  ) VALUES (
    trim(p_full_name),
    v_email,
    trim(p_phone),
    trim(p_service_type),
    trim(p_location),
    v_is_pioneer,
    NOT v_is_pioneer
  )
  RETURNING id INTO v_new_id;

  -- Spots remaining is calculated after the insert
  spots_remaining := GREATEST(0, p_pioneer_max - v_count - (CASE WHEN v_is_pioneer THEN 1 ELSE 0 END));

  RETURN QUERY SELECT
    v_new_id,
    v_is_pioneer,
    spots_remaining::INT,
    FALSE;
END;
$$;

COMMENT ON FUNCTION register_vendor_lead IS
  'Atomically grants or denies a pioneer slot. Uses advisory lock to prevent
   over-allocation under concurrent registrations. Called by vendor-register-lead
   edge function instead of manual count-then-insert.';
