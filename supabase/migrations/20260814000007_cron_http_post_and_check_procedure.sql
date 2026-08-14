-- ============================================================
-- Migration: fix cron_http_post_and_check (procedure, not function)
--
-- See 20260814000006 for context. net.http_post() only queues a request
-- row in net.http_request_queue; pg_net's background worker runs on a
-- separate connection and can't see that row until the queuing
-- transaction commits. A plain FUNCTION can't COMMIT mid-body, so
-- polling net._http_response from inside the same call always times
-- out — verified by hand: a call against a known-healthy endpoint
-- (send-reminders, live 200s at the time) still hit "no response after
-- 5000ms" under the function version, then succeeded immediately once
-- converted to a PROCEDURE with an explicit COMMIT after queuing.
--
-- CALL supports mid-body COMMIT; SELECT-of-a-function does not — hence
-- the type change, and the cron jobs below switching from
-- "SELECT net.http_post(...)" to "CALL cron_http_post_and_check(...)".
-- ============================================================

DROP ROUTINE IF EXISTS cron_http_post_and_check(text, jsonb, jsonb);

CREATE OR REPLACE PROCEDURE cron_http_post_and_check(
  p_url     text,
  p_headers jsonb,
  p_body    jsonb DEFAULT '{}'::jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  req_id      bigint;
  resp_status int;
  resp_error  text;
  waited_ms   int := 0;
BEGIN
  req_id := net.http_post(url := p_url, headers := p_headers, body := p_body);
  COMMIT;

  LOOP
    SELECT status_code, error_msg INTO resp_status, resp_error
    FROM net._http_response WHERE id = req_id;
    EXIT WHEN resp_status IS NOT NULL OR resp_error IS NOT NULL OR waited_ms >= 5000;
    PERFORM pg_sleep(0.25);
    waited_ms := waited_ms + 250;
  END LOOP;

  IF resp_status IS NULL AND resp_error IS NOT NULL THEN
    RAISE EXCEPTION 'cron_http_post_and_check: request to % errored: %', p_url, resp_error;
  ELSIF resp_status IS NULL THEN
    RAISE EXCEPTION 'cron_http_post_and_check: request to % — no response after %ms', p_url, waited_ms;
  ELSIF resp_status < 200 OR resp_status >= 300 THEN
    RAISE EXCEPTION 'cron_http_post_and_check: % returned non-2xx status %', p_url, resp_status;
  END IF;
END;
$$;

-- Rewire the existing HTTP-calling cron jobs (jobnames per live inspection,
-- 2026-08-14) to CALL the checked wrapper. cron.job isn't migration-tracked
-- elsewhere in this repo (jobs were created via direct SQL), so this is the
-- first migration to touch cron.job rows — alter_job is idempotent and
-- included here for reproducibility. deliver-outreach-cron is currently
-- active=false (paused on purpose, see roadmap-launch reminder); alter_job
-- only changes command, not active, so it stays paused.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'phone-reveal'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/phone-reveal',
    p_headers := '{"Content-Type": "application/json", "x-vars-cron-secret": "vars-cron-secret-2026"}'::jsonb,
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'send-reminders'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/send-reminders',
    p_headers := '{"Content-Type": "application/json", "x-vars-cron-secret": "vars-cron-secret-2026"}'::jsonb,
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'reschedule-expire-hourly'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/reschedule-expire',
    p_headers := jsonb_build_object('Content-Type', 'application/json', 'x-vars-cron-secret', 'vars-cron-secret-2026'),
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'booking-expire-every-5min'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/paystack-release',
    p_headers := jsonb_build_object('Content-Type', 'application/json', 'x-vars-cron-secret', 'vars-cron-secret-2026'),
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'paystack-settle-cron'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/paystack-settle',
    p_headers := '{"Content-Type": "application/json", "x-vars-cron-secret": "vars-cron-secret-2026"}'::jsonb,
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'photo-consent-expire-cron'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/photo-consent-expire',
    p_headers := '{"Content-Type": "application/json", "x-vars-cron-secret": "vars-cron-secret-2026"}'::jsonb,
    p_body    := '{}'::jsonb
  );$c$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'deliver-outreach-cron'),
  command := $c$CALL cron_http_post_and_check(
    p_url     := 'https://ojxlfbmetoyggetdfwro.supabase.co/functions/v1/deliver-outreach',
    p_headers := '{"Content-Type": "application/json", "x-vars-cron-secret": "vars-cron-secret-2026"}'::jsonb,
    p_body    := '{}'::jsonb
  );$c$
);
