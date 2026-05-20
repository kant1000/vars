# VARS Daily Codebase Audit

**Pre-flight:** run the build/lint checks in `docs/ACCESS_AND_AUDIT.md` → Baseline Audit Order before starting.

**Pre-flight: Live Infrastructure** — run these SQL queries in Supabase SQL Editor before Section 3:

```sql
-- Verify all cron jobs and their active state
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- Check for URL integrity — every command must contain the correct project ID
SELECT jobname, command
FROM cron.job
WHERE command NOT LIKE '%ojxlfbmetoyggetdfwro%'
  AND command LIKE '%net.http_post%';
```

FAIL if the second query returns any rows — a wrong project ID means the cron job calls the wrong project's edge function silently.

Run every check in order. For each: **PASS**, **WARN**, or **FAIL** with one-line reason.
Final output: severity-grouped summary, then **ITEMS REQUIRING FOUNDER DECISION**.

---

## 1. Schema Integrity

**Source:** `supabase/migrations/*.sql` — read all files.

- Migration sequence 000–018 is present; 009 is a deliberate placeholder with no schema changes (gap resolved — no flag needed)
- Thirteen 2026\* migration files are present: `20260513210730` through `20260518220101` — these add the lead nurture system, blog comments table, KYC rejection reason, outreach admin policies, and pioneer atomic function
- Tables exist: `profiles`, `vendors`, `services`, `vendor_services`, `bookings`, `vendor_calendar`, `reviews`, `disputes`, `payout_history`, `vendor_leads`, `portfolio_photos`, `vendor_lead_outreach`, `blog_comments`
- `booking_status` enum contains: `pending`, `accepted`, `expired`, `cancelled`, `on_way`, `arrived`, `service_rendered`, `completed`, `disputed`, `rescheduled_pending`
- `block_state_enum` contains: `unavailable`, `auto_accept`, `transport_buffer` — `available` must **not** be present (removed in 017)
- `disputes.reason` column exists — not `disputes.statement` (renamed in 012)
- `bookings.suggested_scheduled_at` exists (014)
- `bookings.reschedule_expires_at` exists (015)
- `portfolio_photos` has a `consent_state` enum column
- `vendor_leads` has: `pioneer` boolean, `waitlist` boolean, `lead_state` TEXT CHECK ('PROSPECT','COLD','VERIFIED','CONVERTED'), `last_state_change` TIMESTAMPTZ NOT NULL DEFAULT NOW(), `last_outreach` TIMESTAMPTZ, `converted` BOOLEAN, `converted_at` TIMESTAMPTZ, `converted_vendor_id` UUID, and a UNIQUE constraint on `email`
- `vendor_lead_outreach.status` CHECK contains: `draft`, `approved`, `sent`, `failed`, `blocked`
- `vendors` has `kyc_rejection_reason TEXT` column (added in 20260515182853)
- `blog_comments` has: `id`, `article_slug`, `name`, `email`, `body`, `approved` BOOLEAN DEFAULT TRUE, `created_at`
- Booking status trigger blocking invalid JWT client transitions exists (016)
- `register_vendor_lead()` function exists in `public` schema — see Section 8 for signature checks

---

## 2. Edge Function Coverage

**Source:** `ls supabase/functions/` vs `README.md` edge functions table.

All 26 must exist on disk:

```
paystack-initialize        paystack-webhook           paystack-capture
paystack-release           paystack-settle            paystack-cancel
paystack-verify-bank       vendor-cancel-booking      vendor-cancel-grace
dispute-raise              vendor-kyc-init            vendor-kyc-webhook
vendor-register-lead       vendor-set-zone            vendor-confirm-zone
vendor-update-location     photo-consent-request      photo-consent-respond
photo-consent-expire       phone-reveal               send-reminders
vendor-suggest-reschedule  customer-accept-reschedule customer-decline-reschedule
reschedule-expire          deliver-outreach
```

FAIL any function present in README but absent from disk, or on disk but missing from the README table.

---

## 3. Cron Job Coverage

**Source:** Live database — `SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;`

Cron jobs are registered directly in the database via `pg_cron`. They cannot be verified from migration files or README alone — always query the live `cron.job` table.

Nine jobs must be present and active:

