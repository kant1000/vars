-- ============================================================
-- VARS — Migration: vendor_lead_tick (final implementation)
-- Pulled from live DB 2026-05-20. This is the authoritative version.
--
-- Priority order (highest first):
--   1. PROSPECT/COLD → VERIFIED  (KYC approved, linked vendor is verified)
--   2. GO-LIVE message            (lead_state = VERIFIED, no pending phone drafts)
--   3. PROSPECT → COLD            (last_outreach > 7 days ago)
--   4. REENGAGEMENT message       (COLD, 7-day silence)
--   5. INTRODUCTION message       (last_outreach IS NULL, 24h after signup)
--
-- Guards: email channel never blocks WhatsApp cadence.
--         Max 3 sent messages per type per lead. 50 leads per stage.
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

  -- ── Step 2: GO-LIVE — highest priority ───────────────────────────────────────
  DELETE FROM vendor_lead_outreach
  WHERE status IN ('draft', 'approved')
    AND message_type IN ('introduction', 'reengagement')
    AND channel IN ('whatsapp', 'sms')
    AND lead_id IN (
      SELECT id FROM vendor_leads WHERE lead_state = 'VERIFIED' AND converted = false
    );

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
    first_name || ', still thinking about VARS? ' ||
    CASE WHEN pioneer
      THEN 'Your Pioneer spot is still reserved — first 3 bookings are 0% commission, you keep everything. '
      ELSE 'You keep 80% of every booking — on a 20k service that''s 16k in your pocket. '
    END ||
    'KYC takes 2 mins, same way banks verify you. Go live: https://vars.app/activate',
    'draft'
  FROM cold_leads;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  -- ── Step 5: INTRODUCTION ──────────────────────────────────────────────────────
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
    'Hi ' || first_name || '! ' ||
    CASE service_type
      WHEN 'barbing'      THEN 'Lagos men want barbers who come to them — VARS makes that happen.'
      WHEN 'hair_styling' THEN 'Lagos women are booking hair stylists at home every week on VARS.'
      WHEN 'makeovers'    THEN 'Makeup artists on VARS earn from bookings while their clients come to them.'
      ELSE                     'VARS connects home service beauty professionals with Lagos customers who pay upfront.'
    END ||
    ' ' ||
    CASE WHEN pioneer
      THEN 'You have a Pioneer spot — first 3 bookings are 0% commission.'
      ELSE 'You keep 80% of every booking.'
    END ||
    ' Complete your profile to go live: https://vars.app/activate',
    'draft'
  FROM intro_leads;
  GET DIAGNOSTICS v_extra_count = ROW_COUNT;
  v_queue_count := v_queue_count + v_extra_count;

  RETURN QUERY SELECT v_cold_count + v_verified_count, v_queue_count;
END;
$$;

GRANT EXECUTE ON FUNCTION vendor_lead_tick() TO service_role;
