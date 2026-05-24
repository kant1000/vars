-- ============================================================
-- VARS — Migration: vendor_lead_tick — August launch copy + email channel
-- 2026-05-25
--
-- Changes vs 20260514204440:
--   1. All WhatsApp copy updated to reflect August customer launch
--      ("set up your profile to be ready from day one").
--   2. Email channel records queued alongside WhatsApp for all three
--      stages: introduction (welcome_email), reengagement
--      (reengagement_email), go_live.
--   3. Existing 75 draft WhatsApp intro records refreshed with new copy.
--
-- Email records go to status = 'draft' (same as WhatsApp).
-- Email channel never blocks WhatsApp cadence (existing guard preserved).
-- ============================================================

-- ── Refresh copy on existing draft introduction WhatsApp records ──────────────

UPDATE vendor_lead_outreach vlo
SET message_body =
  'Hi ' || SPLIT_PART(TRIM(vl.full_name), ' ', 1) || '! VARS opens to customers in August — set up your ' ||
  CASE vl.service_type
    WHEN 'barbing'      THEN 'barbering'
    WHEN 'hair_styling' THEN 'hair styling'
    WHEN 'makeovers'    THEN 'makeovers'
    ELSE                     'beauty services'
  END ||
  ' profile now to be ready from day one. ' ||
  CASE WHEN vl.pioneer
    THEN 'Your Pioneer spot is confirmed — first 3 bookings are 0% commission. '
    ELSE 'You keep 80% of every booking. '
  END ||
  'Complete your profile: https://vars.app/activate'
FROM vendor_leads vl
WHERE vlo.lead_id = vl.id
  AND vlo.message_type = 'introduction'
  AND vlo.channel = 'whatsapp'
  AND vlo.status = 'draft';

