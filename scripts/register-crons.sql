-- ============================================================
-- VARS — pg_cron job registration
-- Run this once after creating or recreating the Supabase project.
-- All jobs call edge functions via net.http_post with CRON_SECRET.
-- ============================================================
-- Prerequisites:
--   1. Enable the pg_cron and pg_net extensions in Supabase dashboard
--   2. Set CRON_SECRET in Supabase Edge Function secrets
--   3. Replace <PROJECT_REF> with the actual project ref (e.g. ojxlfbmetoyggetdfwro)

-- Convenience variable — replace before running
\set project_ref 'ojxlfbmetoyggetdfwro'

-- Remove all existing VARS cron jobs (idempotent re-registration)
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'booking-expire-every-5min',
  'paystack-settle-cron',
  'phone-reveal',
  'send-reminders',
  'photo-consent-expire-cron',
  'reschedule-expire-hourly',
  'cron-health-check',
  'vendor-lead-tick',
  'deliver-outreach-cron'
);

-- 1. Expire pending bookings + gate-payment windows (every 5 min)
SELECT cron.schedule(
  'booking-expire-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/paystack-release',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 2. Auto-release completed bookings to vendors (every 5 min)
SELECT cron.schedule(
  'paystack-settle-cron',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/paystack-settle',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 3. Reveal phone numbers 15 min before appointment (every 5 min)
SELECT cron.schedule(
  'phone-reveal',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/phone-reveal',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 4. Send appointment reminders at 24h / 1h / 30min (every 5 min)
SELECT cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 5. Expire unanswered photo consent requests (every 5 min)
SELECT cron.schedule(
  'photo-consent-expire-cron',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/photo-consent-expire',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 6. Expire unanswered reschedule suggestions (hourly)
SELECT cron.schedule(
  'reschedule-expire-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/reschedule-expire',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 7. Cron health check — verifies all jobs ran recently (every 2 hours)
SELECT cron.schedule(
  'cron-health-check',
  '0 */2 * * *',
  $$SELECT check_cron_health()$$
);

-- 8. Vendor lead tick — updates pioneer spot counts (every 10 min)
SELECT cron.schedule(
  'vendor-lead-tick',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/vendor-register-lead',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{"action":"tick"}'::jsonb
  )$$
);

-- 9. Deliver approved outreach messages via Termii/Resend (every 10 min)
SELECT cron.schedule(
  'deliver-outreach-cron',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := 'https://<project_ref>.supabase.co/functions/v1/deliver-outreach',
    headers := '{"Content-Type":"application/json","x-vars-cron-secret":"' || current_setting('app.cron_secret') || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
