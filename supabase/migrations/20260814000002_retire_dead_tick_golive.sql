-- ============================================================
-- VARS — Migration: vendor_lead_tick — retire dead go-live branch
-- 2026-08-14
--
-- The go-live WhatsApp + email generation in Step 2 was structurally
-- unreachable: transfer_pioneer_from_lead() (20260705000002) sets
-- vendor_leads.converted = TRUE the moment a matching vendor row is
-- created — at signup, long before KYC even starts. Step 1's
-- PROSPECT/COLD → VERIFIED transition requires converted = false, so by
-- the time a vendor's KYC could ever become 'verified', its lead is
-- already ineligible for that transition. lead_state can never reach
-- 'VERIFIED', so the go-live WhatsApp/email blocks below it could never
-- fire — confirmed zero go_live records exist in production despite
-- 3+ months of leads.
--
-- vendor-kyc-webhook now sends the "verified" WhatsApp message directly
-- and instantly (reusing the vars_vendor_golive template), so this dead
-- branch is removed rather than fixed — the webhook is the correct,
-- working owner of this notification. The DELETE cleanup at the top of
-- Step 2 (clearing pending intro/reengagement drafts for VERIFIED leads)
-- is left in place — harmless if lead_state='VERIFIED' is never reached,
-- and not itself a source of duplicate/missing sends.
--
-- No other logic changes — same Step 1/3/4/5 transitions and guards.
-- ============================================================

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

  -- ── Step 2: clear pending intro/reengagement drafts for VERIFIED leads ────────
  -- Go-live message generation retired (see header) — vendor-kyc-webhook owns
  -- the verified notification now, sent instantly at the actual verification
  -- event rather than waiting on this hourly tick.
  DELETE FROM vendor_lead_outreach
  WHERE status IN ('draft', 'approved')
    AND message_type IN ('introduction', 'reengagement')
    AND channel IN ('whatsapp', 'sms')
    AND lead_id IN (
      SELECT id FROM vendor_leads WHERE lead_state = 'VERIFIED' AND converted = false
    );

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
      THEN first_name || ', VARS opens to customers in September and your Pioneer spot is still reserved. First 3 bookings: 0% commission. Set up your ' ||
           CASE service_type
             WHEN 'barbing'      THEN 'barbering'
             WHEN 'hair_styling' THEN 'hair styling'
             WHEN 'makeovers'    THEN 'makeovers'
             ELSE                     'beauty services'
           END ||
           ' profile before we go live: https://bookwithvars.com/activate'
      ELSE first_name || ', VARS opens to customers in September. Set up your ' ||
           CASE service_type
             WHEN 'barbing'      THEN 'barbering'
             WHEN 'hair_styling' THEN 'hair styling'
             WHEN 'makeovers'    THEN 'makeovers'
             ELSE                     'beauty services'
           END ||
           ' profile — vendors who set up now will be first in customer searches. Takes 5 minutes: https://bookwithvars.com/activate'
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
    'Still thinking, ' || first_name || '? We open in September — don''t miss it',
    'Hi ' || first_name || ', you signed up to offer ' ||
    CASE service_type
      WHEN 'barbing'      THEN 'barbering'
      WHEN 'hair_styling' THEN 'hair styling'
      WHEN 'makeovers'    THEN 'makeovers'
      ELSE                     'beauty services'
    END ||
    ' on VARS but haven''t completed your profile yet. We open to customers in September — vendors who complete setup now will be live from day one. KYC takes 2–3 minutes. ' ||
    CASE WHEN pioneer
      THEN 'Your Pioneer spot is still reserved — first 3 bookings are 0% commission. '
      ELSE 'You keep 80% of every booking. '
    END ||
    'Complete your profile: https://bookwithvars.com/activate',
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
    'Hi ' || first_name || '! VARS opens to customers in September — set up your ' ||
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
    'Complete your profile: https://bookwithvars.com/activate',
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
      ELSE first_name || ', get set up before VARS opens in September'
    END,
    'Hi ' || first_name || '! VARS opens to customers in September — set up your ' ||
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
    'Complete your profile: https://bookwithvars.com/activate — The VARS Team',
    'draft'
  FROM intro_leads_email;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  RETURN QUERY SELECT v_cold_count + v_verified_count, v_queue_count;
END;
$$;

GRANT EXECUTE ON FUNCTION vendor_lead_tick() TO service_role;