-- ── Replace tick function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.vendor_lead_tick()
RETURNS TABLE(transitions integer, queued integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cold_count     INT := 0;
  v_verified_count INT := 0;
  v_queue_count    INT := 0;
  v_extra_count    INT := 0;
BEGIN

  -- ── Step 1: PROSPECT/COLD → VERIFIED ─────────────────────────────────────────
  WITH verified_transitions AS (
    UPDATE vendor_leads SET lead_state = 'VERIFIED', last_state_change = NOW()
    WHERE lead_state IN ('PROSPECT', 'COLD')
      AND converted = false
      AND EXISTS (
        SELECT 1 FROM vendors
        WHERE vendors.id = vendor_leads.converted_vendor_id
          AND vendors.kyc_status = 'verified'
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_verified_count FROM verified_transitions;

  -- ── Step 2: GO-LIVE — highest priority ───────────────────────────────────────
  DELETE FROM vendor_lead_outreach
  WHERE status IN ('draft', 'approved')
    AND message_type IN ('introduction', 'reengagement')
    AND channel IN ('whatsapp', 'sms')
    AND lead_id IN (
      SELECT id FROM vendor_leads WHERE lead_state = 'VERIFIED' AND converted = false
    );

  -- Go-live WhatsApp
  WITH verified_leads AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.lead_state = 'VERIFIED'
      AND vl.converted = false
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND status IN ('draft', 'approved')
          AND channel IN ('whatsapp', 'sms')
      )
      AND (
        SELECT COUNT(*) FROM vendor_lead_outreach
        WHERE lead_id = vl.id AND message_type = 'go_live' AND status = 'sent'
      ) < 3
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    'VERIFIED',
    'go_live',
    'whatsapp',
    'VERIFIED_GOLIVE_WA',
    'Congrats ' || first_name || '! You''re verified on VARS. Your profile is live. ' ||
    CASE WHEN pioneer
      THEN 'Your first 3 bookings are 0% commission — you keep everything. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Start accepting bookings: https://vars.app/go-live',
    'draft'
  FROM verified_leads;
  GET DIAGNOSTICS v_queue_count = ROW_COUNT;

  -- Go-live email
  WITH verified_leads_email AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.lead_state = 'VERIFIED'
      AND vl.converted = false
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND channel = 'email'
          AND message_type = 'go_live'
          AND status IN ('draft', 'approved', 'sent')
      )
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    'VERIFIED',
    'go_live',
    'email',
    'You''re live on VARS, ' || first_name || '!',
    'Congrats ' || first_name || '! Your profile is now live on VARS. Customers will be able to find and book you. ' ||
    CASE WHEN pioneer
      THEN 'Your first 3 bookings are 0% commission — you keep everything. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Open the VARS app to check your schedule and get ready.',
    'draft'
  FROM verified_leads_email;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  -- ── Step 3: PROSPECT → COLD ───────────────────────────────────────────────────
  WITH cold_transitions AS (
    UPDATE vendor_leads SET lead_state = 'COLD', last_state_change = NOW()
    WHERE lead_state = 'PROSPECT'
      AND converted = false
      AND last_outreach IS NOT NULL
      AND last_outreach < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cold_count FROM cold_transitions;

  -- ── Step 4: REENGAGEMENT ──────────────────────────────────────────────────────
  DELETE FROM vendor_lead_outreach
  WHERE status IN ('draft', 'approved')
    AND message_type = 'introduction'
    AND channel IN ('whatsapp', 'sms')
    AND lead_id IN (
      SELECT id FROM vendor_leads
      WHERE lead_state = 'COLD'
        AND converted = false
        AND last_outreach IS NOT NULL
        AND last_outreach < NOW() - INTERVAL '7 days'
    );

  -- Reengagement WhatsApp
  WITH cold_leads AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.lead_state = 'COLD'
      AND vl.converted = false
      AND vl.last_outreach IS NOT NULL
      AND vl.last_outreach < NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND status IN ('draft', 'approved')
          AND channel IN ('whatsapp', 'sms')
      )
      AND (
        SELECT COUNT(*) FROM vendor_lead_outreach
        WHERE lead_id = vl.id AND message_type = 'reengagement' AND status = 'sent'
      ) < 3
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    'COLD',
    'reengagement',
    'whatsapp',
    'COLD_REENGAGEMENT_WA',
    CASE WHEN pioneer
      THEN first_name || ', VARS opens to customers in August and your Pioneer spot is still reserved. First 3 bookings: 0% commission. Set up before we go live: https://vars.app/activate'
      ELSE first_name || ', VARS opens to customers in August. Vendors who set up now will be first in customer searches. Takes 5 minutes: https://vars.app/activate'
    END,
    'draft'
  FROM cold_leads;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  -- Reengagement email
  WITH cold_leads_email AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.service_type,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.lead_state = 'COLD'
      AND vl.converted = false
      AND vl.last_outreach IS NOT NULL
      AND vl.last_outreach < NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND channel = 'email'
          AND message_type = 'reengagement_email'
          AND status IN ('draft', 'approved', 'sent')
      )
      AND (
        SELECT COUNT(*) FROM vendor_lead_outreach
        WHERE lead_id = vl.id AND message_type = 'reengagement_email' AND status = 'sent'
      ) < 3
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    'COLD',
    'reengagement_email',
    'email',
    'Still thinking, ' || first_name || '? We open in August — don''t miss it',
    'Hi ' || first_name || ', you signed up to offer ' ||
    CASE service_type
      WHEN 'barbing'      THEN 'barbering'
      WHEN 'hair_styling' THEN 'hair styling'
      WHEN 'makeovers'    THEN 'makeovers'
      ELSE                     'beauty services'
    END ||
    ' on VARS but haven''t completed your profile yet. We open to customers in August — vendors who complete setup now will be live from day one. KYC takes 2–3 minutes. ' ||
    CASE WHEN pioneer
      THEN 'Your Pioneer spot is still reserved — first 3 bookings are 0% commission. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Complete your profile: https://vars.app/activate',
    'draft'
  FROM cold_leads_email;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  -- ── Step 5: INTRODUCTION ──────────────────────────────────────────────────────

  -- Introduction WhatsApp
  WITH intro_leads AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.lead_state,
      vl.service_type,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.converted = false
      AND vl.last_outreach IS NULL
      AND vl.lead_state IN ('PROSPECT', 'COLD')
      AND vl.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND status IN ('draft', 'approved')
          AND channel IN ('whatsapp', 'sms')
      )
      AND (
        SELECT COUNT(*) FROM vendor_lead_outreach
        WHERE lead_id = vl.id AND message_type = 'introduction' AND status = 'sent'
      ) < 3
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    lead_state,
    'introduction',
    'whatsapp',
    'INTRO_WA',
    'Hi ' || first_name || '! VARS opens to customers in August — set up your ' ||
    CASE service_type
      WHEN 'barbing'      THEN 'barbering'
      WHEN 'hair_styling' THEN 'hair styling'
      WHEN 'makeovers'    THEN 'makeovers'
      ELSE                     'beauty services'
    END ||
    ' profile now to be ready from day one. ' ||
    CASE WHEN pioneer
      THEN 'Your Pioneer spot is confirmed — first 3 bookings are 0% commission. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Complete your profile: https://vars.app/activate',
    'draft'
  FROM intro_leads;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  -- Introduction email (welcome_email — only ever sent once per lead)
  WITH intro_leads_email AS (
    SELECT
      vl.id,
      COALESCE(SPLIT_PART(TRIM(vl.full_name), ' ', 1), 'there') AS first_name,
      vl.lead_state,
      vl.full_name,
      vl.service_type,
      vl.pioneer
    FROM vendor_leads vl
    WHERE vl.converted = false
      AND vl.last_outreach IS NULL
      AND vl.lead_state IN ('PROSPECT', 'COLD')
      AND vl.created_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM vendor_lead_outreach
        WHERE lead_id = vl.id
          AND channel = 'email'
          AND message_type = 'welcome_email'
          AND status IN ('draft', 'approved', 'sent')
      )
    LIMIT 50
  )
  INSERT INTO vendor_lead_outreach
    (lead_id, state_from, message_type, channel, message_template, message_body, status)
  SELECT
    id,
    lead_state,
    'welcome_email',
    'email',
    CASE WHEN pioneer
      THEN 'Your Pioneer spot on VARS is confirmed, ' || first_name
      ELSE first_name || ', get set up before VARS opens in August'
    END,
    'Hi ' || first_name || '! VARS opens to customers in August — set up your ' ||
    CASE service_type
      WHEN 'barbing'      THEN 'barbering'
      WHEN 'hair_styling' THEN 'hair styling'
      WHEN 'makeovers'    THEN 'makeovers'
      ELSE                     'beauty services'
    END ||
    ' profile now to be ready from day one. ' ||
    CASE WHEN pioneer
      THEN 'Your Pioneer spot is confirmed — first 3 bookings are 0% commission. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Complete your profile: https://vars.app/activate — The VARS Team',
    'draft'
  FROM intro_leads_email;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  RETURN QUERY SELECT v_cold_count + v_verified_count, v_queue_count;
END;
$$;

GRANT EXECUTE ON FUNCTION vendor_lead_tick() TO service_role;
