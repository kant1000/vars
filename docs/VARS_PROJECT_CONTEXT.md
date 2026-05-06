# VARS — Project Context

This document covers the things that aren't visible from the codebase alone. Reference it when making product, copy, or architecture decisions that touch any of the areas below.

---

## 1. Product Spec V1.0

**Status: Not in repo — held by founder/PO.**

The full spec (including granular screen-by-screen UX, edge case handling, brand voice guidelines §9, and the §5 cancellation policy table) lives outside the codebase. If you need to make a UI/UX decision, resolve an ambiguous edge case, or write copy for a new screen, flag it — the spec is the source of truth and should be consulted before implementation.

The README and this document capture what has been implemented. For anything not yet built, the spec governs intent.

---

## 2. Build State (GitHub README)

**Source: `/README.md` in the repo root.**

The README is the canonical record of what is implemented. It covers:
- Full tech stack
- All mobile screens (customer + vendor routes)
- Every edge function and its purpose
- Database schema (all 17 migrations)
- Payment flow (full escrow lifecycle)
- Auto-Accept system mechanics
- KYC flow
- Cancellation, dispute, and expiry logic
- Environment variables required per layer
- Deployment instructions

Before asking "is X built?", check the README edge functions table and mobile screens table. If it's not listed there, it isn't built.