| Job | Schedule | Target |
|---|---|---|
| `booking-expire-every-5min` | `*/5 * * * *` | `paystack-release` |
| `auto-release-every-5min` | `*/5 * * * *` | `paystack-settle` |
| `phone-reveal-every-5min` | `*/5 * * * *` | `phone-reveal` |
| `send-reminders-every-5min` | `*/5 * * * *` | `send-reminders` |
| `reschedule-expire-hourly` | `0 * * * *` | `reschedule-expire` |
| `check-cron-health` | `0 */2 * * *` | `check_cron_health()` DB fn |
| `paystack-settle-cron` | `*/5 * * * *` | `paystack-settle` |
| `photo-consent-expire-cron` | `*/5 * * * *` | `photo-consent-expire` |
| `deliver-outreach-cron` | `*/10 * * * *` | `deliver-outreach` |

**URL integrity (critical):** Every `net.http_post` command must reference project ID `ojxlfbmetoyggetdfwro`. FAIL if any command contains a different project ID — the call is silently routed to the wrong project.

**WARN:** `paystack-settle-cron` and `auto-release-every-5min` both target `paystack-settle`. Check whether both are intentionally active or whether one is a duplicate that should be removed.

**WARN:** If more than one `reschedule-expire` job appears with different schedules, flag for founder decision — duplicate cron calls are safe but wasteful and indicate a config drift.

---

## 4. Payment Logic

**Source:** `supabase/functions/paystack-settle/index.ts`, `supabase/functions/paystack-cancel/index.ts`

**paystack-settle:**
- Pioneer exception: `pioneer = true` AND `pioneer_bookings_completed < 3` → 100% vendor, 0% commission; `pioneer_bookings_completed` increments on each settlement
- Standard split: 80% vendor / 20% VARS
- Stamp duty: ₦50 on transfers ≥ ₦10,000
- Paystack fee: 1.5% + ₦100, capped at ₦2,000
- Settle cron queries only `service_rendered` — `disputed` bookings must be excluded (escrow stays frozen)
- **Known deferred issue — stamp duty threshold:** Stamp duty should apply to the vendor transfer amount (80% of service fee), not the gross service fee. Services priced ₦10,000–₦12,499 produce a vendor net below ₦10,000, meaning no stamp duty is due — but code may charge ₦50 based on the gross amount. WARN; not a launch blocker. Flag if seen.

**paystack-cancel — tiers evaluated in this priority order (first match wins):**
1. Within 1hr of service start → non-refundable: 70% vendor / 30% VARS
2. Within 15min of booking creation → 15% fee: 5% vendor / 10% VARS
3. All other cases → 50% fee: 20% vendor / 30% VARS

FAIL if the order differs — a cancel 10min after booking but 45min before service must hit tier 1, not tier 2.

---

## 5. Booking Status Machine

**Source:** `supabase/migrations/20240101000016_booking_status_trigger.sql`, `supabase/migrations/20240101000018_fix_rescheduled_pending_enum.sql`

Valid transitions only:
```
pending             → accepted | expired | rescheduled_pending | cancelled
rescheduled_pending → accepted | cancelled
accepted            → on_way | cancelled
on_way              → arrived | disputed
arrived             → service_rendered | disputed
service_rendered    → completed | disputed
```

FAIL if trigger permits `on_way → service_rendered` (skipping `arrived`).
FAIL if any multi-step skip is permitted from JWT clients.
Note: edge functions run as service role and bypass the trigger by design.

---

## 6. Auto-Accept System

**Source:** `supabase/functions/paystack-webhook/index.ts`, `supabase/functions/vendor-update-location/index.ts`, `supabase/functions/vendor-cancel-grace/index.ts`

- All 4 conditions required to fire: slot = `auto_accept` AND user within zone AND `auto_accept_paused_due_to_drift = false` AND `auto_accept_zone_confirmed_date = today`
- Drift threshold: `zone_radius + 3km` — FAIL if a flat constant is used instead
- Grace window: 5 minutes; controlled by `auto_accept_grace_expires_at`; `vendor-cancel-grace` must check this timestamp before waiving the penalty
- Transport buffers: two 30-min blocks inserted **after** booking end only; clamped to 22:00; skipped if slot already occupied; deleted on any cancellation
- Zone confirmation: maximum once per day (`auto_accept_zone_confirmed_date = today`)

---

## 7. Notification Strings

**Source:** `supabase/functions/_shared/notifications.ts`

All 43 exports must be present. FAIL for each missing one:

