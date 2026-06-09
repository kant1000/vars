# Database And Supabase Audit

Date: 2026-05-25

## Verdict

The database is not production-ready for a real-money marketplace. It has useful early schema work, RLS coverage, and indexes, but lacks enforceable financial invariants, migration replay guarantees, atomic booking transitions, cron declarations, and immutable audit tables.

## Critical Findings

### P0: Fresh Migrations Likely Fail At Migration 014

`20240101000014_reschedule_pending.sql` references `booking_status`, but the enum is `booking_status_enum`. The later migration 018 cannot run on a fresh database if migration 014 aborts.

Impact: new environments and disaster recovery restores from migrations can fail.

Fix: correct migration 014 or squash migrations after validating on a clean database.

### P0: No Cron Jobs Are Declared

No migration contains `cron.schedule`, `pg_cron`, `pg_net`, or `net.http_post`, yet functions depend on cron:

- `paystack-release` for pending booking expiry.
- `paystack-settle` for auto-release and reminders.
- `send-reminders`.
- `phone-reveal`.
- `reschedule-expire`.
- `photo-consent-expire`.

Impact: bookings can remain pending forever, phone numbers may never reveal, auto-release may never settle, reschedules may never expire, and operations monitoring has no scheduled producer.

Fix: create idempotent migrations for required extensions, Vault secrets, and cron schedules. Add a live verification query to CI/deploy checks.

### P0: Booking Overlap Prevention Is Non-Atomic

Overlap checks happen in `paystack-initialize` and webhook code using SELECT queries. There is no range/exclusion constraint on `(vendor_id, scheduled_at, duration)` and no transaction lock.

Impact: two customers can pay for overlapping slots before either booking exists, especially under Paystack webhook delay or retry.

Fix: add `tstzrange` generated/stored range or explicit start/end columns plus a GiST exclusion constraint for active statuses.

### P0: Payout Integrity Is Not Enforced

`payout_history.booking_id` is indexed but not unique. Settlement checks for an existing payout before insert, but the check and insert are not atomic.

Impact: concurrent user confirm, auto-release, and admin dispute resolution can double-initiate vendor transfers.

Fix: add `UNIQUE (booking_id)` and execute settlement through one SQL RPC with row lock and idempotency key.

### P0: RLS Allows Direct Customer/Vendor Booking Mutation

Policies allow customers and vendors to update their own booking rows. A trigger limits status changes for JWT clients, but non-status fields such as price snapshots, Paystack references, timestamps, cancellation fields, and access details are not protected.

Impact: clients can tamper with financial metadata or operational state if they can issue custom Supabase requests.

Fix: remove broad booking update policies. Expose narrowly scoped RPCs or Edge Functions with column-level validation.

### P1: Realtime Publication Includes Sensitive Tables

`bookings`, `vendors`, and `notifications` are in `supabase_realtime`. `vendors` includes live/current location and bank metadata on the same table.

Impact: RLS mistakes or public vendor select policy expansion could expose sensitive vendor location/bank-adjacent data.

Fix: split public vendor profile from private/vendor operational state, or publish only dedicated safe views/tables.

### P1: `get_nearby_vendors` Is `SECURITY DEFINER` And Bypasses Intent

The function returns verified nearby vendors but does not require `is_active = TRUE` or `is_suspended = FALSE`, despite the direct table RLS policy doing so.

Impact: verified but inactive or suspended vendors can appear in discovery.

Fix: add active/suspended filters inside the RPC and test it against rejected/suspended vendors.

### P1: Financial State Is Overloaded Into `bookings.status`

There is no ledger table for authorization, refund requested, refund processed, transfer initiated, transfer success, transfer failed, dispute hold, chargeback, or reconciliation status.

Impact: support cannot reliably answer “where is the money?” after partial failures.

Fix: add immutable `payment_events`, `ledger_entries`, and `webhook_events` tables.

### P1: Admin Audit Trail Is Missing

Admin actions update vendors and disputes directly without admin action history.

Impact: payout/refund decisions are not attributable or reversible.

Fix: add `admin_audit_log` with actor, action, target, prior state, new state, request id, and timestamp.

### P1: Cancellation Flag Count Is Incorrect

`vendor-cancel-booking` updates the booking to cancelled, then counts matching cancelled bookings, then adds `+1`. The just-updated row is already in the count.

Impact: vendors can be flagged early, damaging trust and admin workflows.

Fix: remove `+1` and count after update, or count before update and add exactly once in a transaction.

## Index And Query Risks

- Booking overlap queries use timestamp comparisons that assume uniform duration windows and do not use a range index.
- `get_nearby_vendors` uses a GiST index for `base_location`, which is good, but category aggregation joins can become expensive without selective category/vendor indexes.
- Cron scans rely on indexes for some paths, but cron jobs are not installed.

## Supabase Coupling

Supabase service role is the de facto backend authority. This is acceptable only if all privileged paths are atomic and audited; they currently are not.

