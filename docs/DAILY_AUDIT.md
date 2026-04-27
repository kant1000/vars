# VARS Daily Codebase Audit

**Pre-flight:** run the build/lint checks in `docs/ACCESS_AND_AUDIT.md` → Baseline Audit Order before starting.

Run every check in order. For each: **PASS**, **WARN**, or **FAIL** with one-line reason.
Final output: severity-grouped summary, then **ITEMS REQUIRING FOUNDER DECISION**.

---

## 1. Schema Integrity

**Source:** `supabase/migrations/*.sql` — read all files.

- Migration sequence 000–017 is present; **flag gap at 009** — confirm intentional
- Tables exist: `profiles`, `vendors`, `services`, `vendor_services`, `bookings`, `vendor_calendar`, `reviews`, `disputes`, `payout_history`, `vendor_leads`, `portfolio_photos`
- `booking_status` enum contains: `pending`, `accepted`, `expired`, `cancelled`, `on_way`, `arrived`, `service_rendered`, `completed`, `disputed`, `rescheduled_pending`
- `block_state_enum` contains: `unavailable`, `auto_accept`, `transport_buffer` — `available` must **not** be present (removed in 017)
- `disputes.reason` column exists — not `disputes.statement` (renamed in 012)
- `bookings.suggested_scheduled_at` exists (014)
- `bookings.reschedule_expires_at` exists (015)
- `portfolio_photos` has a `consent_state` enum column
- `vendor_leads` has a `pioneer` boolean column (003/004)
- Booking status trigger blocking invalid JWT client transitions exists (016)

---

## 2. Edge Function Coverage

**Source:** `ls supabase/functions/` vs `README.md` edge functions table.

All 25 must exist on disk:

```
paystack-initialize        paystack-webhook           paystack-capture
paystack-release           paystack-settle            paystack-cancel
paystack-verify-bank       vendor-cancel-booking      vendor-cancel-grace
dispute-raise              vendor-kyc-init            vendor-kyc-webhook
vendor-register-lead       vendor-set-zone            vendor-confirm-zone
vendor-update-location     photo-consent-request      photo-consent-respond
photo-consent-expire       phone-reveal               send-reminders
vendor-suggest-reschedule  customer-accept-reschedule customer-decline-reschedule
reschedule-expire
```

FAIL any function present in README but absent from disk, or on disk but missing from the README table.

---

## 3. Cron Job Coverage

**Source:** `README.md` cron jobs table.

Six jobs must be documented (cron jobs are scheduled manually via Supabase Dashboard — not in migration files):

| Job | Schedule | Target |
|---|---|---|
| `booking-expire-every-5min` | `*/5 * * * *` | `paystack-release` |
| `auto-release-every-5min` | `*/5 * * * *` | `paystack-settle` |
| `phone-reveal-every-5min` | `*/5 * * * *` | `phone-reveal` |
| `send-reminders-every-5min` | `*/5 * * * *` | `send-reminders` |
| `reschedule-expire-hourly` | `0 * * * *` | `reschedule-expire` |
| `check-cron-health` | `0 */2 * * *` | `check_cron_health()` DB fn |

**WARN always:** `reschedule-expire-hourly` cannot be verified from code alone — it requires manual scheduling via Supabase Dashboard → Database → SQL Editor. Flag as unconfirmed until the dashboard is checked directly.

---

## 4. Payment Logic

**Source:** `supabase/functions/paystack-settle/index.ts`, `supabase/functions/paystack-cancel/index.ts`

**paystack-settle:**
- Pioneer exception: `pioneer = true` AND `pioneer_bookings_completed < 3` → 100% vendor, 0% commission; `pioneer_bookings_completed` increments on each settlement
- Standard split: 80% vendor / 20% VARS
- Stamp duty: ₦50 on transfers ≥ ₦10,000
- Paystack fee: 1.5% + ₦100, capped at ₦2,000
- Settle cron queries only `service_rendered` — `disputed` bookings must be excluded (escrow stays frozen)

**paystack-cancel — tiers evaluated in this priority order (first match wins):**
1. Within 1hr of service start → non-refundable: 70% vendor / 30% VARS
2. Within 15min of booking creation → 15% fee: 5% vendor / 10% VARS
3. All other cases → 50% fee: 20% vendor / 30% VARS

FAIL if the order differs — a cancel 10min after booking but 45min before service must hit tier 1, not tier 2.

---

## 5. Booking Status Machine

**Source:** `supabase/migrations/20240101000016_booking_status_trigger.sql`

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

## 8. Pioneer Counter

**Source:** `apps/landing/` (search for `vendor_leads` query), `supabase/functions/vendor-register-lead/index.ts`

- Landing page pioneer counter queries `vendor_leads WHERE pioneer = true` — not the `vendors` table
- `vendor-register-lead` sets `pioneer = true` on the lead record at insert

---

## 9. KYC Flow

**Source:** `supabase/functions/vendor-kyc-webhook/index.ts`, `supabase/functions/vendor-kyc-init/index.ts`

- Clean pass: single update sets `kyc_status = verified` AND `is_active = true` — no admin step required
- Failure: `kyc_status = rejected`; surfaces in admin queue; no rejection message sent to vendor
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
- Hex colours: grep for any value outside `#111111`, `#FFFFFF`, `#F5F5F5`, `#0A7AFF`, `#1A1A1A` — FAIL per violation
- `#0A7AFF` must not appear as `backgroundColor` — FAIL if found
- `ScissorsLoader`: large = 80px, small = 28px; animation 1.4s cycle, ease-in-out, no bounce

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

## 14. Outstanding Operational Items

**Source:** `docs/VARS_PROJECT_CONTEXT.md` §2, §4–6

- **reschedule-expire-hourly cron** — edge function and migrations are built and merged; WARN until confirmed scheduled in Supabase Dashboard
- **Youverify webhook schema** — unconfirmed with vendor; WARN until confirmed with their team
- **Monnify** — no code action; note only if Paystack live mode is blocked at launch
- **Phase 2 readiness panel** — not built; WARN if admin panel has no live count dashboard against Phase 2 conditions (100 vendors / 4 neighbourhoods / 3 categories / 3 vendors per category per area)

---

## Output Format

```
PASS — [check]
WARN — [check]: [what to watch]
FAIL — [check]: [what is broken or missing]
```

**ITEMS REQUIRING FOUNDER DECISION**
Anything the audit cannot resolve from the codebase or context docs alone.