```
msg_paymentAuthorized            msg_vendorAccepts                msg_vendorDeclines
msg_reminder24h                  msg_reminder1h                   msg_reminder15min
msg_vendorOnWay                  msg_vendorArrived                msg_serviceRendered
msg_autoReleaseWarning           msg_paymentReleased
msg_cancelTier1                  msg_cancelTier2                  msg_cancelNonRefundable
msg_autoAccepted                 msg_bookingCancelledByVendor     msg_bookingCancelledFullRefund
msg_disputeRaised_user           msg_disputeResolved_userRefunded msg_disputeResolved_vendorPaid
msg_consentRequest               msg_reschedule_suggested_customer
msg_vendor_newBooking            msg_vendor_reminder30min         msg_vendor_bookingExpired
msg_vendor_reminder24h           msg_vendor_reminder1h            msg_vendor_reminder15min
msg_vendor_paymentReleased       msg_vendor_userCancelledWithFee  msg_vendor_newReview
msg_vendor_verificationApproved  msg_vendor_verificationFailed
msg_vendor_autoAccepted          msg_vendor_serviceRenderReminder msg_vendor_selfCancelled
msg_disputeRaised_vendor         msg_vendor_consentApproved       msg_vendor_consentDeclined
msg_vendor_consentExpired
msg_reschedule_accepted_vendor   msg_reschedule_declined_vendor   msg_reschedule_expired_vendor
```

FAIL if user-facing sentence strings appear inline in any `supabase/functions/*/index.ts` rather than imported from this file.

---

## 8. Pioneer Counter and Lead Registration

**Source:** `apps/landing/` (search for `vendor_leads` query), `supabase/functions/vendor-register-lead/index.ts`, `supabase/migrations/20260515183020_pioneer_atomic.sql`

- Landing page pioneer counter queries `vendor_leads WHERE pioneer = true` — not the `vendors` table
- `vendor-register-lead` calls `public.register_vendor_lead()` — it does NOT insert directly
- `register_vendor_lead()` signature: `(p_full_name TEXT, p_email TEXT, p_phone TEXT, p_service_type TEXT, p_location TEXT, p_pioneer_max INTEGER DEFAULT 50) RETURNS TABLE(lead_id uuid, is_pioneer boolean, spots_remaining integer, already_existed boolean)`
- Email is normalised via `lower(trim(p_email))` before insert and duplicate check
- Pioneer slot allocation uses `pg_advisory_xact_lock(1234567890)` — a fast-path duplicate check runs before the lock; the authoritative re-count runs inside it
- FAIL if pioneer assignment happens outside this function (e.g., inline INSERT in the edge function with no advisory lock)

---

## 9. KYC Flow

**Source:** `supabase/functions/vendor-kyc-webhook/index.ts`, `supabase/functions/vendor-kyc-init/index.ts`

- Clean pass: single update sets `kyc_status = verified` AND `is_active = true` — no admin step required
- Failure: `kyc_status = rejected`; `kyc_rejection_reason` populated; surfaces in admin queue; rejection notification IS sent to vendor via `msg_vendor_verificationFailed`
- Webhook authenticated via HMAC using `YOUVERIFY_WEBHOOK_SECRET` before any processing
- No raw ID data stored at any point

**WARN always:** Youverify webhook payload schema is not yet confirmed with their team (`docs/VARS_PROJECT_CONTEXT.md` §4). Flag if code makes rigid field-name assumptions.

---

## 10. Cancellation Flag and Suspension

**Source:** `supabase/functions/vendor-cancel-booking/index.ts`, `supabase/migrations/20240101000006_vendor_cancellation_flag.sql`

- `cancellation_flagged` set when rolling 30-day cancel count ≥ 3
- `cancellation_flagged ≠ is_suspended` — flagged vendor stays live and bookable
- `is_suspended = true` removes vendor from discovery via RLS: `is_active = TRUE AND is_suspended = FALSE`
- No automated suspension trigger — suspension is manual admin action only
- No vendor notification on flag; no admin alert on new flag — both are known gaps, not bugs

---

## 11. Access Detail Security

**Source:** `apps/mobile/app/booking/`, `supabase/functions/paystack-initialize/index.ts`

- Step 3 inputs are structured fields: `access_building`, `access_floor`, `access_flat`, `access_code` — not free text
- Filter strips sequences of 7+ consecutive digits and `@` symbols silently
- No unfiltered free-text field exposed before service begins

---

## 12. Brand Constants

**Source:** `apps/mobile/` — grep

