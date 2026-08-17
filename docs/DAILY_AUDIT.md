# VARS Daily Codebase Audit

**Pre-flight:** run the build/lint checks in `docs/ACCESS_AND_AUDIT.md` → Baseline Audit Order before starting.
NOTE: build or lint failures caused by absent node_modules in a remote execution container are environment limitations, not codebase regressions. Run locally or in a provisioned CI environment to verify.

**Pre-flight: Live Infrastructure** — run these SQL queries in Supabase SQL Editor before Section 3:

```sql
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

SELECT jobname, command
FROM cron.job
WHERE command NOT LIKE '%ojxlfbmetoyggetdfwro%'
  AND command LIKE '%net.http_post%';
```

FAIL if the second query returns any rows — a wrong project ID means the cron job silently calls the wrong project's edge function.

Run every check in order. For each: **PASS**, **WARN**, or **FAIL** with one-line reason.
Final output: severity-grouped summary, then **ITEMS REQUIRING FOUNDER DECISION**.

---

## 1. Schema Integrity

**Source:** `supabase/migrations/*.sql` — read all files.

- Migration sequence: numbered series 000–018 all present (009 is a genuine no-op placeholder stub, confirmed by design); timestamp-based series runs from May 2026 through at least `20260718000002` (latest confirmed) covering leads, outreach, KYC, blog, surcharge, gate-payment, and data-rights migrations — flag any unexpected gap in either series, or any migration dated after the latest known one
- Tables exist: `profiles`, `vendors`, `services`, `vendor_services`, `bookings`, `vendor_calendar`, `reviews`, `disputes`, `payout_history`, `vendor_leads`, `portfolio_photos`, `vendor_lead_outreach`, `system_alerts`, `blog_comments`, `notifications`, `terms_acceptances`, `data_subject_requests`
- `booking_status_enum` contains: `pending`, `accepted`, `expired`, `cancelled`, `on_way`, `arrived`, `service_rendered`, `completed`, `disputed`, `rescheduled_pending`
- `block_state_enum` contains: `unavailable`, `auto_accept`, `transport_buffer` — `available` must **not** be present (removed in 017)
- `disputes.reason` column exists — not `disputes.statement` (renamed in 012)
- `disputes.category` column exists (`dispute_category` enum — added in 013)
- `bookings.suggested_scheduled_at` exists (014)
- `bookings.reschedule_expires_at` exists (015)
- `bookings.access_building`, `access_floor`, `access_flat`, `access_code`, `user_location_lat`, `user_location_lng` exist (011)
- `bookings.transport_fee_kobo INTEGER NOT NULL DEFAULT 0`, `distance_km NUMERIC(6,2) NOT NULL DEFAULT 0`, `pre_transport_buffer_slots INTEGER NOT NULL DEFAULT 0` exist (20260531000002)
- **Gate-payment model** (`20260624000002_gate_payment_model.sql`): `bookings.gate_fired`, `gate_trigger_type` (manual/proximity), `gate_triggered_at`, `gate_charged_at`, `gate_retry_expires_at` exist; `profiles.paystack_authorization_code` exists (reusable-card charge at gate time); `vendors.is_restricted`, `restriction_amount_owed_kobo`, `restriction_reason`, `restriction_repayment_claimed_at` exist and are distinct from `settlement_on_hold` — FAIL if any of these columns are absent, or if the old pre-gate columns (`payment_captured`, `paystack_access_code`, `cancellation_fee_percent`, `cancellation_*_amount_kobo`) have reappeared instead of the gate columns
- `vendors.is_busy` exists (`20260713000001_vendor_busy_status.sql`), maintained by an `AFTER UPDATE OF status ON bookings` trigger — true while any of the vendor's bookings is `on_way`/`arrived`/`service_rendered`; surfaced in `get_nearby_vendors()`
- `bookings_user_update` and `bookings_vendor_update` RLS policies have `WITH CHECK` correlated-subquery guards preventing JWT clients from writing `transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots`, `service_price_kobo`, `paystack_reference`, `gate_fired`, `gate_charged_at`, `gate_retry_expires_at` (frozen list expanded by `20260715000001_freeze_gate_columns_booking_rls.sql`) — FAIL if either policy is absent, the `WITH CHECK` clause is missing, or any of these columns is writable by a JWT client
- `portfolio_photos` has a `consent_state` enum column
- `vendor_leads` has: `pioneer` boolean; `lead_state` enum (PROSPECT/COLD/VERIFIED/CONVERTED), `last_state_change TIMESTAMPTZ NOT NULL`, `last_outreach`, `converted` columns; `UNIQUE(email)` constraint; `email_unsubscribed` boolean column; `privacy_accepted_at` (20260714000002); phone stored E.164-normalized (`20260706000001_normalize_vendor_leads_phone_e164.sql`)
- `vendor_lead_outreach` table exists with `channel`, `status` (draft/approved/sent/failed/blocked), `message_type`, `message_body` columns
- `vendors.kyc_rejection_reason TEXT` column exists (019) — populated on rejection, cleared on each new attempt
- `vendors.profile_image_url TEXT`, `profile_image_raw_url TEXT`, `profile_image_locked BOOLEAN NOT NULL DEFAULT false` exist (20260531000001)
- `vendors_update_own` RLS policy has `WITH CHECK` correlated-subquery guards on `profile_image_url`, `profile_image_raw_url`, `profile_image_locked` — FAIL if absent
- `vendor-identity-images` storage bucket exists and is public (required for mobile `<Image>` auth-free URLs; holds the cropped 400×400 profile photo)
- `vendor-identity-raw` storage bucket exists and is **private** (`20260715000002_private_raw_identity_bucket.sql`) — holds the raw liveness capture, referenced by storage path only, never a public URL — FAIL if it is set to public (raw biometric/liveness images are NDPA-sensitive and must never be publicly addressable)
- `vendors.auto_accept_zone_radius_km` is `NUMERIC(4,1)` constrained to (1, 1.5) — FAIL if column is still INT or constraint allows other values (20260526000001)
- `system_alerts` table exists (010)
- `blog_comments` table exists (022/023) — columns: `article_slug`, `name`, `email`, `body`, `approved BOOLEAN DEFAULT TRUE`, `created_at`; RLS enabled; SELECT policy returns `approved = true` only; anon INSERT policy `WITH CHECK (approved = true)`
- `notifications` table has a partial unique index `notifications_reminder_idempotency` on `(booking_id, type) WHERE type IN ('reminder_24h', 'reminder_1h', 'vendor_reminder_30min')` — prevents duplicate reminder sends under concurrent cron runs (024)
- `terms_acceptances` (`20260714000002`): one immutable row per acceptance — `user_id`, `document_type` enum (`customer_terms`/`privacy_policy`/`vendor_terms`/`vendor_privacy_policy`), `document_version`, `accepted_at`, `ip_address`, `user_agent` — no UPDATE/DELETE policy — FAIL if an UPDATE or DELETE policy exists
- `data_subject_requests` (`20260714000001`): `request_type`, `status` (default 'open'), `deadline_at` (default now()+30 days), `resolved_at`, `resolved_by` — admin-only RLS
- `profiles`/`vendors` have `last_data_export_at`, `is_deleted`, `deleted_at`, `deletion_requested_at` (20260714000003)
- `register_vendor_lead()` Postgres function exists (021) — uses advisory lock for atomic pioneer count + insert
- Booking status trigger restricting invalid JWT client transitions exists and runs `SECURITY INVOKER` (fixed from `SECURITY DEFINER` by `20260629000001_fix_booking_status_transition_trigger.sql`, which superseded the original 016 migration) — FAIL if it runs `SECURITY DEFINER` again
- Migration targeting `rescheduled_pending` adds it to `booking_status_enum` — confirm it targets `booking_status_enum` (not `booking_status`, which was the bug 014 introduced)
- `bookings.recipient_name`, `recipient_phone` exist (`20260817012142_session_location_and_recipient`) — "booking for someone else"; both null means the booking is for the account holder
- `profiles.password_set BOOLEAN NOT NULL DEFAULT false` exists (`20260819040001`) — the only reliable "customer has chosen a real password" signal; `auth.users.encrypted_password IS NOT NULL` is **not** usable for this (GoTrue populates a hash for every row regardless)
- `check_customer_identity(p_phone)` returns `TABLE(status, has_password)`, not a scalar `text` — FAIL if it's ever collapsed back to scalar, the customer login screen indexes the RPC result as a row array and silently breaks (confirmed live, `20260817171751`/`20260817172009`)
- `check_customer_identity` and `check_vendor_identity`'s phone branches strip the leading `+` from `normalise_nigerian_phone(...)` before comparing against `auth.users.phone`/`profiles.phone_number`/`vendors.phone_number` — those columns are stored **without** `+` (GoTrue convention); `normalise_nigerian_phone` always returns a value **with** `+`. FAIL if a future identity-check function reintroduces a bare `= normalise_nigerian_phone(p_phone)` comparison against any of these three columns — confirmed live, this exact mismatch made every existing account unmatchable on both the customer and vendor side before being caught
- `get_booking_client_contact(p_booking_id)` RPC exists — the only path the vendor client should read a booking's phone numbers through (never a raw `recipient_phone`/`profiles.phone_number` join in a list query); gated on `bookings.vendor_id = auth.uid()` and `phone_revealed`
- **Migration/local-file drift**: live migration history is the source of truth, not the local `supabase/migrations/` folder contents by itself — at least one live-applied migration (`20260817144717_check_customer_identity_with_password_flag`) has no local file counterpart (superseded by later `CREATE OR REPLACE` migrations, so current behavior isn't affected, but a from-scratch replay of local files alone would skip it). Cross-check `list_migrations` against local files periodically, not just when something looks wrong.

---

## 2. Edge Function Coverage

**Source:** `ls supabase/functions/` vs `README.md` edge functions table.

All 39 must exist on disk (permanent functions only — `migrate-raw-kyc-images` is a one-time ops function; see §19):

```
paystack-verify-card       paystack-initialize        paystack-gate
paystack-gate-checkout     paystack-webhook           paystack-capture
paystack-release           paystack-settle            paystack-cancel
paystack-verify-bank       vendor-cancel-booking      vendor-claim-repayment
dispute-raise              vendor-kyc-init             vendor-kyc-webhook
vendor-register-lead       vendor-check-identity       vendor-set-zone
vendor-confirm-zone        vendor-update-location      photo-consent-request
photo-consent-respond      photo-consent-expire        phone-reveal
send-reminders             vendor-update-job-status    vendor-suggest-reschedule
customer-accept-reschedule customer-decline-reschedule reschedule-expire
deliver-outreach           submit-review               unsubscribe-lead
send-marketing-email       accept-terms                auth-send-email
auth-send-sms              delete-user-account         export-user-data
```

- **`vendor-cancel-grace` no longer exists as a standalone function** — its grace-window check was merged into `vendor-cancel-booking`. FAIL if `vendor-cancel-grace` is still listed anywhere in README's function table (a known stale entry to fix), and FAIL if it reappears as a separate function without removing the duplicate grace logic from `vendor-cancel-booking`.
- FAIL any other function present in README but absent from disk, or on disk but missing from the README table.

---

## 3. Cron Job Coverage

**Source:** Live database — `SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;`

Cron jobs are registered directly in the database via `pg_cron` and must be verified by querying the live `cron.job` table — not from migration files or README alone.

Nine jobs must be present and active:

| Job | Schedule | Target |
|---|---|---|
| `booking-expire-every-5min` | `*/5 * * * *` | `paystack-release` |
| `paystack-settle-cron` | `*/5 * * * *` | `paystack-settle` |
| `phone-reveal` | `*/5 * * * *` | `phone-reveal` |
| `send-reminders` | `*/5 * * * *` | `send-reminders` |
| `photo-consent-expire-cron` | `0 * * * *` | `photo-consent-expire` |
| `reschedule-expire-hourly` | `0 * * * *` | `reschedule-expire` |
| `cron-health-check` | `0 */2 * * *` | `check_cron_health()` DB fn |
| `vendor-lead-tick` | `0 * * * *` | `vendor_lead_tick()` DB fn |
| `deliver-outreach-cron` | `*/10 * * * *` | `deliver-outreach` edge fn |

**URL integrity (critical):** every `net.http_post` command must reference project ID `ojxlfbmetoyggetdfwro` — FAIL if any command contains a different project ID. The call silently routes to the wrong project with no error.

NOTE: `cron-health-check` and `vendor-lead-tick` call their Postgres functions directly via `SELECT` — not via `net.http_post`. All other jobs use `net.http_post` with the `x-vars-cron-secret` header.

NOTE: a duplicate `reschedule-expire` job (no suffix) was confirmed present and removed from the live project. If it reappears, it will cause reschedule expiry to fire twice per hour.

WARN if README prose describing cron cadence (e.g. "every hour", "every 15 minutes") contradicts the table above or the live `schedule` column — the table and live DB are the source of truth.

---

## 4. Payment Logic

**Source:** `supabase/functions/paystack-settle/index.ts`, `supabase/functions/paystack-cancel/index.ts`, `supabase/functions/vendor-cancel-booking/index.ts`, `supabase/functions/paystack-gate/index.ts`, `supabase/functions/_shared/constants.ts`, `packages/shared/src/constants.ts`

**Transport surcharge:**

- `BASE_RADIUS_KM = 5` defined in both `_shared/constants.ts` (Deno) and `packages/shared/src/constants.ts` (mobile) — FAIL if values differ
- `TRANSPORT_FEE_TIERS` defined in both files with four tiers: 0–3 km over → ₦3,000; 3–6 km → ₦5,000; 6–10 km → ₦7,500; 10 km+ → ₦10,000 — each tier also carries a `preBufferSlots` value (1,1,2,2) driving the pre-booking transport buffer — FAIL if values differ between files or tier boundaries overlap
- `paystack-initialize` calculates surcharge server-side using Haversine; client value never trusted — FAIL if `transport_fee_kobo` is accepted from the request body
- Surcharge stored in Paystack metadata (`transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots` inside `vars_booking`) and read back by `paystack-webhook` on `charge.success` — FAIL if any of the three fields are absent from the metadata or missing from the booking insert
- `totalKobo = service_price_kobo + transport_fee_kobo` is the basis for all downstream money calculations — FAIL if any of `paystack-gate`, `paystack-gate-checkout`, `paystack-settle`, `vendor-cancel-booking`, `customer-decline-reschedule`, `reschedule-expire`, or the `paystack-release` admin dispute path uses `service_price_kobo` alone

**paystack-gate:**

- Atomic gate guard: `UPDATE bookings SET gate_fired = TRUE WHERE id = $1 AND gate_fired = FALSE` — FAIL if the check is non-atomic (two concurrent triggers could both fire)
- Blocks the charge if `vendors.is_restricted = true` — FAIL if a restricted vendor's booking can still be gate-charged
- Returning customer (has `profiles.paystack_authorization_code`): silent `chargeAuthorization` with subaccount split; advances to `on_way` on success
- First-time customer: `initializeTransaction` + checkout push; status stays `accepted` until the `charge.success` webhook fires — FAIL if status is advanced before the webhook confirms
- Both paths must pass subaccount split params (`subaccount`, `bearer: 'account'`, `transaction_charge` for Pioneer) — FAIL if either path charges without the split

**paystack-gate-checkout:**

- Before issuing a new `access_code`, must verify the existing `paystack_reference` with Paystack directly — FAIL if a new reference is generated without checking whether the prior charge already succeeded (double-charge risk)
- Returns 409 if Paystack confirms the charge already succeeded, reconciling the booking to `on_way` in the same call
- Returns 503 if the Paystack verify call itself throws — FAIL if it falls through to generate a new reference when verification is uncertain

**paystack-verify-card:** must check `profiles.paystack_authorization_code` before charging (idempotent, no repeat ₦50 charge); metadata includes `vars_card_verify: true` and `user_id`; `paystack-webhook` must route card-verify events to a dedicated handler that stores the auth code only when `reusable = true` — FAIL if any of these is absent.

**Customer cancellation (`paystack-cancel`) — binary, not tiered:**

- Pre-gate (`gate_fired = false`): unconditionally free — status → `cancelled`, transport buffer released, no Paystack call, no fee/split math — FAIL if any fee or split is charged pre-gate
- Post-gate (`gate_fired = true`): customer is fully blocked from self-cancelling — returns 409, no DB write — FAIL if a post-gate customer cancellation is allowed to proceed
- NOTE: the old tiered fee split (70/30 within 1hr, 15%/5–10 within 15min, 50%/20–30 otherwise) no longer exists in this codebase — do not flag its absence as a regression.

**Vendor-initiated cancellation & restriction (`vendor-cancel-booking`):**

- Gate fired but never charged (`gate_charged_at IS NULL`): free cancel, no restriction, no debt
- Gate fired **and charged** (`gate_charged_at` set): full Paystack refund issued; vendor is set `is_restricted = true`, `is_online = false`, `restriction_amount_owed_kobo = totalKobo`, `restriction_reason` populated — **regardless of whether the refund call itself succeeds** — FAIL if a vendor cancelling a charged booking is not restricted, or if refund failure is silently swallowed instead of logged as a critical/manual-ops item
- Pre-gate vendor cancel: free; contributes to a rolling 30-day cancellation counter (`cancellation_flagged = true` at count ≥ 3) — **unless** the cancellation falls inside the 5-minute auto-accept grace window (`auto_accept_grace_expires_at`), which is exempt from the counter entirely — FAIL if a grace-window cancel increments the 30-day count
- Restriction is lifted only by explicit admin action (`apps/admin/src/app/restrictions/actions.ts`), typically after the vendor calls `vendor-claim-repayment` — FAIL if any automated path clears `is_restricted`
- `is_restricted` must also block: new bookings (`paystack-initialize`), gate charging (`paystack-gate`), settlement release (`paystack-settle`), and self-service account deletion (`delete-user-account`) — FAIL if any of these paths ignores the flag

**paystack-settle:**

- Pioneer exception: `pioneer = true` AND `pioneer_bookings_completed < 3` → 100% of totalKobo to vendor, 0% commission; `pioneer_bookings_completed` increments on each settlement
- Standard split: 80% of totalKobo to vendor / 20% VARS
- Stamp duty: ₦50 on transfers ≥ ₦10,000
- Paystack fee: 1.5% + ₦100 (waived below ₦2,500), capped at ₦2,000
- Settle cron queries only `service_rendered` — `disputed` bookings, `settlement_on_hold = true` vendors, and `is_restricted = true` vendors are all excluded (settlement held pending resolution)
- Auto-release fires 2 hours after `service_rendered_at` — set by DB trigger in migration 001; customer receives a 30-minute warning notification before it fires
- **Known deferred issue — stamp duty threshold:** stamp duty should apply to the vendor transfer amount (80% of totalKobo), not the gross total. Services where vendor net < ₦10,000 may trigger ₦50 stamp duty incorrectly. WARN; not a launch blocker. Flag if seen.

---

## 5. Booking Status Machine

**Source:** `supabase/migrations/20260629000001_fix_booking_status_transition_trigger.sql` (supersedes the original `20240101000016_booking_status_trigger.sql`)

- The DB trigger only enforces three direct JWT-client transitions: `accepted → on_way`, `on_way → arrived`, `arrived → service_rendered` — FAIL if the trigger permits skipping any of these three from a JWT client (e.g. `on_way → service_rendered` directly)
- The rest of the state machine is enforced by edge-function application logic, not the DB trigger, since edge functions run as service role and bypass it entirely:
```
pending             → accepted | expired | rescheduled_pending | cancelled
rescheduled_pending → accepted | cancelled
accepted            → on_way | cancelled
on_way              → disputed
arrived             → disputed
service_rendered    → completed | disputed
```
Check the relevant edge functions directly for these transitions rather than expecting the DB trigger to gate them — do not treat "not in the trigger" as a FAIL by itself.

---

## 6. Auto-Accept System

**Source:** `supabase/functions/paystack-initialize/index.ts`, `supabase/functions/vendor-update-location/index.ts`, `supabase/functions/vendor-cancel-booking/index.ts`, `supabase/functions/_shared/calendar.ts`

- Firing conditions: `auto_accept_enabled` true AND user within zone AND `auto_accept_paused_due_to_drift = false` AND `auto_accept_zone_confirmed_date` matches today **or** the booking date AND the slot is actually free — FAIL if the zone-confirmation check is tightened back to "today only" without also accepting the booking date, or if the slot-availability check is dropped
- Drift threshold: `zone_radius + 3km` — FAIL if `+1km` or any flat constant is used instead of the relative formula
- Grace window: 5 minutes; controlled by `auto_accept_grace_expires_at`; checked inside `vendor-cancel-booking` (there is no separate `vendor-cancel-grace` function anymore — its logic was merged in)
- Transport buffers — two kinds, both use `transport_buffer_source_booking_id` FK and are deleted by the same cleanup on any cancellation:
  - Post-booking: two 30-min blocks after booking end; clamped to 22:00 UTC; skipped if slot occupied
  - Pre-booking: 1 or 2 slots (30 or 60 min) immediately before booking start, driven by `pre_transport_buffer_slots` on the booking; only inserted when `transport_fee_kobo > 0`; clamped to 07:00 UTC; skipped if slot occupied, collision logged — FAIL if pre-booking buffers are inserted when `transport_fee_kobo = 0` or if they are not deleted on cancellation
- Zone confirmation: maximum once per day (`auto_accept_zone_confirmed_date = today`)
- `vendor-update-location` writes `vendor_current_lat`/`lng` whenever the vendor has an active `on_way` booking (client-driven cadence, not server-enforced every 60s); the drift flag itself is recalculated on every call regardless of booking status — FAIL if the location write is missing from the `on_way` path

---

## 7. Notification Strings

**Source:** `supabase/functions/_shared/notifications.ts`

All 50 exports must be present. FAIL for each missing one:

```
msg_paymentAuthorized            msg_vendorAccepts                msg_vendorDeclines
msg_reminder24h                  msg_reminder1h                   msg_reminder15min
msg_vendorOnWay                  msg_vendorArrived                msg_serviceRendered
msg_autoReleaseWarning           msg_paymentReleased              msg_cancelFree
msg_autoAccepted                 msg_bookingCancelledByVendor     msg_bookingCancelledFullRefund
msg_disputeRaised_user           msg_disputeResolved_userRefunded msg_disputeResolved_vendorPaid
msg_consentRequest               msg_reschedule_suggested_customer
msg_gatePaymentNeeded            msg_gatePaymentFailed            msg_gatePaymentExpired
msg_vendor_newBooking            msg_vendor_reminder30min         msg_vendor_bookingExpired
msg_vendor_reminder24h           msg_vendor_reminder1h            msg_vendor_reminder15min
msg_vendor_paymentReleased       msg_vendor_customerCancelledFree msg_vendor_newReview
msg_vendor_verificationApproved  msg_vendor_verificationFailed
msg_vendor_autoAccepted          msg_vendor_serviceRenderReminder msg_vendor_selfCancelled
msg_disputeRaised_vendor         msg_vendor_consentApproved       msg_vendor_consentDeclined
msg_vendor_consentExpired        msg_vendor_gatePaymentPending    msg_vendor_gateCharged
msg_vendor_gatePaymentExpired    msg_vendor_restricted            msg_vendor_restrictionLifted
msg_vendor_onWayNudge
msg_reschedule_accepted_vendor   msg_reschedule_declined_vendor   msg_reschedule_expired_vendor
```

- NOTE: `msg_cancelTier1`, `msg_cancelTier2`, `msg_cancelNonRefundable`, and `msg_vendor_userCancelledWithFee` no longer exist — they belonged to the retired tiered-cancellation-fee model (see §4). Do not flag their absence.
- `msg_vendor_newBooking` takes five parameters: `(clientFirstName, service, date, time, earningsFormatted)` — FAIL if the fifth parameter is absent or if the call site in `paystack-webhook` omits it
- FAIL if user-facing sentence strings appear inline in any `supabase/functions/*/index.ts` rather than imported from this file.
- NOTE: `docs/VARS_PROJECT_CONTEXT.md` §3 does not enumerate all 50 of these. The `notifications.ts` file itself is the source of truth — the context doc table is not exhaustive.

---

## 8. Pioneer Counter and Atomic Registration

**Source:** `apps/landing/` (search for `vendor_leads` query), `supabase/functions/vendor-register-lead/index.ts`, `register_vendor_lead()`

- Landing page pioneer counter queries all `vendor_leads` (total registrations for social proof, no `pioneer=true` filter) — FAIL only if it queries the `vendors` table instead
- `vendor-register-lead` sets `pioneer = true` on the lead record at insert
- Registration must call `register_vendor_lead()` Postgres function — FAIL if it uses a direct `INSERT` instead (race condition on pioneer slots)
- `register_vendor_lead()` uses an advisory lock — FAIL if the advisory lock is absent
- `UNIQUE(email)` on `vendor_leads` — FAIL if duplicate emails can be inserted via any other path

---

## 9. KYC Flow

**Source:** `supabase/functions/vendor-kyc-webhook/index.ts`, `supabase/functions/vendor-kyc-init/index.ts`, `supabase/functions/paystack-verify-bank/index.ts` (action=save)

- Clean pass: sets `kyc_status = verified`. `is_active = true` is now a **separate, gated** write — only set if `paystack_subaccount_code` already exists on the vendor row (fixed 2026-08-14; previously set unconditionally, letting a vendor become bookable/payable before a bank account was ever registered). `paystack-verify-bank`'s `save` action does the mirror-image check: sets `is_active = true` there instead, if `kyc_status` is already `verified` by the time the bank account is saved. FAIL if either write sets `is_active = true` without checking the other condition.
- Failure: `kyc_status = rejected`, `kyc_rejection_reason` populated, `is_active` explicitly reset to `false` (fixed 2026-08-14 — previously never reset, so a vendor could stay bookable after rejection if `is_active` had been set true by an earlier verification). Surfaces in admin queue. `msg_vendor_verificationFailed` push/in-app notification sent, plus a WhatsApp send via `vars_vendor_kyc_rejected` (Meta template submitted and approved 2026-08-14 — see `docs/MESSAGING_SYSTEM.md`).
- `needs_review` (both the missing-data-after-GET-fallback path and the image-upload-failure path) now sends a push/in-app notification (`msg_vendor_needsReview`, added 2026-08-14) — previously silent, vendor had no signal anything happened beyond polling `step-5-pending`. No WhatsApp on this path (not a terminal state).
- Clean pass also sends WhatsApp via `vars_vendor_golive` (Meta-approved, already used elsewhere) — instant, at the actual verification event, not via the hourly `vendor_lead_tick` cron. FAIL if this WhatsApp send is missing on the verified path or if `vendor_lead_tick`'s go-live generation is ever reintroduced (retired as dead code 2026-08-14 — see §15).
- `vendor-kyc-init` refuses to re-initiate a session if `kyc_status` is already `verified` (fixed 2026-08-14 — previously allowed a stray retap to regress `kyc_status` back to `pending` without ever touching `is_active`, silently dropping a live vendor from discovery).
- Push notification deep link for the verified event is `/(vendor-tabs)/profile` (fixed 2026-08-14 — was the invalid route `/vendor-tabs`, matching no registered screen; same fix applied in `_shared/notifications.ts`'s auto-inject for any vendor push with a `bookingId`, and in `paystack-settle/index.ts`'s service-render-reminder push — FAIL if `/vendor-tabs` (without the parenthesized group) reappears anywhere as a push `screen` value).
- On each new KYC attempt: `kyc_rejection_reason` is cleared before the new session is initiated
- Webhook authenticated via HMAC using `YOUVERIFY_WEBHOOK_SECRET` before any processing
- No raw ID data stored at any point
- Trust layer — on clean pass, `vendor-kyc-webhook` must also: extract the Youverify liveness face image (tried across multiple candidate field paths), crop to 400×400 JPEG (top 65% geometric crop), upload the raw original to the **private** `vendor-identity-raw` bucket (path — not full URL — stored in `profile_image_raw_url`), upload the cropped version to the **public** `vendor-identity-images` bucket (public URL stored in `profile_image_url`), and set `profile_image_locked = true` on the vendor row — FAIL if any write is absent on the accepted path; FAIL if the raw image is uploaded to the public `vendor-identity-images` bucket
- `profile_image_locked` must only be written by service role — RLS guards on `vendors_update_own` `WITH CHECK` (confirmed in Section 1) prevent JWT overwrite; FAIL if a vendor JWT can set `profile_image_url` directly
- WARN always: Youverify webhook payload schema is not yet confirmed with their team (`docs/VARS_PROJECT_CONTEXT.md` §4). Face image field path is tried via multiple candidates and the matched index is logged. Flag if code makes rigid single-field assumptions.

---

## 10. Cancellation Flag, Restriction, and Suspension

**Source:** `supabase/functions/vendor-cancel-booking/index.ts`

Three separate, non-overlapping vendor flags — do not conflate them:

- **`cancellation_flagged`** (soft signal): set when a vendor's rolling 30-day **pre-gate, free** cancel count reaches ≥ 3. Grace-window cancels are exempt and don't count toward it (see §4/§6). A flagged vendor stays live and bookable; no vendor notification, no admin alert on new flag — both are known gaps, not bugs.
- **`is_restricted`** (hard gate, gate-payment model): set unconditionally whenever a vendor cancels a booking that was already gate-charged (see §4). Blocks new bookings, gate charging, settlement, and self-service account deletion. Vendor **is** notified (`msg_vendor_restricted` / `msg_vendor_restrictionLifted`). Cleared only by explicit admin action.
- **`is_suspended = true`**: the separate, always-manual admin action that removes a vendor from discovery via RLS: `is_active = TRUE AND is_suspended = FALSE`. No automated suspension trigger exists.
- FAIL if `cancellation_flagged` or `is_restricted` is found to auto-set `is_suspended`, or vice versa — these three flags must remain independent.

---

## 11. Access Detail Security

**Source:** `apps/mobile/app/booking/`, `supabase/functions/paystack-initialize/index.ts`

- Step 3 inputs are structured fields: `access_building`, `access_floor`, `access_flat`, `access_code` — not free text
- Filter strips sequences of 7+ consecutive digits and `@` symbols silently — validation applied at the mobile app layer (`sanitize()`, used in both the booking flow and the dispute-reason field), not in the edge function
- No unfiltered free-text field exposed before service begins

---

## 12. Brand Constants

**Source:** `apps/mobile/` — grep

- Vendors with no reviews: must show "New on VARS" — FAIL if empty stars are rendered
- `#0A7AFF` must not appear as `backgroundColor` on screen, container, or card-level components — FAIL if found at that scope; interactive element backgrounds (buttons, active tabs, pills) and the notification-icon tint in `app.config.js` are exempt by design
- ScissorsLoader spec:
  - Sizes: small = 23×24 px, medium = 39×39 px, large = 61×63 px — FAIL if old values (35/58/92 px) appear
  - Animation: 0.7s cycle (350ms close + 350ms open), ease-in-out, CLOSE_DEG = 32 — FAIL if 33° or bounce easing
  - ViewBox: must be `"-120 -90 800 920"` for the mobile ScissorsLoader component (`VB_H = 920`, per the CLAUDE.md rule) — FAIL if `"0 0 555 718"` (original, blades clip) or `"-120 -90 800 820"` (insufficient bottom clearance)
  - Rotation: must use nested translate-rotate-untranslate pattern (`G transform={translate(pivot)}` → `AnimatedG rotation` → `G transform={translate(-pivot)}`) — FAIL if `originX`/`originY` props are used on `AnimatedG` (unreliable on React Native 0.76 new architecture)
  - color prop: `light` (#FFFFFF) on dark/primary-colour backgrounds; `dark` (#1A1A1A) on white or surface backgrounds — FAIL if hardcoded colour values appear inside the component
- Pull-to-refresh: `RefreshControl` must suppress the native OS spinner (`tintColor="transparent"`, `colors={['transparent']}`) and render an inline `ScissorsLoader` instead — FAIL if the native spinner is visible
- Splash: `app.config.js` `splash.backgroundColor` must be `"#000000"` — FAIL if `"#111111"` or any other value (mismatch causes letterbox strips on device)
- Hex colour check: `constants/colors.ts` defines an approved semantic colour system — FAIL only for colour values outside the base palette (`#111111`, `#FFFFFF`, `#F5F5F5`, `#0A7AFF`, `#1A1A1A`) that appear hardcoded in component or screen files without referencing `constants/colors.ts`
- VendorPriceInput: pioneer preview must show "You keep 100% — Pioneer booking · ₦X,XXX" when `pioneer = true` AND `pioneer_bookings_completed < 3`; "You'll receive: ₦X,XXX" otherwise — FAIL if this preview triggers a fetch per keystroke rather than deriving from props
- Web `ScissorIcon` (roadmap): `viewBox` must be `"-120 -90 800 920"` and `height="37"` — FAIL if original `"-120 -90 800 820"`/`height="33"` (blade tips clip at ±30° on the roadmap page). NOTE: the roadmap icon intentionally uses `CLOSE_DEG = 30` vs. mobile's 32° — a documented, deliberate divergence, not a bug.

---

## 13. V1 Scope Boundary

**Source:** grep `apps/` and `supabase/functions/`

FAIL for any implemented feature matching:

```
wallet  top-up  subscription  loyalty  augmented reality  virtual try
multi-service  address book  saved address  full offline
```

WARN for TODO or comment references to these features.

---

## 14. Launch Flow Integrity

**Source:** `apps/mobile/app/index.tsx`, `apps/mobile/app/_layout.tsx`

- `app/index.tsx` must return `null` — FAIL if it contains a `router.replace()` or any redirect logic
- `app/_layout.tsx` must preload both auth state and `vars_onboarding_done` (AsyncStorage) before calling `SplashScreen.hideAsync()` — FAIL if either is missing from the pre-hide gate
- Routing must be guarded by a single-fire ref (`didInitRoute`) — FAIL if `useEffect` dependencies could trigger multiple redirects
- No `ScissorsLoader` overlay must exist between splash and destination screen — FAIL if a full-screen animated overlay is rendered in `_layout.tsx` after the splash hides
- Homepage (`/(tabs)/index.tsx`): must show `ScissorsLoader` (size="small", theme-aware color) while `loading && vendors.length === 0` — FAIL if a blank screen or immediate empty-state is rendered on first load
- Booking flow Step 3 (Location step): transport surcharge preview must calculate distance client-side via Haversine using vendor zone coordinates fetched at `BookingFlow` mount; when `transport_fee_kobo > 0`, total shown must include the surcharge and the note "Your stylist is travelling further to reach you, this price reflects that." must appear — FAIL if the pay button shows `service_price_kobo` alone when a surcharge applies; WARN if vendor zone coordinates are unavailable and preview silently shows service price only (acceptable fallback)

---

## 15. Vendor Lead Outreach System

**Source:** `supabase/functions/_shared/lead-copy.ts`, `supabase/functions/deliver-outreach/index.ts`, Postgres `vendor_lead_tick()` function (latest: `20260814000002_retire_dead_tick_golive.sql`)

**lead-copy.ts exports** — all 5 must be present, FAIL for each missing:
```
welcomeEmail  reengagementEmail  whatsappIntroTemplate  whatsappReengagementTemplate  whatsappGoLiveTemplate
```

- The `whatsapp*Template()` functions return `{ name, params }` (a Meta HSM template name + positional body params), not free text — FAIL if any WhatsApp send path builds a `type: 'text'` 360dialog payload for a business-initiated message. `sendTransactionalWhatsApp()` in `notifications.ts` (the free-form `type: 'text'` sender) has zero callers as of 2026-08-14 — phone-reveal was converted to `sendWhatsAppTemplate()` (`vars_phone_reveal_customer`/`vars_phone_reveal_vendor`) since it's business-initiated, not session-initiated as previously assumed here. Kept for a genuine session-initiated use case if one arises; FAIL if it gains a caller for a business-initiated send.
- `welcomeEmail`/`reengagementEmail` must vary output by `service_type` (barbing/hair_styling/makeovers/other) AND pioneer status — FAIL if either branch is absent
- `whatsappIntroTemplate` and `whatsappReengagementTemplate` must vary their profession/service-label param by `service_type` — FAIL if hardcoded (the reengagement WhatsApp copy in `vendor_lead_tick()` was fixed in `20260608000001` to include the service label in both pioneer/non-pioneer branches — a template missing it is out of sync with the live SQL wording). `whatsappGoLiveTemplate` does NOT vary by service_type (never included it in any migration) — this one is intentional, not a gap
- `lead-copy.ts` must read `LAUNCH_MONTH` from `Deno.env` (defaulting to `'October'`) — FAIL if launch month is hardcoded as a string literal

**vendor_lead_tick() priority order (highest first)** — FAIL if order differs:
1. PROSPECT/COLD → VERIFIED (KYC approved) — this transition is itself structurally unreachable (see below), kept only for the lead-state field's own bookkeeping
2. Clear any pending intro/reengagement WhatsApp drafts for VERIFIED leads — go-live *message generation* was retired 2026-08-14 as dead code (see next bullet); this cleanup step alone remains, now itself a no-op for the same reason
3. PROSPECT → COLD (`last_outreach > 7 days ago`)
4. REENGAGEMENT message (`lead_state = COLD`, 7-day silence) — deletes any pending intro WhatsApp draft first
5. INTRODUCTION message (`last_outreach IS NULL`, 24h after signup)

**Known structural issue, not yet fixed (flagged 2026-08-14, left as-is per explicit decision):** Step 1's `converted = false` condition can never be satisfied at the moment KYC completes — `transfer_pioneer_from_lead()` (`20260705000002`+) sets `vendor_leads.converted = TRUE` at vendor-row-creation time (signup), long before KYC starts. `lead_state` can therefore never actually reach `'VERIFIED'`. This is why go-live message generation (previously Step 2's WhatsApp/email inserts) was retired outright rather than fixed — `vendor-kyc-webhook` now sends the verified WhatsApp instantly and directly instead (see §9). WARN if this is ever "fixed" by changing Step 1's condition without also re-auditing for duplicate sends against the webhook.

Return type: `TABLE(transitions integer, queued integer)` — FAIL if it returns void or a single scalar

**Guards** — FAIL if any are absent:
- Email channel never blocks WhatsApp cadence — only phone channels block new phone messages
- Max 3 sent messages per type per lead
- 50 leads processed per tick

**deliver-outreach:**
- WhatsApp routed via **360dialog** (`D360-API-KEY` header, `DIALOG360_BASE_URL`) — Termii has been fully retired from this codebase. FAIL if any Termii reference (`TERMII_API_KEY`, `TERMII_SENDER_ID`, or provider code) reappears in `supabase/functions/`
- SMS channel is explicitly stubbed/unused — 360dialog does not support SMS; this is intentional, not a gap — WARN only if the SMS branch is invoked as if live rather than a documented no-op
- Email sent via Resend
- Stamps `last_outreach` on lead for phone channels only — FAIL if email stamps `last_outreach`
- Guards email sends against `email_unsubscribed = true` on the lead record — FAIL if this check is absent
- Marks record `sent`/`failed` with provider message ID
- `DELIVERY_LIVE` secret gates real delivery — logs only when unset; FAIL if provider calls fire without this flag set
- Outreach emails must include RFC 8058 `List-Unsubscribe` headers (mailto: + HTTPS) pointing to the `unsubscribe-lead` function — FAIL if headers are absent
- Auth: accepts `x-vars-cron-secret` (cron calls) OR `Authorization: Bearer DELIVER_OUTREACH_SECRET` (manual/admin calls) — FAIL if only one path is implemented

**unsubscribe-lead:**
- Sets `email_unsubscribed = true` on `vendor_leads` — FAIL if it modifies any other column or table
- Must verify `UNSUBSCRIBE_SECRET` token before writing — FAIL if unauthenticated writes are possible

**vendor-register-lead welcome email:**
- On POST: must auto-create an `approved` `welcome_email` outreach record — FAIL if it only inserts the lead without creating the outreach record
- Phone number must be normalised to E.164 (`+234XXXXXXXXXX`) before insert — FAIL if raw local format (`080XXXXXXXXXX`) is stored
- WARN if `DELIVERY_LIVE=true` but 360dialog/Resend secrets are unset

**Auth OTP consistency:** two separate functions send OTP over WhatsApp — `auth-send-sms` (despite its name, the Supabase "Send SMS" hook for phone-based auth) and `auth-send-email` (the "Send Email" hook, which dual-delivers to WhatsApp if a phone is found for the user). Both use the same `DIALOG360_API_KEY`/`DIALOG360_BASE_URL` as outreach, and both send the same `vars_login_otp` Authentication-category template with the same 2-component payload (`body` with the OTP text param, `button` with `sub_type: 'copy_code'` and a `coupon_code` param carrying the same OTP) — FAIL if auth OTP and outreach ever diverge onto different WhatsApp providers/credentials, if the two OTP functions diverge onto different template names, or if either drops the button component (the approved template requires a mandatory Copy Code button, confirmed 2026-08-14 — a body-only send will be rejected as a component-count mismatch).

---

## 16. Connectivity Resilience

**Source:** `apps/mobile/lib/`

Four utilities must exist and match spec — FAIL for each deviation:
- `lib/useNetworkState.ts` — polls Google generate_204; 30s interval online, 8s offline; FAIL if a third-party dependency is used instead
- `lib/fetchWithRetry.ts` — 3 attempts, 8s abort-controller timeout per attempt, exponential backoff (1s → 2s); FAIL if retry count or timeout differs
- `lib/actionQueue.ts` — AsyncStorage-backed; `enqueueAction()` + `flushQueue()`; replays in order, removes each entry on success; FAIL if queue is in-memory only (lost on app restart)
- `lib/cache.ts` — AsyncStorage TTL cache; `cacheSet` / `cacheGet` / `cacheInvalidate`; FAIL if cache is not read on offline state

**components/OfflineBanner.tsx:**
- Fixed amber bar rendered when `useNetworkState` reports offline
- Slides in on disconnect, slides out automatically on reconnect — FAIL if manual dismissal is required or banner persists after reconnection

---

## 17. Admin Panel

**Source:** `apps/admin/src/`

- All mutations (KYC overrides, dispute resolution, outreach approvals, restriction lifts) must run through Next.js Server Actions with service-role client — FAIL if `SUPABASE_SERVICE_ROLE_KEY` is referenced in a client component or exposed in the browser bundle
- Cookie-based session (`sb-access-token`); Next.js middleware must redirect unauthenticated requests to `/login` — FAIL if any admin route is accessible without auth
- Disputes: SLA timer per dispute — warns at 18h, critical at 24h — FAIL if thresholds differ
- Disputes: each card must show a colour-coded `dispute_category` label — FAIL if category is absent from the UI
- Outreach queue: checkboxes + bulk approve/reject with per-message channel selector — FAIL if bulk actions bypass the channel selector
- Outreach compose panel: filter by service type, converted/unconverted toggle — FAIL if either filter is absent
- KYC queue: defaults to rejected cases only; clean passes never reach the queue — FAIL if verified vendors appear requiring admin action
- Vendors list: must show both `profile_image_url` (circular, 40×40) and `profile_image_raw_url` (rectangular audit image labelled "Audit") per vendor row — FAIL if either column is absent from the query or not rendered; `profile_image_raw_url` is a storage path in the private `vendor-identity-raw` bucket, so the admin page must generate a fresh signed URL server-side (`createSignedUrls`, 3600s TTL) before rendering — legacy rows where `profile_image_raw_url` still starts with `http` may use that URL directly — FAIL if a raw storage path is set as an image `src` without first being signed
- Restrictions view: must allow lifting `is_restricted` after reviewing `restriction_amount_owed_kobo`/`restriction_reason`, and must be the only path in the codebase that clears it — FAIL if restriction can be cleared anywhere else

---

## 18. Data Subject Rights & Account Deletion

**Source:** `supabase/functions/accept-terms/index.ts`, `export-user-data/index.ts`, `delete-user-account/index.ts`, `vendor-check-identity/index.ts`, `apps/landing/src/app/delete-account/`

- `accept-terms`: requires a signed-in JWT; inserts one immutable `terms_acceptances` row per document (`customer_terms`/`privacy_policy`/`vendor_terms`/`vendor_privacy_policy`) with `document_version`, `ip_address`, `user_agent` — FAIL if it updates an existing row instead of inserting a new one
- `export-user-data`: JWT-authenticated, rate-limited to 1 export/24h via `last_data_export_at`; returns a JSON download covering account, bookings, reviews, notifications, terms acceptances, plus role-specific data (vendor: services/payout_history/portfolio_photos; customer: favourites); explicitly excludes KYC biometrics and Paystack tokens; logs a `data_subject_requests` row (`request_type: 'portability'`, `status: 'completed'`) — FAIL if raw KYC images or Paystack authorization codes are included in the export, or the audit row is not written
- `delete-user-account`: soft-delete/anonymize, not a hard delete. Blocks (400) if: active booking in a non-terminal status, an open dispute, `vendors.is_restricted = true`, or pending vendor payouts. On success: nulls PII, sets `is_deleted`/`deleted_at`, anonymizes reviews/blog comments, hard-deletes notifications/favourites, disables auth via a long `ban_duration` (not `deleteUser`, to avoid cascade-deleting related rows) — logs a `data_subject_requests` row (`request_type: 'erasure'`) — FAIL if any guard is missing, if a restricted vendor can self-delete, or if auth deletion uses `deleteUser` directly. NOTE: portfolio photo storage cleanup on deletion is a deferred manual admin step by design — don't flag it as incomplete.
- `vendor-check-identity`: public, unauthenticated, pre-sign-in lookup (email/phone → has_account/lead_only/not_found) used to route pre-registered leads at signup; performs no mutation — FAIL if it starts requiring auth (breaks the pre-signup routing use case) or starts mutating data
- Landing `/delete-account` page is a static instructions page (Play Store Data Safety requirement), not a self-service deletion flow — documents the in-app path and a support-email fallback — FAIL only if it claims to perform deletion itself without directing to the real in-app flow or support fallback

---

## 19. Outstanding Operational Items

**Source:** `docs/VARS_PROJECT_CONTEXT.md` §2, §4–6

- `reschedule-expire-hourly` cron — edge function and migrations built and merged; job confirmed in live project. WARN only if removed or renamed in the Dashboard.
- `photo-consent-expire-cron` — confirmed present in live project. WARN only if removed or renamed.
- `booking-expire-every-5min` — confirmed in live project. Critical: without this job, unanswered bookings sit as pending indefinitely and customer funds are never released. FAIL if missing from Dashboard.
- `vendor-lead-tick` — must be registered hourly. WARN until confirmed in Dashboard.
- `deliver-outreach-cron` — deployed and confirmed active at `*/10 * * * *`. Delivery is stubbed — set `DELIVERY_LIVE=true` in Supabase secrets to activate real 360dialog/Resend delivery.
- `migrate-raw-kyc-images` — one-time idempotent ops function. Run if any vendor has `profile_image_raw_url LIKE 'http%'` (legacy records where raw image was stored in the public bucket before the bucket split). Invoke with `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Safe to re-run — skips vendors already using storage paths. Run `SELECT id FROM vendors WHERE profile_image_raw_url LIKE 'http%'` first to determine whether a run is needed.
- WhatsApp delivery — code now sends `type: 'template'` (not free text) for all business-initiated sends: `vars_vendor_intro`, `vars_vendor_reengagement`, `vars_vendor_golive` (outreach, `lead-copy.ts`) and `vars_login_otp` (auth OTP, `auth-send-sms`, Authentication category). Blocked only on Meta HSM approval of these 4 templates via 360dialog, plus `DIALOG360_API_KEY`/`DIALOG360_BASE_URL` set in Supabase secrets. FAIL if any of these send paths reverts to `type: 'text'`. `sendTransactionalWhatsApp()` in `notifications.ts` (phone-reveal) is intentionally still free-form — that's a session-initiated send, not covered by this requirement.
- Youverify webhook schema — unconfirmed with vendor. WARN until confirmed with their team.
- Monnify — no code action; note only if Paystack live mode is blocked at launch.
- `DELIVERY_LIVE` secret — WARN if unset in production and outreach delivery is expected.
- Paystack live mode — blocked on CAC registration. Swap `PAYSTACK_SECRET_KEY` once complete; no code changes needed.
- Youverify production credentials — blocked on pricing negotiation. Swap `YOUVERIFY_API_KEY` and `YOUVERIFY_WEBHOOK_SECRET` once complete; no code changes needed.
- `docs/compliance/ropa.md` still lists Termii as a data processor (three stale lines) — WARN to update the doc; this is a docs-only drift, not a code regression.

---

## Output Format

```
PASS — [check]
WARN — [check]: [what to watch]
FAIL — [check]: [what is broken or missing]
```

**ITEMS REQUIRING FOUNDER DECISION**
Anything the audit cannot resolve from the codebase or context docs alone.
