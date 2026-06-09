# Admin Panel Audit

Date: 2026-05-25

## Build Validation

`corepack yarn workspace @vars/admin build` passed. `next lint` is not configured and prompts interactively.

## Critical Findings

### P0: Middleware Checks Only Token Presence

`apps/admin/src/middleware.ts` allows any request with an `sb-access-token` cookie. Several server pages then use service-role `adminClient()` without calling `requireAdmin()`.

Impact: any valid Supabase user token placed in the cookie can potentially render service-role data pages until server actions/API routes enforce admin checks.

Fix: middleware or layouts must verify admin membership server-side for every admin route, or every page must call `requireAdmin()` before service-role reads.

### P0: Admin Actions Can Trigger Money Movement Without Audit Log

Dispute actions call `paystack-release` or `paystack-settle` with service role bearer. No admin action log captures actor, rationale, before/after state, or external payment result.

Impact: refund/payout decisions are not auditable.

Fix: all admin payment decisions must create immutable admin audit and ledger records before external calls.

### P1: Dangerous Vendor Patch Is Too Broad

`updateVendor(vendorId, patch)` accepts arbitrary patch records from the client component.

Impact: a compromised client component or future UI bug can mutate sensitive vendor columns through service role.

Fix: whitelist fields and validate transitions.

### P1: Dispute Updates Are Too Broad

`updateDispute(disputeId, patch)` accepts arbitrary patch records. Resolution and payment calls are separate operations.

Impact: dispute can be marked resolved even if settlement/refund function fails or vice versa.

Fix: one server action per allowed transition, with transactional audit and function result persistence.

### P1: No Reversibility Or Two-Person Control

Refund/pay-vendor actions appear single-click and irreversible.

Fix: add confirmation, reason codes, optional dual approval for high-value disputes, and manual reconciliation states.

## Server/Client Boundary

Service role key is used server-side only, which is directionally correct. The main failure is that service-role reads occur on pages that rely on middleware token presence rather than admin authorization.

## Admin Verdict

Not safe for production operations. It can be used by trusted developers in a staging/pilot environment, but not by a support team handling real disputes and payouts.