- Vendors with no reviews: must show "New on VARS" — FAIL if empty stars are rendered
- Hex colours: grep feature screen files for any value outside `#111111`, `#FFFFFF`, `#F5F5F5`, `#0A7AFF`, `#1A1A1A` — FAIL per violation; **`constants/colors.ts` semantic/utility tokens (status indicators, error, success, warning states, badge colours, pioneer gold tokens, star ratings, borders, muted text, offline banner colours) are exempt from this rule**
- `#0A7AFF` must not appear as `backgroundColor` — FAIL if found
- `ScissorsLoader`: large = 80px, small = 28px; animation 1.4s cycle, ease-in-out, no bounce
- Pioneer gold, badge, and offline banner hex values must use named tokens from `constants/colors.ts`, not hardcoded hex — FAIL if `#D4A017`, `#B8860B`, `#92400E`, `#FEF3C7`, `#D97706`, or `#D0D0D0` appear as literals in screen files

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

## 14. Lead Nurture System

**Source:** `supabase/functions/_shared/lead-copy.ts`, `supabase/migrations/20260514204440_vendor_lead_tick_email_channel_guard.sql`, `supabase/migrations/20260513210739_vendor_lead_outreach_queue.sql`

**lead-copy.ts function signatures — verify all four:**

- `welcomeEmail(fullName, serviceType, isPioneer, spotsRemaining)` — PASS
- `reengagementEmail(fullName, serviceType, isPioneer)` — PASS
- `whatsappIntro(fullName, serviceType, isPioneer)` — PASS
- `whatsappReengagement(fullName, serviceType, isPioneer)` — FAIL if `serviceType` is absent or only one branch uses it. Both the pioneer branch (`as a ${label} professional`) and the non-pioneer branch must vary the message by service type.
- `whatsappGoLive(fullName, serviceType, isPioneer)` — FAIL if `serviceType` is absent

**vendor_lead_tick():**
- Return type: `TABLE(transitions integer, queued integer)` — FAIL if it returns void or a single scalar
- Processes leads in 5-stage priority order; batch-limited to 50 leads per call; email channel guard prevents duplicate email outreach

**State machine — valid lead_state transitions:**
```
PROSPECT → COLD (after 7 days no response)
COLD     → VERIFIED (admin marks as verified)
VERIFIED → CONVERTED (vendor completes app onboarding)
```

FAIL if `vendor_lead_tick()` can assign a non-PROSPECT initial state on insert, or advance a CONVERTED lead.

**Outreach queue:**
- `vendor_lead_outreach.status` values: `draft`, `approved`, `sent`, `failed`, `blocked` — FAIL if `failed` is absent from the CHECK constraint
- Messages must not be sent if `status = blocked` — FAIL if the tick function does not check this before dispatch

---

## 15. Blog Comments

**Source:** `supabase/migrations/20260518220023_create_blog_comments.sql`, `supabase/migrations/20260518220101_blog_comments_allow_anon_insert.sql`

- `blog_comments` table exists with columns: `id UUID`, `article_slug TEXT NOT NULL`, `name TEXT NOT NULL`, `email TEXT NOT NULL`, `body TEXT NOT NULL`, `approved BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ`
- RLS enabled on `blog_comments`
- SELECT policy: `approved = TRUE` — unauthenticated reads return only approved rows
- INSERT policy: `WITH CHECK (approved = TRUE)` — anonymous users can insert only pre-approved rows (auto-approval at insert time; no moderation queue in V1)
- FAIL if no RLS policies exist on the table
- WARN: auto-approval means all submitted comments are immediately public. If spam becomes an issue, change `DEFAULT TRUE` to `DEFAULT FALSE` and add an admin moderation step — no code exists for this yet.

---

## 16. Outstanding Operational Items

**Source:** `docs/VARS_PROJECT_CONTEXT.md` §2, §4–6

- **deliver-outreach edge function** — deployed and active. Delivery is stubbed pending `DELIVERY_LIVE=true` in Supabase secrets. PASS on deployment; WARN that real Twilio/Resend delivery is inactive until the secret is set.
- **Youverify webhook schema** — unconfirmed with vendor; WARN until confirmed with their team
- **Monnify** — no code action; note only if Paystack live mode is blocked at launch
- **Phase 2 readiness** — all trigger conditions met as of May 2026 (100+ vendors, 4+ neighbourhoods, 3 categories, 3+ vendors per category per area). No WARN needed unless admin panel lacks a live dashboard against these conditions.
- **Blog comments moderation** — auto-approved at insert; no admin queue built. WARN until a moderation UI exists or spam risk is explicitly accepted.

---

## Output Format

```
PASS — [check]
WARN — [check]: [what to watch]
FAIL — [check]: [what is broken or missing]
```

**ITEMS REQUIRING FOUNDER DECISION**
Anything the audit cannot resolve from the codebase or context docs alone.
