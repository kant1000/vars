# Operations And Production Readiness

Date: 2026-05-25

## Verdict

VARS is not operationally deployable as a real-money production marketplace today.

## Operational Findings

### Observability

Current observability is mostly `console.log`/`console.error`, in-app notifications, and a `system_alerts` table for cron failures. There is no Sentry, tracing, structured logs, metrics, dashboards, or alert routing.

### Cron Monitoring

`system_alerts` exists, but no cron jobs are declared in migrations. A monitoring table without scheduled jobs and alert delivery is not enough.

### Payment Monitoring

There is no ledger, no reconciliation job, no payout/refund dashboard, and no Paystack webhook event archive. Operators cannot reliably debug money incidents.

### Rollback And Migration Safety

Fresh DB reset could not be run locally. Static review found a likely migration replay blocker. No migration CI is present.

### Recovery Procedures

Missing documented procedures for:

- Paid but no booking.
- Duplicate payout.
- Refund failed.
- Transfer failed.
- Chargeback after payout.
- Cron missed for several hours.
- Vendor/customer dispute evidence handling.

### Environment Segregation

The repo has examples and local env files, but no clear staging/prod separation procedure. Access audit reports missing financial/KYC/map credentials locally.

## Scorecard

| Domain | Score | Notes |
|---|---:|---|
| Reliability | 2/10 | Non-atomic state changes, missing cron declarations, limited retries. |
| Security | 3/10 | RLS exists, but admin auth and broad update policies are unsafe. |
| Financial integrity | 1/10 | No ledger, no atomic payouts/refunds, no reconciliation. |
| Scalability | 4/10 | Basic indexes exist; Realtime and booking queries need hardening. |
| Observability | 2/10 | Console logs and partial cron table only. |
| Maintainability | 4/10 | Clear monorepo, but duplicated business logic and no tests. |
| Operational readiness | 1/10 | No runbooks, no alerting, no recovery workflows. |

## Production Gate Checklist

- Clean migration replay in CI.
- Declared cron jobs with health alerts.
- Immutable ledger and webhook event storage.
- Unique constraints and DB locks for all money transitions.
- Admin audit log and scoped admin authorization.
- Payment/refund/payout reconciliation dashboard.
- Test suite for critical state machine and race cases.
- Staging environment with Paystack/Youverify test credentials.

