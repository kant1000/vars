# VARS Production Architecture Audit

Date: 2026-05-25

## Runtime Architecture

```mermaid
flowchart LR
  Mobile["Expo React Native app"] -->|Supabase anon JWT| Supabase["Supabase Auth, Postgres, Realtime, Storage"]
  Mobile -->|fetch /functions/v1/*| Edge["Supabase Edge Functions"]
  Admin["Next.js admin dashboard"] -->|service role server-side| Supabase
  Admin -->|service role bearer| Edge
  Landing["Next.js landing/blog"] -->|public lead/comment APIs| Supabase
  Edge -->|service role| Supabase
  Edge --> Paystack["Paystack API"]
  Edge --> Youverify["Youverify KYC"]
  Edge --> Resend["Resend email"]
  Edge --> ExpoPush["Expo Push API"]
```

## Monorepo Map

- `apps/mobile`: Expo Router app for customer/vendor auth, discovery, booking, vendor onboarding, live tracking, payment WebView, reviews, disputes, notifications.
- `apps/admin`: Next.js dashboard using server-side Supabase service role for bookings, vendors, disputes, leads, marketing.
- `apps/landing`: Next.js marketing/blog/lead capture site.
- `packages/shared`: small constants/types/format helpers. It is not a full domain model and does not contain generated DB types.
- `supabase/migrations`: schema, RLS, indexes, triggers, lead/outreach/blog migrations.
- `supabase/functions`: Edge Functions for payments, booking state changes, KYC, location, reminders, marketing, consent.

## Dependency Graph

```mermaid
flowchart TD
  Shared["@vars/shared"] --> Mobile["@vars/mobile"]
  Shared --> Admin["@vars/admin"]
  SupabaseTypes["Postgres schema, not generated into repo"] --> Mobile
  SupabaseTypes --> Admin
  Functions["supabase/functions"] --> SharedConstants["_shared/constants.ts duplicate"]
  Functions --> PaystackClient["_shared/paystack.ts"]
  Functions --> NotificationShared["_shared/notifications.ts"]
```

Hidden coupling: Edge Functions and apps duplicate booking statuses, cancellation fee math, Paystack assumptions, and schedule overlap logic rather than sharing a tested state-machine package.

## Booking Lifecycle

```mermaid
stateDiagram-v2
  [*] --> pending: Paystack charge.success webhook creates booking
  pending --> accepted: vendor accepts via paystack-capture
  pending --> accepted: auto-accept webhook path
  pending --> expired: vendor declines or timeout
  pending --> rescheduled_pending: vendor suggests reschedule
  rescheduled_pending --> pending: customer accepts new time
  rescheduled_pending --> cancelled: customer declines or expiry
  accepted --> on_way
  on_way --> arrived
  arrived --> service_rendered
  service_rendered --> completed: user confirm or auto-release cron
  accepted --> cancelled: customer/vendor cancel
  service_rendered --> disputed: customer raises dispute
  disputed --> completed: admin resolves pay/refund
```

Critical weakness: most service-role transitions are not atomic compare-and-swap updates. Two callers can observe the same prior state and both execute side effects.

## Payment Lifecycle

```mermaid
sequenceDiagram
  participant C as Customer Mobile
  participant Init as paystack-initialize
  participant P as Paystack
  participant WH as paystack-webhook
  participant DB as Postgres
  participant V as Vendor Mobile
  participant Settle as paystack-settle

  C->>Init: booking metadata + JWT
  Init->>P: initialize transaction
  P-->>C: checkout access_code
  P->>WH: charge.success
  WH->>DB: insert booking pending/accepted
  WH-->>V: notify request or auto-accepted
  V->>DB: accept path via paystack-capture
  C->>Settle: confirm service complete
  Settle->>DB: mark completed + insert payout_history pending
  Settle->>P: initiate vendor transfer
  P->>WH: transfer.success/failed
  WH->>DB: update payout_history
```

Finding: the code calls Paystack initialize, refund, and transfer APIs but has no immutable ledger, no reconciliation table, no webhook event table, and no enforced one-payout-per-booking unique constraint.

## Realtime Event Flow

```mermaid
flowchart LR
  BookingRows["bookings publication"] --> CustomerLive["Customer live screen"]
  BookingRows --> VendorTabs["Vendor bookings tab"]
  VendorRows["vendors publication"] --> CustomerTracking["Customer live tracking"]
  NotificationRows["notifications publication"] --> Inbox["Mobile notifications tab"]
```

Trust boundary issue: `vendors` is published broadly for Realtime while RLS permits public select of active vendors. Live/current location fields sit on the same table, increasing risk of unintended exposure.

## Auto-Accept Logic

```mermaid
flowchart TD
  Charge["charge.success"] --> Settings["vendor auto_accept_enabled, not drifted, confirmed today"]
  Settings --> Zone["customer within vendor zone radius"]
  Zone --> Calendar["slot has auto_accept block and no blockers"]
  Calendar --> Accepted["insert booking accepted"]
  Accepted --> Grace["5 min vendor grace cancel"]
  Accepted --> Buffer["create transport buffer"]
```

Danger: auto-accept runs inside a webhook after payment success, but slot conflict checks are non-locking and there is no exclusion constraint over booking time ranges.

## Edge Function Interaction Map

```mermaid
flowchart TD
  Payment["paystack-initialize/webhook/capture/release/cancel/settle"] --> Bookings["bookings"]
  Payment --> Payouts["payout_history"]
  Payment --> Calendar["vendor_calendar"]
  Vendor["vendor-set-zone/confirm/update-location/update-job-status/cancel/reschedule"] --> Vendors["vendors"]
  Vendor --> Bookings
  KYC["vendor-kyc-init/webhook"] --> Vendors
  Ops["send-reminders/phone-reveal/reschedule-expire/photo-consent-expire"] --> Bookings
  Admin["admin server actions"] --> Payment
```

## Trust Boundaries

- Mobile app is untrusted; all booking, payout, cancellation, and KYC decisions must be enforced server-side.
- Admin dashboard is high-privilege because it uses the service role and can trigger settlement/refund functions.
- Paystack and Youverify webhooks are external untrusted inputs until signatures are verified.
- Cron callers are privileged system actors guarded only by `x-vars-cron-secret`, but no cron jobs are declared in migrations.

## Central Points Of Failure

- Paystack webhook creates the canonical booking record. If webhook processing fails after Paystack takes funds, the app can navigate to bookings with no booking row.
- `bookings.status` is the main state machine and financial state indicator; there is no separate payment ledger.
- `payout_history` is mutable operational state, not an accounting ledger.
- Admin auth depends on a custom cookie and service-role queries; middleware checks only token presence.
- Cron safety depends on external scheduling that is not declared or reproducible from the repo.

## Undocumented Assumptions

- Paystack charge success means funds are already held by VARS, despite comments describing authorization/capture.
- Customers can be redirected away from Paystack and treated as paid before the booking row exists.
- Deno is available in Supabase but not locally.
- Docker/Supabase local stack is available for a new engineer, but this machine cannot run it.
- Cron jobs and secrets exist outside migrations.

