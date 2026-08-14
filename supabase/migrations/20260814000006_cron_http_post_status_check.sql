-- ============================================================
-- Migration: cron_http_post_and_check
--
-- net.http_post() is fire-and-forget: pg_cron's job_run_details.status
-- only reflects whether the SQL statement executed, not whether the
-- edge function it called returned 2xx. A function 401ing or 500ing on
-- every invocation still shows "succeeded" in cron.job_run_details, so
-- check_cron_health() (migration 010) never sees it — this was the exact
-- blind spot behind the phone-reveal 401 loop going unnoticed for weeks.
--
-- SUPERSEDED by migration 20260814000007: this FUNCTION version polls
-- net._http_response inside the same transaction that queued the
-- request, so pg_net's background worker (a separate connection) can
-- never see the queued row — every call times out regardless of what
-- the target actually returns. Confirmed by hand against a known-healthy
-- endpoint. Left as-is (not edited) since it was already applied; fixed
-- forward in 20260814000007 by converting to a PROCEDURE with a COMMIT
-- after queuing, which functions cannot do.
-- ============================================================

CREATE OR REPLACE FUNCTION cron_http_post_and_check(
  p_url     text,
  p_headers jsonb,
  p_body    jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  req_id      bigint;
  resp_status int;
  resp_error  text;
  waited_ms   int := 0;
BEGIN
  req_id := net.http_post(url := p_url, headers := p_headers, body := p_body);

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
