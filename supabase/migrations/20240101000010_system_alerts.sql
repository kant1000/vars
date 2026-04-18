-- ============================================================
-- Migration 010: System alerts for cron health monitoring
--
-- system_alerts holds one row per currently-failing cron job.
-- check_cron_health() is called every 2 hours by pg_cron.
-- It upserts on failure and deletes on recovery — so the admin
-- dashboard only shows jobs that are actively broken.
-- ============================================================

CREATE TABLE IF NOT EXISTS system_alerts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type     text        NOT NULL DEFAULT 'cron_failure',
  job_name       text        NOT NULL,
  job_id         bigint,
  last_failed_at timestamptz NOT NULL,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_alerts_job_name_unique UNIQUE (job_name)
);

-- No public RLS policies — only service role (admin dashboard) can read/write
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- ── Core health-check function ───────────────────────────────
-- For each cron job, looks at its most recent run within the last
-- 4 hours (2× the check interval, so a missed check doesn't create
-- a false alarm).
--   • latest run = failed  → upsert alert
--   • latest run = succeeded → delete alert (auto-resolve)
CREATE OR REPLACE FUNCTION check_cron_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (rd.jobid)
      j.jobname,
      rd.jobid,
      rd.status,
      rd.start_time,
      rd.return_message
    FROM cron.job_run_details rd
    JOIN cron.job j ON j.jobid = rd.jobid
    WHERE rd.start_time > now() - interval '4 hours'
    ORDER BY rd.jobid, rd.start_time DESC
  LOOP
    IF r.status = 'failed' THEN
      INSERT INTO system_alerts
        (alert_type, job_name, job_id, last_failed_at, error_message)
      VALUES
        ('cron_failure', r.jobname, r.jobid, r.start_time, r.return_message)
      ON CONFLICT (job_name) DO UPDATE
        SET last_failed_at = EXCLUDED.last_failed_at,
            error_message  = EXCLUDED.error_message;

    ELSIF r.status = 'succeeded' THEN
      DELETE FROM system_alerts WHERE job_name = r.jobname;
    END IF;
  END LOOP;
END;
$$;
