# VARS Final Production Readiness Report

Date: 2026-05-25

> Per-domain exploit scenarios and fixes behind the blockers below live in
> [findings.md](findings.md) (architecture, database, edge functions,
> payments, security, admin, environment, testing, ops).

## 1. Executive Summary

VARS is not ready to handle real customers, vendors, payments, refunds, disputes, and payouts in production. The product surface is substantial and several builds pass, but the backend and operations model do not yet provide the guarantees required for a real-money Lagos marketplace.

The biggest issue is not a missing screen. It is financial correctness: bookings, refunds, transfers, disputes, and cron-driven settlement are implemented as best-effort service-role updates around external API calls, without atomic database transitions, immutable ledgers, idempotency keys, or reconciliation.

## 2. Verdict

**PRE-ALPHA**

Rationale: feature-complete enough for internal demos and controlled test-mode pilots, but unsafe for production money movement.

## 3. Top 20 Production Blockers

1. Fresh migrations likely fail at migration 014 due wrong enum name.
2. No cron jobs are declared despite cron-dependent booking/payment behavior.
3. No immutable payment ledger.
4. No webhook event persistence.
5. Payout settlement is not atomic.
6. `payout_history.booking_id` is not unique.
7. Booking overlap prevention is non-atomic.
8. Booking update RLS allows direct client mutation of non-status financial fields.
9. Admin middleware checks only token presence, not admin membership.
10. Admin pages use service role without page-level `requireAdmin()`.
11. Refund flows update booking state before refund success.
12. Settlement marks booking completed before transfer success.
13. Paystack webhook returns 200 on internal handler errors.
14. Payment WebView treats redirect as success without verification.
15. Local Supabase/Docker/Deno validation is not reproducible.
16. No test suite for critical flows.
17. No reconciliation workflow for Paystack transactions, refunds, transfers, disputes.
18. KYC webhook auto-activates vendors after external verification.
19. Vendor location and auto-accept drift depend on spoofable client coordinates.
20. No admin audit log for dispute, payout, refund, KYC, or vendor actions.

## 4. Top 10 Financial/Payment Risks

1. Duplicate vendor payout.
2. Paid customer with no booking row.
3. Cancelled booking with failed refund.
4. Completed booking with failed vendor transfer.
5. Admin refund and auto-release racing.
6. Vendor cancellation share transfer duplicated.
7. Chargeback after payout not operationally handled.
8. Refund webhooks logged but not reconciled.
9. Pioneer 100% payout counter race.
10. No account-grade audit trail.

## 5. Top 10 Security Risks

1. Admin route token-presence auth weakness.
2. Service role used broadly in admin pages/actions.
3. Broad booking update RLS.
4. Webhook retry suppression.
5. Missing webhook replay store.
6. Raw service role bearer used for internal admin settlement mode.
7. Cron endpoints rely on a shared secret with no declared scheduler.
8. Youverify invalid signatures return 200.
9. Vendor geolocation spoofing.
10. Real-looking local secrets present in ignored env files.

## 6. Highest-Risk Architectural Weaknesses

- `bookings.status` tries to model operational, fulfillment, and financial state at once.
- External API calls are not backed by durable commands/events.
- Service role is used as the backend instead of a constrained domain service layer.
- State-machine rules are split across mobile, Edge Functions, SQL triggers, and admin actions.
- Cron is assumed but not infrastructure-as-code.

## 7. Fastest Safe Path To Launch

Launch should be delayed until the money path is rebuilt around a small, auditable core:

1. Fix and replay migrations from empty DB.
2. Add booking range exclusion and payout uniqueness constraints.
3. Add ledger, webhook_events, refund_requests, payout_requests, admin_audit_log.
4. Move settlement/refund/cancel/dispute into idempotent SQL RPCs or transactional Edge Function commands.
5. Declare cron jobs in migrations and monitor them.
6. Add Paystack test-mode integration tests for duplicate/delayed/failure events.
7. Harden admin authorization.

## 8. 30/60/90 Day Remediation Roadmap

### 30 Days

- Repair migrations and add DB CI.
- Add unique constraints and booking exclusion constraint.
- Remove broad booking update RLS.
- Harden admin route auth.
- Add webhook event table and idempotency keys.
- Add test harness for Edge Functions and SQL.

### 60 Days

- Implement ledger/refund/payout request tables.
- Rewrite settlement/cancellation/dispute flows as atomic commands.
- Add cron migrations and health alert delivery.
- Add Paystack test-mode reconciliation job.
- Add admin audit log and safer dispute actions.

### 90 Days

- Mobile E2E and offline/realtime recovery tests.
- Operational dashboards for payments, refunds, payouts, KYC, disputes, cron.
- Incident runbooks and support tooling.
- Staging environment with Paystack/Youverify test credentials.
- Security review and load/race testing.

## 9. Engineering Effort Estimates

- Migration repair and DB CI: 3-5 days.
- Financial ledger/idempotency/reconciliation: 3-5 weeks.
- Admin auth/audit/dispute hardening: 1-2 weeks.
- Edge Function payment rewrite and tests: 3-4 weeks.
- Mobile payment confirmation/offline/realtime hardening: 2-3 weeks.
- Observability/runbooks/staging: 2-3 weeks.

Overall: roughly 8-12 focused engineering weeks before a constrained beta with real money; longer for full production readiness.

## 10. Remediation Progress

> Last updated: 2026-07-16

The following blockers from Section 3 have been addressed since the original report:

| Blocker | Status | Notes |
|---|---|---|
| **8** — Booking update RLS allows direct client mutation of non-status financial fields | **Fixed** | `bookings_user_update` and `bookings_vendor_update` RLS policies now have column-level `WITH CHECK` correlated-subquery guards. Migration `20260531000002`. |
| **9** — Admin middleware checks only token presence, not admin membership | **Fixed** | `requireAdmin()` helper verifies session UID in `admin_users` before all service-role queries. |
| **10** — Admin pages use service role without page-level `requireAdmin()` | **Fixed** | All admin Server Actions and page data fetches now call `requireAdmin()`. |
| **11** — Refund flows update booking state before refund success | **Partially fixed** | `paystack-release` admin dispute path now refunds first, returns 502 on failure; dispute stays open. Other cancel/refund paths (paystack-cancel, vendor-cancel-booking, etc.) still follow the update-first pattern — those are deferred to the full payment rewrite. |
| **13** — Paystack webhook returns 200 on internal handler errors | **Fixed** | `paystack-webhook` now returns non-2xx for retryable failures so Paystack retries delivery. |

Blockers 1–7, 12, 14–20 remain open. The financial ledger / idempotency / reconciliation work described in Section 7 is not yet started.

---

## 11. Launch Recommendation

Do not approve production launch for real customers, vendors, payments, refunds, disputes, or payouts.

Approve only:

- Internal demos.
- Test-mode Paystack/Youverify validation.
- A non-money vendor acquisition pilot.
- A tightly controlled staging beta after the P0 blockers are fixed and tested.

