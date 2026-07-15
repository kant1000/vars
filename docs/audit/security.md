# Security Audit

Date: 2026-05-25

> **Superseded findings (2026-07-16 — security hardening pass):**
> - **P0: Broad Booking Update RLS** — Fixed. `bookings_user_update` and `bookings_vendor_update` RLS policies now have column-level `WITH CHECK` correlated-subquery guards preventing JWT clients from writing financial columns (`transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots`). Applied via migration `20260531000002_transport_surcharge`.
> - **P0: Admin Page Authorization Bypass Risk** — Fixed. `requireAdmin()` helper added to all admin Server Actions and page-level data fetches; verifies the session UID exists in `admin_users` before any service-role query. Unauthenticated or non-admin tokens receive 401/redirect.
> - **P0: Webhook Error Handling Suppresses Retries** — Fixed. `paystack-webhook` now returns non-2xx (502/500) for retryable internal failures so Paystack will retry delivery. Previously caught all errors and returned 200.
> - **P1: Youverify Invalid Signature Returns 200** — Fixed. `vendor-kyc-webhook` now returns 401 for invalid HMAC signatures instead of silently returning 200.

## Overall Security Verdict

Not production-ready. The project has some good primitives: Supabase Auth, RLS, Paystack HMAC validation, Youverify HMAC validation, native SecureStore. But access control, service-role usage, webhook replay safety, cron protection, and financial state integrity are not yet hardened.

## Findings

### P0: Admin Page Authorization Bypass Risk

Exploit scenario: attacker obtains any valid Supabase user access token and sets it as `sb-access-token`. Middleware allows access, and server pages query with service role.

Blast radius: bookings, vendors, disputes, system alerts, leads, and potentially operational data exposure.

Remediation: verify admin membership in middleware/layout/page before any service-role query.

### P0: Broad Booking Update RLS

Exploit scenario: authenticated customer/vendor uses Supabase client directly to update non-status booking columns.

Blast radius: payment references, cancellation fields, timestamps, access details, financial snapshots.

Remediation: remove broad update policies; use strict RPC/Edge Function transitions.

### P0: Webhook Error Handling Suppresses Retries

Exploit scenario: transient DB failure during Paystack webhook returns 200, so Paystack does not retry.

Blast radius: paid transactions without bookings or unreconciled transfer/refund events.

Remediation: persist webhook events and return retryable errors for retryable failures.

### P0: Double-Payout Race

Exploit scenario: customer confirmation and auto-release/admin settlement race; both pass existing payout check.

Blast radius: duplicate vendor transfers.

Remediation: unique `payout_history.booking_id`, DB lock, idempotency key.

### P1: Youverify Invalid Signature Returns 200

Exploit scenario: attacker probes webhook; invalid signatures are quietly acknowledged.

Blast radius: reduced detection, masking misconfiguration and attacks.

Remediation: return 401/403 and alert on invalid signatures.

### P1: KYC Verification Auto-Activates Vendors

Exploit scenario: any vendor that passes external KYC becomes active without internal quality/trust review.

Blast radius: unsafe vendors can enter marketplace.

Remediation: separate `kyc_status = verified` from `admin_approved = true`.

### P1: Cron Secret Is Undeployed And Single-Factor

Exploit scenario: if cron secret leaks, attacker can trigger cron endpoints.

Blast radius: expiries, refunds, reminders, phone reveal, settlements.

Remediation: signed requests, IP allowlisting where possible, job ids, replay windows, cron declaration in migrations.

### P1: Vendor Location Spoofing

Exploit scenario: vendor submits fake lat/lng to avoid drift pause or appear en route.

Blast radius: customer safety, auto-accept accuracy, disputes.

Remediation: server-side anomaly detection and customer-visible uncertainty.

### P1: Service Role Bearer Used As Admin Function Auth

Exploit scenario: service role key exposure grants direct admin settlement/refund mode.

Blast radius: full backend compromise.

Remediation: never use raw service role as app-level admin auth; use signed internal tokens with scope and expiry.

### P2: Local Env Contains Real-Looking Supabase JWTs

Exploit scenario: local env files are ignored but present on disk. Accidental screen share/logging/commit could leak credentials.

Blast radius: depends on whether keys are active.

Remediation: rotate any real-looking keys found locally, use new Supabase publishable/secret keys, and avoid storing production service role in repo worktrees.

## Secret Handling

The repo `.gitignore` excludes env files. No tracked env files were found for `.env.local`, `apps/admin/.env.local`, or `apps/mobile/.env`. Access audit reports presence only, which is good. Still, production secrets should not live in a developer worktree when not actively needed.