**In-flight (not yet in README):**
- None — all features through migration 018 are merged and documented.
- Reschedule expiry cron (`reschedule-expire-hourly`) still needs scheduling via Supabase Dashboard → Database → SQL Editor (can't be done in code). See prior session notes for the exact SQL.

---

## 3. Notification Strings

**Source: `supabase/functions/_shared/notifications.ts`**

All push and in-app notification copy lives here as exported functions. Do not write notification copy inline in edge functions — add a new `msg_*` function here and import it.

### Current strings at a glance

| Function | Recipient | Trigger |
|---|---|---|
| `msg_paymentAuthorized(vendorName)` | Customer | Payment taken, pending vendor confirm |
| `msg_vendorAccepts(vendorName, date, time)` | Customer | Vendor accepts |
| `msg_vendorDeclines(vendorName)` | Customer | Vendor declines |
| `msg_reminder24h(vendorName, time)` | Customer | 24h before appointment |
| `msg_reminder1h(vendorName)` | Customer | 1h before appointment |
| `msg_reminder15min(vendorName)` | Customer | Phone revealed, vendor on way |
| `msg_vendorOnWay(vendorName)` | Customer | Vendor taps "On my way" |
| `msg_vendorArrived(vendorName)` | Customer | Vendor taps "Arrived" |
| `msg_serviceRendered(vendorName)` | Customer | Vendor marks service done |
| `msg_autoReleaseWarning(vendorName)` | Customer | 30 min before auto-release |
| `msg_paymentReleased(vendorName)` | Customer | Escrow settled |
| `msg_cancelTier1(amount)` | Customer | Cancelled within 15 min (15% fee) |
| `msg_cancelTier2(amount)` | Customer | Cancelled mid-window (50% fee) |
| `msg_cancelNonRefundable()` | Customer | Cancelled within 1h of service |
| `msg_autoAccepted(vendorName, date, time)` | Customer | Auto-accept fired |
| `msg_bookingCancelledByVendor(date, time)` | Customer | Vendor cancelled |
| `msg_disputeRaised_user()` | Customer | Dispute submitted |
| `msg_disputeResolved_userRefunded(amount)` | Customer | Admin resolves in customer's favour |
| `msg_disputeResolved_vendorPaid(amount)` | Customer | Admin resolves in vendor's favour |
| `msg_consentRequest(vendorName)` | Customer | Vendor requests portfolio photo consent |
| `msg_reschedule_suggested_customer(vendorName, day, time)` | Customer | Vendor suggests new time |
| `msg_vendor_newBooking(clientFirstName, service, date, time)` | Vendor | New booking request arrives |
| `msg_vendor_reminder30min(clientFirstName)` | Vendor | 30 min left to accept pending booking |
| `msg_vendor_bookingExpired()` | Vendor | Booking expired without acceptance |
| `msg_vendor_reminder24h(time, service, clientFirstName)` | Vendor | 24h before appointment |
| `msg_vendor_reminder1h(clientFirstName)` | Vendor | 1h before appointment |
| `msg_vendor_reminder15min(clientFirstName)` | Vendor | 15 min mark — head out |
| `msg_vendor_paymentReleased(amount)` | Vendor | Escrow settled to vendor |
| `msg_vendor_userCancelledWithFee(clientFirstName, amount)` | Vendor | Customer cancelled with fee share |
| `msg_vendor_newReview(clientFirstName)` | Vendor | Customer leaves a review |
| `msg_vendor_verificationApproved()` | Vendor | KYC passed — now live |
| `msg_vendor_verificationFailed(reason)` | Vendor | KYC rejected |
| `msg_vendor_autoAccepted(clientFirstName, service, date, time)` | Vendor | Auto-accept fired |
| `msg_vendor_serviceRenderReminder(clientFirstName)` | Vendor | Overdue — mark service complete |
| `msg_bookingCancelledFullRefund(date, time)` | Customer | Vendor cancelled — customer notified of full refund |
| `msg_vendor_selfCancelled(clientFirstName, service)` | Vendor | Vendor cancelled summary |
| `msg_disputeRaised_vendor(clientFirstName)` | Vendor | Customer raised dispute |
| `msg_vendor_consentApproved()` | Vendor | Customer approved portfolio photo |
| `msg_vendor_consentDeclined()` | Vendor | Customer declined portfolio photo |
| `msg_vendor_consentExpired()` | Vendor | Photo consent request timed out |
| `msg_reschedule_accepted_vendor(clientFirstName, day, time)` | Vendor | Customer accepted reschedule |
| `msg_reschedule_declined_vendor(clientFirstName)` | Vendor | Customer declined reschedule |
| `msg_reschedule_expired_vendor(clientFirstName)` | Vendor | Reschedule timed out |

---

## 4. Youverify KYC Integration

**Status: Fully verified. API keys received. Integration is live-ready.**

What is built:
- `vendor-kyc-init` edge function initiates a Youverify session
- `vendor-kyc-webhook` receives the result — clean pass sets `kyc_status = verified` and `is_active = true` instantly; failure routes to admin queue
- Webhook is authenticated via HMAC signature using `YOUVERIFY_WEBHOOK_SECRET`
- API key stored as `YOUVERIFY_API_KEY` in Supabase secrets

The business relationship with Youverify is confirmed and production API keys are in hand. Before deploying to production, verify that the `YOUVERIFY_API_KEY` and `YOUVERIFY_WEBHOOK_SECRET` in Supabase secrets are the production values (not sandbox), and confirm the webhook endpoint registered with Youverify points to the production edge function URL.

---

## 5. Marketing Extension Partnership

**Status: Brief sent to potential marketing partner; decision pending.**

A marketing extension partnership is being explored as a customer acquisition channel for Phase 1 and Phase 2. No integration work should begin until the partnership is confirmed. If you're working on customer-facing content, acquisition flows, or Phase 2 planning, note that this partner's input may shape the approach and timing. No code dependency exists yet.

---

## 6. Monnify Payment Bridge

**Status: Contingency no longer likely — Nigerian business registration is in progress, which will unblock Paystack live mode.**

Business registration is underway. Once complete, Paystack live mode can be activated and the platform goes fully live on Paystack. Monnify is no longer being actively explored as an interim processor.

No code changes are needed. When business registration completes:
1. Activate Paystack live mode in the Paystack dashboard
2. Swap `PAYSTACK_SECRET_KEY` in Supabase secrets from the test key to the live key
3. Verify all Paystack webhook endpoints are registered against the production URLs

The payment layer is fully contained in `supabase/functions/paystack-*` and `_shared/paystack.ts` — no other files need touching for the test→live switch.

---

## 7. Phase 2 Trigger Checklist

**Status: Conditions defined; no tracking dashboard exists yet.**

Phase 2 launches when all of the following are true:

| Condition | Target |
|---|---|
| Active verified vendors | 100 |
| Neighbourhoods covered | 4 |
| Service categories live | 3 (Barbing, Hair Styling, Makeovers) |
| Vendors per category per area | 3 minimum |

There is currently no tracking dashboard or automated monitoring for these metrics. Progress is tracked manually. If you're building admin tooling, a Phase 2 readiness panel (live counts against each condition) would be high-value.

---

## 8. Vendor Onboarding Conversion

**Status: No measured data yet — pre-launch.**

The founder's barber contact is identified as a high-conversion reference case. Formal drop-off data across the 5-step onboarding flow (profile → services → portfolio → KYC → activation) does not exist yet.

Once vendors begin onboarding at scale, the drop-off points to watch are:
- Step 4 (KYC) — identity verification is the highest friction step
- Portfolio upload — optional but affects booking conversion downstream

If you're optimising onboarding, prioritise the KYC step UX and the portfolio prompt. No data exists to direct effort more precisely than this.

---

## 9. Cancellation Flag Mechanics

**What the code does:**

The `vendor-cancel-booking` edge function increments a rolling 30-day cancellation count each time a vendor cancels. When the count reaches 3 or more within any 30-day window, the `cancellation_flagged` boolean on the `vendors` table is set to `true`.

The flag:
- Is **not** an automatic suspension — it surfaces the vendor in the admin Vendors panel for human review
- Can only be cleared by admin (no self-service appeal in the current build)
- Is separate from `is_suspended` — a flagged vendor remains live and bookable until admin explicitly sets `is_suspended = true`

**What is not built:**

- No appeals flow for vendors
- No automated suspension trigger (suspension is manual admin action only)
- No notification to the vendor when they are flagged
- No notification to admin when a new flag is raised (admin must check the queue proactively)

**What "suspension" actually does:**

`is_suspended = true` on the `vendors` table removes the vendor from the RLS policy that allows public discovery (`is_active = TRUE AND is_suspended = FALSE`). They disappear from search results immediately. No in-app message is shown to a suspended vendor — they see their profile but receive no new bookings. There is no reinstatement flow built.

If an appeals process or admin alerting is needed, it is not in scope yet and would require a new edge function + admin UI work.
