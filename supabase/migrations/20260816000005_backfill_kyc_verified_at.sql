-- Fix: vendor-kyc-webhook's dbUpdate on the success path never included
-- kyc_verified_at, so every already-verified vendor has it stuck at NULL.
-- Also used as a cache-busting key for the profile photo URL (same
-- storage path every re-verification, so without a changing key a
-- re-verified vendor's fresh photo stays hidden behind a stale cached
-- copy — confirmed live, 2026-08-16). The webhook itself is fixed
-- separately; this backfills existing rows with NOW() as a reasonable
-- stand-in for the real (unrecorded) verification time.

UPDATE vendors
   SET kyc_verified_at = NOW()
 WHERE kyc_status = 'verified'
   AND kyc_verified_at IS NULL;
