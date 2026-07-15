# Edge Functions Audit

Date: 2026-05-25

> **Superseded findings (2026-07-16 — edge function hardening pass):**
> - **`paystack-release`** — Admin dispute path now calls `refundTransaction()` BEFORE updating booking state; returns 502 on refund failure so dispute stays open. Deployed v32.
> - **`paystack-webhook`** — Now returns non-2xx for retryable internal failures; no longer catches-and-swallows errors with a blanket 200.
> - **`vendor-kyc-webhook`** — Invalid HMAC signatures now return 401 instead of 200.
> - **`dispute-raise`** — Rollback on dispute insert failure now also clears `settlement_on_hold` on the vendor if no other open/under-review disputes remain (mirrors the resolve paths in `paystack-settle` and `paystack-release`). Deployed v26.
> - **`paystack-gate`** — `openRetryWindow` now wraps `initializeTransaction` in try/catch; on failure sets `gate_retry_expires_at = now` before returning 502 so cron sweep 2 can cancel the stuck booking. Deployed v10.

## Verdict

The functions are feature-rich but not safe enough for production money movement. The recurring pattern is: read current state, update DB, call external API, log failures. That pattern is not transactionally safe and does not provide idempotent recovery.

## Function Findings

### paystack-initialize

Severity: Critical

- Authenticates user.
- Initializes Paystack before a booking row exists.
- Slot conflict check is non-atomic.
- No server-side idempotency key from client.
- Customer can pay, webhook can fail, and no booking exists.

Fix: create a `payment_intents` row before Paystack initialization, use a unique idempotency key, and create booking from that row under lock.

### paystack-webhook

Severity: Critical

- HMAC signature validation exists.
- `charge.success` idempotency checks for existing booking by reference, but check/insert is not atomic.
- Catches handler errors and returns HTTP 200, preventing Paystack retry.
- Auto-accept and transport buffers are side effects after insert, not in a transaction.
- Webhook events are not persisted.

Fix: store every webhook event with unique Paystack event/reference key, process via idempotent jobs, and return non-2xx for retryable failures.

### paystack-capture

Severity: High

- Authenticates vendor and checks booking ownership.
- Accept update is not compare-and-swap: it reads `pending`, then updates by `id` only.
- Transport buffer creation is after status update and can fail independently.
- It marks `payment_captured = true`, but no actual Paystack capture occurs because funds are already charged.

Fix: update with `.eq('status', 'pending')`, verify one row changed, and model payment terms accurately.

### paystack-settle

Severity: Critical

- Handles user confirmation, cron, and admin dispute settlement.
- Marks booking completed before transfer succeeds.
- Inserts payout before transfer and has no unique `booking_id`.
- Existing payout check is not atomic.
- Admin mode accepts service role bearer as authorization.
- Transfer failure leaves booking completed and payout failed.

Fix: implement settlement as a single DB RPC that locks booking and creates one payout request; complete booking only after transfer initiation is durable and reconciliation can continue.

### paystack-release

Severity: Critical

- Used for vendor decline, timeout, and admin dispute refund.
- Updates booking expired/completed before refund succeeds.
- Refund failure is logged and swallowed.
- Admin dispute refund marks booking `completed`, which is semantically misleading.

Fix: separate refund state from booking state and require refund event reconciliation before final closure.

### paystack-cancel

Severity: Critical

- User cancellation updates booking first, then attempts refund and optional vendor transfer.
- Vendor cancellation share transfer has no payout record or idempotency key.
- A retried request can duplicate vendor cancellation-share transfers.

Fix: create cancellation ledger entries with unique references before external calls.

### paystack-verify-bank

Severity: High

- Used during vendor onboarding to verify bank and create transfer recipient.
- Needs rate limiting and anti-enumeration controls for account lookup.
- Bank code is not stored, making later verification and recipient recreation hard.

Fix: persist bank code, verification reference, recipient creation response, and throttle attempts.

### vendor-cancel-booking

Severity: High

- Authenticates vendor.
- Updates status before refund.
- Cancellation count double-counts the current cancellation.
- No idempotency; repeated calls can request repeated refunds.

Fix: conditional update by prior status, cancellation event table, refund idempotency reference.

### vendor-cancel-grace

Severity: High

- Correctly restricts to auto-accepted accepted bookings inside grace window.
- Still updates booking before refund succeeds.
- No refund idempotency event.

Fix: same refund ledger pattern.

### dispute-raise

Severity: High

- Should freeze settlement before or atomically with dispute insert/status change.
- Needs one-open-dispute-per-booking uniqueness.

Fix: unique partial index on open disputes and row-lock booking during dispute transition.

### vendor-kyc-init

Severity: High

- Authenticates vendor.
- Uses a hardcoded Youverify URL, not `YOUVERIFY_BASE_URL`.
- Does not fail fast if `YOUVERIFY_API_KEY` is empty.

Fix: validate env at boot/request and externalize base URL.

### vendor-kyc-webhook

Severity: Critical

- Signature verification exists, but invalid signatures return 200.
- No replay/idempotency table.
- Successful KYC immediately sets `is_active = true`, bypassing manual admin review despite marketplace trust concerns.

Fix: return 401 for invalid signature, store webhook event ids, and separate KYC verified from admin approved.

### vendor-register-lead

Severity: Medium

- Uses RPC for atomic pioneer lead registration, but migration syntax needs DB validation.
- Email/lead outreach side effects are best-effort.

Fix: validate migration replay and add lead event audit.

### vendor-set-zone / vendor-confirm-zone / vendor-update-location

Severity: High

- Authenticated vendor operations.
- Location accepts client-provided coordinates with no spoofing mitigation.
- Auto-accept drift protection depends on the same untrusted client.

Fix: treat geolocation as advisory, add fraud signals, and avoid using it as sole safety gate.

### send-reminders / phone-reveal / reschedule-expire / photo-consent-expire

Severity: High

- Cron-secret guarded.
- No cron declarations in migrations.
- Notification idempotency is partial.

Fix: declare jobs in migrations and add unique notification/event keys.

## Simulation Results By Static Trace

- Duplicate Paystack `charge.success`: likely skipped by existing reference, but race can still double insert without DB-level uniqueness handling beyond `paystack_reference` unique. One insert fails and function returns 200, losing retry visibility.
- Duplicate settlement: can double transfer because existing payout check and insert are not atomic and `payout_history.booking_id` is not unique.
- Delayed refund failure: booking already cancelled/expired/completed; no customer-visible unresolved refund state.
- Network failure after DB update: state advances even though external money movement failed.
- Cron retry: can repeat side effects where notification/payout uniqueness is absent.

