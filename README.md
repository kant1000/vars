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
- **Booking flow** — 3-step: pick service → pick date & time slot → review & pay
- **Paystack checkout** — opens in an in-app WebView; payment held in escrow
- **Live tracking** — real-time map showing vendor location while en route; phone number revealed 15 minutes before appointment
- **Confirm & settle** — customer taps "Confirm service done" to release escrow; auto-releases after 2 hours if no action
- **Reviews** — 1–5 star rating + comment after completion
- **Disputes** — raise an issue at any point; held for admin review

### For Vendors

- **Onboarding** — multi-step: profile → services → portfolio → KYC (Youverify) → pending approval
- **Jobs dashboard** — incoming requests with 2-hour accept window; active jobs with flow buttons (On My Way → Arrived → Service Rendered); history
- **Schedule management** — 30-minute slot calendar (14-day view); three-state tap cycle: available → blocked → auto-accept
- **Auto-Accept** — geographic zone system for instant booking confirmation (see below)
- **Earnings** — per-booking breakdown; Paystack automatic payout (80% revenue share)
- **Pioneer programme** — pre-launch lead capture and conversion flow

### Admin

- Vendor approval and suspension
- KYC review
- Dispute resolution
- Pioneer lead management

---

## Database Schema

Six migration files build up the schema incrementally:

| Migration | Contents |
|---|---|
| `000_initial_schema` | All core tables, enums, relationships |
| `001_indexes_rls_triggers` | RLS policies, indexes, Postgres triggers |
| `002_discovery_fn` | `nearby_vendors()` PostGIS function |
| `003_pioneer_programme` | Pioneer leads table |
| `004_pioneer_lead_conversion` | Lead → vendor conversion helpers |
| `005_auto_accept` | Auto-Accept fields, `vendor_calendar` table, transport buffer support |

### Key Tables

| Table | Purpose |
|---|---|
| `profiles` | Customer accounts (extends `auth.users`) |
| `vendors` | Vendor accounts with KYC, ratings, zone settings |
| `services` | Master service catalogue |
| `vendor_services` | A vendor's offered services with price and duration |
| `bookings` | All bookings; holds Paystack reference and escrow state |
| `vendor_calendar` | Per-slot availability with state: `unavailable` / `auto_accept` / `transport_buffer` |
| `reviews` | Star ratings + comments |
| `disputes` | Customer-raised issues |
| `payouts` | Vendor payout records |
| `pioneer_leads` | Pre-launch interest signups |

### Booking Status Flow

```
pending → accepted → on_way → arrived → service_rendered → completed
                                                          ↘ cancelled
                                                          ↘ disputed
                                                          ↘ expired
```

---

## Edge Functions

All functions live in `supabase/functions/` and run on Deno.

| Function | Method | Purpose |
|---|---|---|
| `paystack-initialize` | POST | Validates booking request, initialises Paystack transaction, returns `access_code` |
| `paystack-webhook` | POST | Handles Paystack events: creates booking on `charge.success`, auto-accepts if conditions met, creates transport buffers |
| `paystack-capture` | POST | Vendor accepts a pending booking — captures the Paystack authorisation |
| `paystack-release` | POST | Vendor declines or booking expires — voids the authorisation |
| `paystack-settle` | POST | Customer confirms service done (or 2-hr auto-release) — initiates Paystack transfer to vendor |
| `paystack-cancel` | POST | Customer cancels — refund with sliding cancellation fee |
| `paystack-verify-bank` | POST | Verifies vendor bank account via Paystack during onboarding |
| `vendor-kyc-init` | POST | Initiates Youverify KYC session |
| `vendor-kyc-webhook` | POST | Receives Youverify result, updates `kyc_status` |
| `vendor-register-lead` | POST | Captures a pioneer programme lead |
| `vendor-set-zone` | POST | Saves vendor's auto-accept geographic zone |
| `vendor-confirm-zone` | GET/POST | GET: returns zone status; POST: marks zone confirmed for today |
| `vendor-update-location` | POST | Updates vendor's current location; detects zone drift |
| `vendor-cancel-grace` | POST | Vendor cancels an auto-accepted booking within the 5-minute grace period (penalty-free, full refund) |

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
  • Creates booking record
  • If auto-accept conditions met → status = accepted, grace window opens
  • Otherwise → status = pending, vendor has 2 hours to accept
        │
   ┌────┴─────┐
   │          │
Vendor      Expires
accepts     (2 hrs)
   │          │
paystack-  paystack-
capture    release
   │
Service completed
   │
   ▼
paystack-settle
  • Releases escrow
  • Initiates Paystack transfer (80% to vendor)
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

When a booking is auto-accepted, the system automatically inserts `transport_buffer` blocks into `vendor_calendar` for the 30 minutes before and after the booking. These blocks prevent back-to-back bookings from being accepted with no travel time. They are:
- Read-only (cannot be toggled by the vendor)
- Clamped to working hours (08:00–22:00)
- Skipped if a block already exists in that slot
- Deleted automatically if the booking is grace-cancelled

### Vendor Calendar States

| State | Colour | Meaning |
|---|---|---|
| *(default / no record)* | White border | Available — customers can book |
| `unavailable` | Red | Blocked — customers cannot book |
| `auto_accept` | Gold ⚡ | Available + instant confirm |
| `transport_buffer` | Grey 🚗 | System-reserved travel buffer (read-only) |

Tapping a slot cycles: available → blocked → auto-accept → back to available.

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
VARS_CRON_SECRET=          # shared secret for scheduled cron calls
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
