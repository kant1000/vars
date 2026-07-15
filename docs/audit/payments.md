# Payment System Audit

Date: 2026-05-25

> **Superseded items (2026-06-24 — subaccount migration):**
> Items 1, 2, 10 from Top Financial Risks are addressed: payout_history.booking_id is now unique (migration 20260525160000); settlement is now `settlement_queued` status (no Transfer race); Pioneer counter increments at booking completion, not at transfer. The "Escrow Correctness" and "Settlement Correctness" sections describe the old Transfer-based model — replaced by Paystack subaccount split at charge time. Remaining open items (3–9, reconciliation, audit trail) are unchanged.
>
> **Superseded items (2026-07-16 — dispute refund ordering fix):**
> Item 6 (Admin dispute refund marks booking completed and does not guarantee refund success) is addressed: `paystack-release` admin path now calls `paystack.refundTransaction()` BEFORE updating booking state; on refund failure it returns 502 so `DisputeActions.tsx` does not call `updateDispute` and the dispute remains open for manual retry. Deployed as `paystack-release` v32.

## Verdict

Not safe for production real-money flows. The implementation can support demos or controlled pilots, but it does not meet financial infrastructure standards for Lagos marketplace payments, refunds, disputes, and payouts.

## Top Financial Risks

1. Double vendor payouts are possible because `payout_history.booking_id` is not unique and settlement is not atomic.
2. Bookings are marked completed before Paystack transfer success.
3. Cancellations mark bookings cancelled before refund success.
4. Paystack webhook handler returns 200 even after internal processing errors.
5. There is no immutable ledger or webhook event store.
6. Admin dispute refund marks booking completed and does not guarantee refund success.
7. Customer payment can succeed before a booking row exists.
8. Cancellation vendor-share transfers have no payout record or idempotency reference.
9. Paystack refund processed/failed webhooks are only logged, not reconciled to bookings.
10. Pioneer payout override increments counter after transfer initiation but is not transactional with the payout.

## Escrow Correctness

The code comments use “authorization/capture/escrow” language, but Paystack transaction initialize/charge.success means money is charged into VARS. `paystack-capture` does not call a Paystack capture endpoint; it marks the booking as accepted. The product and accounting model should be renamed to “VARS holds charged funds until settlement/refund.”

## Settlement Correctness

`paystack-settle`:

- Checks status and payout existence by read.
- Marks booking completed.
- Inserts payout history.
- Calls Paystack transfer.
- Updates payout transfer code.

This ordering is unsafe. If transfer fails, the booking remains completed. If two requests race, both can pass the checks.

Required fix: one settlement command with a durable idempotency key, row lock, unique payout, and explicit states: `settlement_requested`, `transfer_initiated`, `transfer_success`, `transfer_failed`, `reconciled`.

## Refund Correctness

Refund paths in `paystack-release`, `paystack-cancel`, `vendor-cancel-booking`, `vendor-cancel-grace`, `customer-decline-reschedule`, and `reschedule-expire` update booking state first and swallow refund failures.

Required fix: refund request table with `booking_id`, `reason`, `amount_kobo`, Paystack refund id/reference, status, retry count, and customer-visible pending/failed status.

## Reconciliation

Current reconciliation capability is insufficient:

- `payout_history` exists but is mutable and vendor-transfer focused.
- Refunds are not stored as first-class rows.
- Paystack webhooks are not persisted.
- No daily balance/reconciliation job exists.
- No accounting export exists.

Production requirement: daily reconciliation against Paystack transactions, refunds, transfers, disputes, and balance movements.

## Audit Trail

Missing:

- Immutable ledger entries.
- Webhook event archive.
- Admin action log.
- Idempotency keys.
- External API request/response correlation ids.
- Manual adjustment workflow.

## Launch Gate

Do not process real customer payments until ledger, idempotency, unique constraints, reconciliation, and refund/payout recovery workflows exist and are tested under duplicate webhook and concurrent settlement scenarios.

