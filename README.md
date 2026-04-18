# VARS — On-Demand Beauty & Grooming

VARS is a mobile marketplace that connects customers in Lagos with verified beauty and grooming professionals — barbers, hair stylists, and makeup artists — who come to them. Customers book a time slot, pay securely, and the vendor arrives at their door.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Core Features](#core-features)
- [Database Schema](#database-schema)
- [Edge Functions](#edge-functions)
- [Mobile App Screens](#mobile-app-screens)
- [Payment Flow](#payment-flow)
- [Auto-Accept System](#auto-accept-system)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

| Attribute | Detail |
|---|---|
| Market | Lagos, Nigeria |
| Services | Barbing, Hair Styling, Makeovers |
| Payment | Paystack (escrow model) |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Mobile | Expo / React Native (iOS & Android) |
| Admin | Next.js dashboard |
| KYC | Youverify SDK (vendors only) |

The platform operates a **two-sided marketplace**:

- **Customers** browse vendors by service category, pick a time slot, pay upfront, and track their vendor live.
- **Vendors** (beauty professionals) manage their own schedule, set availability, receive bookings, and get paid automatically once the service is confirmed complete.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 52, React Native 0.76, Expo Router 4 |
| Maps | react-native-maps |
| Auth | Supabase Auth (email + phone OTP) |
| Database | Supabase Postgres (PostGIS enabled) |
| Realtime | Supabase Realtime (booking status + vendor location) |
| Edge functions | Deno (Supabase Edge Functions) |
| Payments | Paystack — authorization, capture, transfer |
| Push notifications | Expo Push Notifications (FCM/APNs) |
| KYC | Youverify SDK |
| Admin dashboard | Next.js 14 (App Router) |
| Landing page | Next.js 14 |
| Monorepo | Yarn Workspaces |

---

## Repository Structure

```
vars/
├── apps/
│   ├── mobile/          # Expo app — customers + vendors share one binary
│   │   ├── app/
│   │   │   ├── (tabs)/          # Customer tabs: home, bookings, notifications, profile
│   │   │   ├── vendor-tabs/     # Vendor tabs: jobs, schedule, earnings, profile
│   │   │   ├── booking/         # 3-step booking flow
│   │   │   ├── live/            # Live booking tracker
│   │   │   ├── vendor/          # Vendor public profile
│   │   │   ├── vendor-zone-setup.tsx
│   │   │   └── auth/            # Login, phone OTP, vendor login
│   │   ├── components/
│   │   ├── constants/
│   │   ├── contexts/
│   │   └── lib/
│   ├── admin/           # Next.js admin panel
│   └── landing/         # Next.js marketing site
├── packages/
│   └── shared/          # Shared TypeScript types (generated from Supabase)
└── supabase/
    ├── functions/        # Deno edge functions (see below)
    └── migrations/       # SQL migration files
```

---

## Core Features

### For Customers

- **Discovery** — browse vendors by category (Barbing / Hair Styling / Makeovers); filter by distance from their current location using PostGIS
- **Booking flow** — 3-step: pick service → pick date & time slot → review access details + pay
  - Step 3 (review): customer enters building name, floor, flat number, gate code; all inputs are silently filtered (no `@` signs, no sequences of 7+ digits)
  - Step 3 (pay): MapView thumbnail confirms customer location before the pay button activates; Paystack checkout opens in-app WebView
- **Booking detail screen** — unified screen for all booking states; status timeline with timestamps; live vendor tracking map while `on_way`; action buttons change per status (cancel, confirm service, dispute)
- **Paystack checkout** — card charged immediately; funds held in VARS Paystack balance (escrow) until vendor is paid
- **Live tracking** — map polls vendor GPS every 30 seconds while en route; phone number and full access details revealed 15 minutes before appointment
- **Confirm & settle** — customer taps "Confirm service done" to release escrow; auto-releases 1 hour after the scheduled booking end time if the customer takes no action
- **Reviews** — 1–5 star rating + comment after completion
- **Disputes** — raise an issue from the live or booking detail screen; choose a structured category (Vendor didn't show up / Arrived very late / Service not completed / Poor quality / Wrong service / Other) before adding optional free-text detail; escrow freezes immediately pending admin review

### For Vendors

- **Onboarding** — multi-step: profile → services → portfolio → KYC (Youverify) → instant activation on clean pass
- **Jobs dashboard** — incoming requests with 1-hour accept window; active jobs with flow buttons (On My Way → Arrived → Service Rendered); cancel button for accepted/in-progress bookings; history
- **Schedule management** — Calendar/List toggle (persisted); calendar shows 14-day grid with booked slot overlays (client name, service, status dot); list view shows all upcoming bookings; tapping any booking opens a detail bottom sheet
  - Bottom sheet: customer location map thumbnail, access details (revealed 15 min before appointment), accept/decline/on-way/arrived/service-rendered action buttons
  - Auto-accept grace banner: amber countdown + "Cancel penalty-free" button for auto-accepted bookings within the 5-minute window
- **Auto-Accept** — geographic zone system for instant booking confirmation (see below)
- **Earnings** — per-booking breakdown; Paystack automatic payout (80% revenue share)
- **Pioneer programme** — pre-launch lead capture and conversion flow

### Admin

- **Vendors** — defaults to rejected KYC queue (Youverify handles clean passes automatically). Override-approve or reset flagged cases. Vendors with 3+ cancellations in 30 days are auto-flagged for review.
- **Disputes** — SLA timer per dispute (warns at 18h, critical at 24h). Each card shows a colour-coded category label at the top for instant triage. Resolve by releasing escrow to vendor or refunding customer; both parties receive dispute-specific resolution notifications.
- Pioneer lead management

---

## Database Schema

Thirteen migration files build up the schema incrementally:

| Migration | Contents |
|---|---|
| `000_initial_schema` | All core tables, enums, relationships |
| `001_indexes_rls_triggers` | RLS policies, indexes, Postgres triggers |
| `002_discovery_fn` | `nearby_vendors()` PostGIS function |
| `003_pioneer_programme` | Pioneer leads table |
| `004_pioneer_lead_conversion` | Lead → vendor conversion helpers |
| `005_auto_accept` | Auto-Accept fields, `vendor_calendar` table, transport buffer support |
| `006_vendor_cancellation_flag` | `cancellation_flagged` column on vendors; auto-set at 3+ cancellations in 30 days |
| `007_disputes_schema_fixes` | Disputes table refinements |
| `008_portfolio_photos_v2` | Portfolio photo schema updates |
| `010_system_alerts` | `system_alerts` table + `check_cron_health()` for cron monitoring |
| `011_booking_access_details` | `access_building`, `access_floor`, `access_flat`, `access_code`, `user_location_lat`, `user_location_lng` on bookings |
| `012_disputes_rename_statement` | Rename `disputes.statement` → `disputes.reason` to align with edge functions and admin panel |
| `013_dispute_category` | `dispute_category` enum + `category` column on disputes for structured triage |

### Key Tables

| Table | Purpose |
|---|---|
| `profiles` | Customer accounts (extends `auth.users`) |
| `vendors` | Vendor accounts with KYC, ratings, zone settings |
| `services` | Master service catalogue |
| `vendor_services` | A vendor's offered services with price and duration |
| `bookings` | All bookings; holds Paystack reference, escrow state, access details (`access_building/floor/flat/code`), and customer location (`user_location_lat/lng`) |
| `vendor_calendar` | Per-slot availability with state: `unavailable` / `auto_accept` / `transport_buffer` |
| `reviews` | Star ratings + comments |
| `disputes` | Customer-raised issues; includes `category` enum for instant triage |
| `payouts` | Vendor payout records |
| `pioneer_leads` | Pre-launch interest signups |

### Booking Status Flow

```
pending ──── (1hr no response) ──────────────────────────────────────► expired
   │
   ├── (user/vendor cancel) ────────────────────────────────────────► cancelled
   │
   ▼
accepted
   │
   ├── (user/vendor cancel) ────────────────────────────────────────► cancelled
   │
   ▼
on_way ── (user dispute) ──────────────────────────────────────────── ► disputed
   │
   ▼
arrived ── (user dispute) ─────────────────────────────────────────── ► disputed
   │
   ▼
service_rendered
   │
   ├── (user confirm / auto-release 1hr after sched. end) ──────────► completed
   │
   └── (user dispute) ──────────────────────────────────────────────► disputed
```

---

## Edge Functions

All functions live in `supabase/functions/` and run on Deno.

| Function | Method | Purpose |
|---|---|---|
| `paystack-initialize` | POST | Validates booking request, initialises Paystack transaction, returns `access_code` |
| `paystack-webhook` | POST | Handles Paystack events: creates booking on `charge.success` (card already charged), auto-accepts if conditions met, creates transport buffers for auto-accepted bookings |
| `paystack-capture` | POST | Vendor accepts a pending booking — updates booking status to `accepted`, creates transport buffer blocks (same as auto-accept path) |
| `paystack-release` | POST | Vendor declines or booking expires — issues a full Paystack refund to the customer |
| `paystack-settle` | POST | Customer confirms service done, or 1-hr auto-release fires after scheduled end — initiates Paystack transfer to vendor (80/20 split; Pioneer vendors: 100%) |
| `paystack-cancel` | POST | Customer cancels — tiered refund (0–15 min: 15% fee; 15 min–1 hr: 50% fee; within 1 hr of service: non-refundable); releases transport buffers |
| `paystack-verify-bank` | POST | Verifies vendor bank account via Paystack during onboarding |
| `vendor-cancel-booking` | POST | Vendor cancels an accepted/in-progress booking — full refund to customer, transport buffers released, rolling 30-day cancellation count incremented, flags vendor at 3+ |
| `vendor-cancel-grace` | POST | Vendor cancels an auto-accepted booking within the 5-minute grace period (penalty-free, full refund) |
| `dispute-raise` | POST | User raises a dispute — requires a structured `category`; free-text `reason` optional unless category is `other`; booking status set to `disputed` (freezes auto-release), inserts into `disputes`, notifies both parties |
| `phone-reveal` | POST (cron, every 5 min) | Finds accepted bookings within 15 min of `scheduled_at`, sets `phone_revealed = true`, notifies vendor ("Head out now") and customer ("They're on their way") |
| `send-reminders` | POST (cron, every 5 min) | Sends 24-hour and 1-hour before-appointment reminders to both customer and vendor; idempotent via notifications table |
| `vendor-kyc-init` | POST | Initiates Youverify KYC session |
| `vendor-kyc-webhook` | POST | Receives Youverify result — clean pass: `kyc_status = verified` + `is_active = true` (instant activation); failure: `kyc_status = rejected`, appears in admin queue |
| `vendor-register-lead` | POST | Captures a pioneer programme lead |
| `vendor-set-zone` | POST | Saves vendor's auto-accept geographic zone |
| `vendor-confirm-zone` | GET/POST | GET: returns zone status; POST: marks zone confirmed for today |
| `vendor-update-location` | POST | Called every 60s by vendor app while `on_way`; writes `vendor_current_lat/lng` to vendors table for customer live tracking map; also detects zone drift |

---

## Mobile App Screens

### Customer

| Screen | Route |
|---|---|
| Home (vendor discovery) | `/(tabs)/` |
| Bookings list | `/(tabs)/bookings` |
| Notifications | `/(tabs)/notifications` |
| Customer profile | `/(tabs)/profile` |
| Vendor public profile | `/vendor/[id]` |
| Booking flow (3 steps) | `/booking/[vendorId]` |
| Booking detail | `/booking/detail/[bookingId]` |
| Live booking tracker | `/live/[bookingId]` |
| Leave a review | `/review/[bookingId]` |

### Vendor

| Screen | Route |
|---|---|
| Jobs dashboard | `/vendor-tabs/` (index) |
| Schedule / calendar | `/vendor-tabs/schedule` |
| Earnings | `/vendor-tabs/earnings` |
| Vendor profile & settings | `/vendor-tabs/profile` |
| Auto-Accept zone setup | `/vendor-zone-setup` |
| Onboarding (5 steps) | `/vendor-onboarding/step-[1-5]-*` |

---

## Payment Flow

```
Customer taps "Pay"
        │
        ▼
paystack-initialize
  • Validates slot availability
  • Checks vendor calendar for conflicts
  • Initialises Paystack transaction
  • Returns access_code + auto_accept_likely hint
        │
        ▼
Paystack Checkout (WebView)
        │
   charge.success
        │
        ▼
paystack-webhook
  • Card is charged at this point — funds move to VARS Paystack balance (escrow)
  • Creates booking record (sets auto_release_at = scheduled_end + 1hr)
  • If auto-accept conditions met → status = accepted, 5-min grace window opens,
    2× transport buffer blocks inserted after booking end
  • Otherwise → status = pending, vendor has 1 hour to accept
        │
   ┌────┴──────┐
   │           │
Vendor       Expires
accepts     (1 hr)
   │           │
paystack-  paystack-
capture    release
(status →  (full refund
 accepted)  to customer)
   │
   ├── User cancels (paystack-cancel)
   │     • Tiered fee: within 1hr of service = non-refundable (100%),
   │       within 15min of booking = 15%, all other cases = 50%
   │     • Transport buffers deleted
   │
   ├── Vendor cancels (vendor-cancel-booking)
   │     • Full refund, no fee
   │     • Transport buffers deleted
   │     • Cancellation count incremented (flagged at 3+ in 30 days)
   │
   ├── User disputes (dispute-raise)
   │     • Booking → 'disputed' (escrow frozen; auto-release will NOT fire)
   │     • Admin resolves: pay vendor OR refund user
   │
Service completed → status = service_rendered
   │
   ├── User confirms (paystack-settle / user_confirmed)
   │
   └── Auto-release fires at auto_release_at (paystack-settle / auto_release)
         • 1 hour after scheduled booking END time
         • Same 80/20 split as manual confirm

paystack-settle
  • Initiates Paystack transfer (80% to vendor, 20% VARS commission)
  • Pioneer vendors: 100% for first 3 completed bookings
```

---

## Auto-Accept System

Vendors can opt into **Auto-Accept**: bookings that fall within their configured geographic zone and an auto-accept time slot are confirmed instantly — no waiting for the vendor to manually accept.

### How It Works

Three conditions must all be true at the moment of payment for auto-accept to fire:

1. **Slot marked auto-accept** — vendor has tagged the specific 30-minute block as `auto_accept` in their calendar
2. **User within zone** — the customer's location is within the vendor's zone radius (Haversine distance check)
3. **Vendor settings active** — `auto_accept_enabled = true`, `auto_accept_paused_due_to_drift = false`, and the vendor has confirmed their zone today

### Zone Confirmation

Vendors must confirm their zone each morning before auto-accept activates for the day. A bottom-sheet modal appears when they open the app. Confirmation is stored as `auto_accept_zone_confirmed_date = today`.

### Zone Drift Detection

While a vendor is online, the app pings their GPS location every 5 minutes (`vendor-update-location`). If they move more than `zone_radius + 3 km` from their zone centre, `auto_accept_paused_due_to_drift` is set to `true` and auto-accept suspends until they return to the zone or re-confirm.

### Grace Period

After an auto-accepted booking is created, the vendor has a **5-minute grace window** to cancel penalty-free. During this window:
- The booking status is already `accepted` (customer sees instant confirmation)
- A "Cancel (no penalty)" button appears on the vendor's jobs screen with a countdown
- Cancelling in this window triggers a full Paystack refund with no cancellation fee
- The `auto_accept_grace_expires_at` timestamp controls the window

### Transport Buffers

When a booking is confirmed (auto-accepted or manually accepted by the vendor), the system automatically inserts `transport_buffer` blocks into `vendor_calendar` for the **two 30-minute slots immediately after** the booking ends. These blocks prevent back-to-back bookings with no travel time. They are:
- **After-only** — no buffer is inserted before the booking (vendor may have come from anywhere)
- Two consecutive 30-minute blocks immediately after the booking's last slot
- Clamped to working hours — only created if they end by 22:00
- Read-only (cannot be toggled by the vendor)
- Skipped if a block already exists in that slot
- Deleted automatically if the booking is cancelled (by user, vendor, or grace-cancel)

### Vendor Calendar States

| DB state | UI label | Colour | Meaning |
|---|---|---|---|
| *(no record)* | Available | White border | Open — customers can book |
| `unavailable` | Blocked | Red | Closed — customers cannot book |
| `auto_accept` | Auto-accept | Gold ⚡ | Open + instant confirm |
| `transport_buffer` | Buffer | Grey 🚗 | System-reserved travel time (read-only, not tappable) |

Tapping a slot cycles through the three user-controlled states: Available → Blocked → Auto-accept → Available. Transport buffer slots cannot be toggled.

---

## Vendor KYC & Approval

Vendors complete identity verification via the **Youverify SDK** during onboarding.

- **Clean pass** — `vendor-kyc-webhook` sets `kyc_status = verified` AND `is_active = true` in a single update. The vendor goes live **instantly**, no admin action required.
- **Rejection / flagged** — `kyc_status = rejected`. The case surfaces in the admin Vendors panel (which defaults to the rejected queue). Admin can:
  - **Override & approve** — manually set `kyc_status = verified, is_active = true`
  - **Reset KYC** — send vendor back to pending for re-submission

The admin panel never needs to action a clean pass. The queue stays focused on problem cases only.

---

## Cancellations, Disputes & Expiry

### User-Initiated Cancellation (`paystack-cancel`)

The cancel button is available on the live booking screen while the booking is `pending` or `accepted`. **Once the vendor marks "I'm on my way" (`on_way`), cancellation is locked out** — the customer's only recourse from that point is a dispute.

Rules are evaluated in priority order (top wins):

| Condition | Fee | Vendor share |
|---|---|---|
| Within 1 hr of service start | Non-refundable (100%) | 70% vendor / 30% VARS |
| Within 15 min of booking | 15% of price | 5% vendor / 10% VARS |
| All other cases | 50% of price | 20% vendor / 30% VARS |

Example: cancel 20 min after booking but 3 hours before service → 50% fee (not within 1hr of service, not within 15min of booking).

Transport buffer blocks are deleted on cancellation, freeing the vendor's calendar.

### Vendor-Initiated Cancellation (`vendor-cancel-booking`)

- Full refund to customer — no fee applied
- Transport buffer blocks deleted
- Rolling 30-day cancellation count queried; if ≥ 3, `cancellation_flagged = true` on vendor record
- Admin reviews flagged vendors and can clear the flag after investigation

### Disputes (`dispute-raise`)

1. User taps "Something's wrong" from the live booking screen or booking detail screen
2. User selects a **category** (required): Vendor didn't show up / Arrived very late / Service not completed / Poor quality / Wrong service / Other. Free-text reason is optional unless category is "Other"
3. Booking status set to `disputed` — **escrow is frozen** (the auto-release cron only queries `service_rendered`, so disputed bookings are skipped)
4. A `disputes` record is inserted (with category) and both parties are notified
5. Admin resolves via the Disputes panel (SLA: 24 hours, warns at 18h). Each card shows a colour-coded category label for instant triage:
   - **Release to Vendor** — calls `paystack-settle`; vendor receives dispute-resolution notification
   - **Refund to User** — calls `paystack-release`; user receives dispute-resolution notification with refund amount
6. Both parties notified of the outcome with dispute-specific copy (not the generic payment messages)

### Vendor No-Response Expiry (`paystack-release` cron)

A scheduled cron runs every hour. Any `pending` booking older than **1 hour** is expired:
- Booking marked `expired`
- Full Paystack refund issued to user
- User notified and pointed back to vendor feed for the same category
- Vendor notified (timeout only, not manual decline)

### Auto-Release (`paystack-settle` cron)

A scheduled cron fires every 15 minutes. Any `service_rendered` booking where `auto_release_at ≤ now` is settled:
- `auto_release_at` = `scheduled_at + (duration_blocks × 30min) + 1hr`
- Standard 80/20 settlement — functionally identical to a user confirmation
- User and vendor notified

**Dependency:** auto-release only fires once the vendor has marked the booking as `service_rendered`. If the vendor never taps "Service rendered," `auto_release_at` is irrelevant and the funds remain in escrow. To avoid this, 15 minutes after the scheduled service end time the same cron sends a one-time push notification to the vendor reminding them to mark the job complete. The vendor's jobs screen also shows a persistent in-app banner for any `arrived` booking past its scheduled end time.

---

## Getting Started

### Prerequisites

- Node 18+
- Yarn
- Supabase CLI
- Expo CLI (`npm install -g expo-cli`)
- An Expo account (for push notifications + EAS builds)
- A Paystack account (test keys for local dev)

### Install

```bash
yarn install
```

### Local Supabase

```bash
supabase start          # starts local Postgres + Auth + Studio
supabase db push        # applies all migrations
```

### Run the mobile app

```bash
yarn mobile             # starts Expo dev server
```

Then press `i` for iOS simulator or `a` for Android emulator, or scan the QR code with Expo Go.

### Run the admin dashboard

```bash
yarn admin              # Next.js dev server on :3000
```

### Run the landing page

```bash
yarn landing            # Next.js dev server on :3001
```

### Generate TypeScript types from DB

```bash
yarn db:types
```

---

## Environment Variables

### Mobile (`apps/mobile/.env`)

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

### Edge Functions (Supabase Secrets)

```
SUPABASE_SERVICE_ROLE_KEY=
PAYSTACK_SECRET_KEY=
YOUVERIFY_API_KEY=
CRON_SECRET=               # shared secret validated by all cron-triggered edge functions
YOUVERIFY_WEBHOOK_SECRET=  # HMAC secret for Youverify webhook signature verification
```

### Admin (`apps/admin/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Deployment

### Database

```bash
supabase db push           # push all pending migrations to production
```

### Edge Functions

```bash
supabase functions deploy   # deploy all edge functions
# or deploy one at a time:
supabase functions deploy paystack-webhook
```

### Mobile App (EAS)

```bash
eas build --platform all   # production build
eas submit                 # submit to App Store + Play Store
```

### Admin & Landing

Both Next.js apps deploy to Vercel. Connect the repository and set environment variables in the Vercel dashboard. Each app has a `vercel.json` at its root.
