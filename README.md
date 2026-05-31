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
- [Vendor Lead Outreach System](#vendor-lead-outreach-system)
- [Mobile App Screens](#mobile-app-screens)
- [Payment Flow](#payment-flow)
- [Auto-Accept System](#auto-accept-system)
- [Copy Voice & Tone](#copy-voice--tone)
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
| Roadmap | `apps/landing/src/app/roadmap/data/milestones.ts` — source of truth for phase and milestone state. Live at bookwithvars.com/roadmap. |
| Current milestone | 400 Vendors in the Pipeline (June 2026). App Store Launch: July 2026. Customer marketing: August 2026. |

The platform operates a **two-sided marketplace**:

- **Customers** browse vendors by service category, pick a time slot, pay upfront, and track their vendor live.
- **Vendors** (beauty professionals) manage their own schedule, set availability, receive bookings, and get paid automatically once the service is confirmed complete.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 52, React Native 0.76, Expo Router 4 |
| Maps | react-native-maps |
| Animations | React Native `Animated` API, react-native-svg 15.8.0 |
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
- **Confirm & settle** — customer taps "Confirm service done" to release escrow; auto-releases 2 hours after the vendor marks service rendered if the customer takes no action
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
- **Pioneer programme** — lead capture and conversion flow (cohort complete as of May 2026; landing form now presents general stylist registration for all new vendors)

### Landing Page & Blog

The landing page (`apps/landing/`) is the public-facing marketing site at bookwithvars.com. It includes:

- **Home** (`/`) — service overview, hero section, FAQ, and stylist registration form (`PioneerSection.tsx`). The form captures leads into `vendor_leads` via the `vendor-register-lead` edge function.
- **Privacy & Terms** (`/privacy`, `/terms`) — static policy pages.
- **Wide Awake blog** (`/blog`) — a content marketing blog covering money, mindset, culture, and the Nigerian beauty market. Content is defined as a static article array in `apps/landing/src/app/blog/articles.ts`. Each article has a `body: string | null` field — `null` means "coming soon". The blog index splits articles into Live and Coming Soon sections. Article pages (`/blog/[slug]`) include a comment system, a reading progress bar, and a mid-article CTA injected after the intro paragraphs. Live articles as of May 2026: *The Culture of Shame*, *Lagos Has the Talent*, *The Number in Your Head*.

### Admin

Requires login — authenticated via Supabase Auth + `admin_users` table. Cookie-based session (`sb-access-token`); Next.js middleware redirects unauthenticated requests to `/login`. All mutations (KYC overrides, dispute resolution, outreach approvals) run through Next.js Server Actions backed by the server-side service-role client — no credentials are exposed in the browser bundle.

- **Vendors** — defaults to rejected KYC queue (Youverify handles clean passes automatically). Override-approve or reset flagged cases. Vendors with 3+ cancellations in 30 days are auto-flagged for review.
- **Disputes** — SLA timer per dispute (warns at 18h, critical at 24h). Each card shows a colour-coded category label at the top for instant triage. Resolve by releasing escrow to vendor or refunding customer; both parties receive dispute-specific resolution notifications.
- **Outreach Queue** (`/leads/outreach`) — review and bulk-approve vendor lead messages generated by the nurture cron. Checkboxes + bulk approve/reject with per-message channel selector. See [Vendor Lead Outreach System](#vendor-lead-outreach-system).
- **Marketing** (`/leads/marketing`) — compose and send bulk HTML email campaigns to segments of vendor leads. Segment by service type, pioneer status, lead state, and converted flag. Live recipient count updates on every filter change. Two-step confirmation before send. Powered by `send-marketing-email` edge function.

---

## Database Schema

Twenty migration files build up the schema incrementally:

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
| `014_reschedule_pending` | `suggested_scheduled_at` column on bookings for vendor reschedule proposals |
| `015_reschedule_expires_at` | `reschedule_expires_at` column; cron cancels stale `rescheduled_pending` bookings after 1 hour |
| `016_booking_status_trigger` | Postgres trigger blocking invalid status jumps from JWT clients; edge functions (service role) bypass freely |
| `017_remove_available_block_state` | Removes the vestigial `available` value from `block_state_enum`; available slots carry no DB row |
| `018_fix_rescheduled_pending_enum` | Adds the missing `rescheduled_pending` value to `booking_status_enum`; migration 014 was a no-op because it referenced the wrong type name (`booking_status` instead of `booking_status_enum`) |
| `019_kyc_rejection_reason` | `kyc_rejection_reason TEXT` column on vendors; populated by `vendor-kyc-webhook` on rejection, cleared on each new attempt |
| `020_outreach_schema` | Creates `vendor_lead_outreach` table with full RLS; adds `lead_state` (PROSPECT/COLD/VERIFIED/CONVERTED), `last_outreach`, and `converted` columns to `vendor_leads`; adds admin read/update policies on `vendor_leads` |
| `021_pioneer_atomic` | Adds `UNIQUE(email)` constraint to `vendor_leads`; creates `register_vendor_lead()` Postgres function that uses an advisory lock to atomically count + insert, eliminating the pioneer slot race condition |
| `20260525120000_vendor_lead_tick_august_copy_email_channel` | Adds email channel records to all three tick stages (introduction → `welcome_email`, reengagement → `reengagement_email`, go_live → `go_live` email); refreshes WhatsApp copy |
| `20260525130000_vendor_leads_email_unsubscribed` | Adds `email_unsubscribed BOOLEAN NOT NULL DEFAULT false` to `vendor_leads`; checked before every outreach and marketing email send |
| `20260525140000_notifications_reminder_idempotency_index` | Partial unique index on `notifications(booking_id, type)` for reminder types — enforces at-most-once delivery at DB level under concurrent cron runs |
| `20260525150000_fix_get_nearby_vendors_active_filter` | Adds `is_active = TRUE AND is_suspended = FALSE` to `get_nearby_vendors` WHERE clause — previously suspended/inactive vendors could appear in customer discovery |
| `20260525160000_payout_history_booking_id_unique` | `UNIQUE (booking_id)` constraint on `payout_history` — prevents double-payout race between user confirm, auto-release, and admin settlement |
| `20260526000001_zone_radius_numeric` | Changes `auto_accept_zone_radius_km` from INT to NUMERIC(4,1); updates constraint to allow 1 and 1.5 km values |
| `20260531000001_vendor_trust_layer` | Adds `profile_image_url`, `profile_image_raw_url`, `profile_image_locked` to `vendors`; tightens `vendors_update_own` RLS to block client writes on those columns; creates `vendor-identity-images` storage bucket; updates `get_nearby_vendors` to return `profile_image_url` |

### Key Tables

| Table | Purpose |
|---|---|
| `profiles` | Customer accounts (extends `auth.users`) |
| `vendors` | Vendor accounts with KYC, ratings, zone settings, and identity image columns (`profile_image_url`, `profile_image_raw_url`, `profile_image_locked`) |
| `services` | Master service catalogue |
| `vendor_services` | A vendor's offered services with price and duration |
| `bookings` | All bookings; holds Paystack reference, escrow state, access details (`access_building/floor/flat/code`), and customer location (`user_location_lat/lng`) |
| `vendor_calendar` | Blocked slot records — state: `unavailable` / `auto_accept` / `transport_buffer`. No row = slot is open. |
| `reviews` | Star ratings + comments |
| `disputes` | Customer-raised issues; includes `category` enum for instant triage |
| `payout_history` | Vendor payout records — `UNIQUE (booking_id)` enforced at DB level to prevent duplicate transfers |
| `vendor_leads` | Pre-launch interest signups — `lead_state` (PROSPECT/COLD/VERIFIED/CONVERTED), `pioneer`, `last_outreach`, `email_unsubscribed` |
| `vendor_lead_outreach` | Outreach message queue — one record per message attempt; `channel` (whatsapp/sms/email), `status` (draft/approved/sent/failed/blocked), `message_type`, `message_body` |

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
   ├── (user confirm / auto-release 2hrs after service_rendered) ───► completed
   │
   └── (user dispute) ──────────────────────────────────────────────► disputed

accepted / pending
   │
   └── (vendor suggests reschedule) ────────────────────────────────► rescheduled_pending
          │
          ├── (customer accepts) ───────────────────────────────────► accepted
          │
          ├── (customer declines) ──────────────────────────────────► cancelled
          │
          └── (1hr no customer response — cron) ───────────────────► cancelled
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
| `paystack-settle` | POST | Customer confirms service done, or 2-hr auto-release fires after service_rendered — initiates Paystack transfer to vendor (80/20 split; Pioneer vendors: 100%); also sends customer a warning notification 30 min before auto-release |
| `paystack-cancel` | POST | Customer cancels — tiered refund (0–15 min: 15% fee; 15 min–1 hr: 50% fee; within 1 hr of service: non-refundable); releases transport buffers |
| `paystack-verify-bank` | POST | Verifies vendor bank account via Paystack during onboarding |
| `vendor-cancel-booking` | POST | Vendor cancels an accepted/in-progress booking — full refund to customer, transport buffers released, rolling 30-day cancellation count incremented, flags vendor at 3+ |
| `vendor-cancel-grace` | POST | Vendor cancels an auto-accepted booking within the 5-minute grace period (penalty-free, full refund) |
| `dispute-raise` | POST | User raises a dispute — requires a structured `category`; free-text `reason` optional unless category is `other`; booking status set to `disputed` (freezes auto-release), inserts into `disputes`, notifies both parties |
| `phone-reveal` | POST (cron, every 5 min) | Finds accepted bookings within 15 min of `scheduled_at`, sets `phone_revealed = true`, notifies vendor ("Head out now") and customer ("They're on their way") |
| `vendor-update-job-status` | POST | Vendor advances a booking through `on_way → arrived → service_rendered`; validates the transition, stamps the timestamp, notifies the customer |
| `submit-review` | POST | Customer submits a star rating (1–5, required) + optional comment for a completed booking; DB trigger updates vendor `avg_rating`; notifies vendor; 409 on duplicate |
| `send-reminders` | POST (cron, every 5 min) | Sends 24-hour and 1-hour before-appointment reminders to both customer and vendor, plus a 30-minute pending-acceptance reminder to the vendor; idempotent via notifications table |
| `vendor-kyc-init` | POST | Initiates Youverify KYC session |
| `vendor-kyc-webhook` | POST | Receives Youverify result — clean pass: `kyc_status = verified` + `is_active = true` (instant activation); also extracts the liveness face image from the payload, uploads raw and passport-cropped versions to `vendor-identity-images` storage, and sets `profile_image_url` / `profile_image_raw_url` / `profile_image_locked = true` on the vendor row. Image failure is non-blocking — KYC pass completes regardless. Failure: `kyc_status = rejected`, appears in admin queue |
| `vendor-register-lead` | POST/GET | Captures a vendor lead; GET returns current pioneer spot count. On successful POST: normalises phone to E.164, inserts into `vendor_leads`, creates an auto-approved `welcome_email` outreach record ready for delivery |
| `deliver-outreach` | POST | Picks up approved `vendor_lead_outreach` records and delivers via the appropriate channel (WhatsApp/SMS via Termii, email via Resend). Controlled by `DELIVERY_LIVE` secret — logs only when unset. Accepts optional `{ record_id }` or `{ lead_id }` to scope delivery |
| `unsubscribe-lead` | GET | One-click email unsubscribe — verifies HMAC-SHA256 token, sets `email_unsubscribed = true` on `vendor_leads`. Linked from every outreach and marketing email footer |
| `send-marketing-email` | POST | Sends a bulk HTML campaign email to a segment of vendor leads. Segmentation via Supabase (`service_type`, `pioneer`, `lead_state`, `converted`). Renders per-lead HTML with unsubscribe URL. Delivers via Resend Batch API (100/request). Called by admin marketing panel |
| `vendor-set-zone` | POST | Saves vendor's auto-accept geographic zone |
| `vendor-confirm-zone` | GET/POST | GET: returns zone status; POST: marks zone confirmed for today |
| `vendor-update-location` | POST | Called every 60s by vendor app while `on_way`; writes `vendor_current_lat/lng` to vendors table for customer live tracking map; also detects zone drift |
| `photo-consent-request` | POST | Vendor requests permission to use a booking photo in their portfolio — creates a consent record with 72-hour expiry, notifies customer |
| `photo-consent-respond` | POST | Customer approves or declines a photo consent request |
| `photo-consent-expire` | POST (cron) | Cancels any pending photo consent requests older than 72 hours; notifies vendor |
| `vendor-suggest-reschedule` | POST | Vendor proposes a new time — sets status to `rescheduled_pending`, writes `suggested_scheduled_at`, starts 1-hour expiry clock |
| `customer-accept-reschedule` | POST | Customer accepts vendor's proposed time — booking returns to `accepted` with updated `scheduled_at` |
| `customer-decline-reschedule` | POST | Customer declines — booking cancelled with full refund |
| `reschedule-expire` | POST (cron, hourly) | Cancels any `rescheduled_pending` booking where `reschedule_expires_at` is in the past; notifies both parties |

---

## Cron Jobs

All cron jobs are registered manually in the Supabase dashboard (Database → SQL Editor using `cron.schedule()`). They are not in migration files. If you need to recreate them on a new project, run each of these:

| Job | Schedule | Target |
|---|---|---|
| `booking-expire-every-5min` | `*/5 * * * *` | `paystack-release` |
| `paystack-settle-cron` | `*/5 * * * *` | `paystack-settle` |
| `phone-reveal` | `*/5 * * * *` | `phone-reveal` |
| `send-reminders` | `*/5 * * * *` | `send-reminders` |
| `photo-consent-expire-cron` | `0 * * * *` | `photo-consent-expire` |
| `reschedule-expire-hourly` | `0 * * * *` | `reschedule-expire` |
| `cron-health-check` | `0 */2 * * *` | `check_cron_health()` DB function |
| `vendor-lead-tick` | `0 * * * *` | `vendor_lead_tick()` DB function — runs the lead nurture state machine hourly |
| `deliver-outreach-cron` | `*/10 * * * *` | `deliver-outreach` edge function — flushes approved outreach records to providers every 10 minutes (only active when `DELIVERY_LIVE=true`) |

All edge function cron jobs call their function via `net.http_post` with the `x-vars-cron-secret` header. The `cron-health-check` and `vendor-lead-tick` jobs call their Postgres functions directly via `SELECT`.

---

## Vendor Lead Outreach System

A multi-channel nurture system that takes a lead from landing page signup through to becoming an active vendor. Built in two layers: an automated state machine (DB cron) and a manual admin review queue.

### Architecture

```
Landing page form
       │
       ▼
vendor-register-lead (edge fn)
  • Inserts vendor_leads row (pioneer / waitlist)
  • Creates welcome_email outreach record (status: approved, channel: email)
       │
       ├──► deliver-outreach → Resend → Day 0 welcome email (when DELIVERY_LIVE=true)
       │
       ▼
vendor_lead_tick() — runs hourly via cron
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ Priority order (highest first):                                         │
  │                                                                         │
  │ 1. PROSPECT/COLD → VERIFIED  (KYC approved via Youverify webhook)      │
  │                                                                         │
  │ 2. GO-LIVE message           (lead_state = VERIFIED)                   │
  │    • Deletes any pending intro/reengagement WhatsApp drafts first      │
  │    • Queues "Congrats, you're live" WhatsApp (draft)                   │
  │                                                                         │
  │ 3. PROSPECT → COLD           (last_outreach > 7 days ago)              │
  │                                                                         │
  │ 4. REENGAGEMENT message      (lead_state = COLD, 7-day silence)        │
  │    • Deletes any pending intro WhatsApp draft first                    │
  │    • Queues re-engagement WhatsApp (draft)                             │
  │                                                                         │
  │ 5. INTRODUCTION message      (last_outreach IS NULL, 24h after signup) │
  │    • Queues intro WhatsApp (draft)                                     │
  │                                                                         │
  │ Guards per stage:                                                       │
  │   • Only phone channels (whatsapp/sms) block new phone messages        │
  │   • Email channel is parallel — never blocks WhatsApp cadence          │
  │   • Max 3 sent messages per type per lead                              │
  │   • 50 leads processed per tick                                        │
  └─────────────────────────────────────────────────────────────────────────┘
       │
       ▼
Admin Outreach Queue (apps/admin/src/app/leads/outreach/)
  • Drafts surface for review; admin bulk-approves or rejects
  • Per-record edit + channel override before approval
  • ComposePanel: ad-hoc segment blasts by service type (unconverted / converted toggle)
       │
       ▼
deliver-outreach (edge fn) — called by cron or "Send Now"
  • Routes by channel: WhatsApp/SMS → Termii, email → Resend
  • Stamps last_outreach on lead for phone channels only (email is parallel)
  • Marks record sent / failed with provider message ID
```

### Message Types

| Type | Channel | Trigger | Copy |
|---|---|---|---|
| `welcome_email` | email | Immediately on registration | Service-specific hook, pioneer/earnings, KYC explainer, single CTA |
| `introduction` | whatsapp | 24h after signup, `last_outreach IS NULL` | Service-specific opener, pioneer/earnings line |
| `reengagement` | whatsapp | COLD state, 7 days silence | Pioneer spot urgency or ₦ earnings, KYC reassurance |
| `go_live` | whatsapp | KYC verified | Congratulations, pioneer commission note, booking CTA |
| `custom` | any | Admin ComposePanel blast | Free-text admin-authored |

### Copy

All message copy lives in [`supabase/functions/_shared/lead-copy.ts`](supabase/functions/_shared/lead-copy.ts). Edit there to change what leads receive — no migration or logic change needed. Functions exported: `welcomeEmail`, `reengagementEmail`, `whatsappIntro`, `whatsappReengagement`, `whatsappGoLive`.

Copy varies by:
- **Service type** — barbing / hair_styling / makeovers / other each get a different opening hook
- **Pioneer status** — Pioneer leads see 0% commission messaging; non-pioneers see the 80% earnings line

### Going Live

The system is fully built. Providers are stubbed until `DELIVERY_LIVE=true`.

**Email (ready now):**
1. Confirm `RESEND_API_KEY`, `DELIVER_OUTREACH_SECRET`, `UNSUBSCRIBE_SECRET`, `SUPABASE_URL` are set in Supabase secrets
2. Set `DELIVERY_LIVE=true`

**WhatsApp (additional steps required):**
1. Submit the three outreach message templates (intro, reengagement, go-live) to Meta via the Termii dashboard for HSM approval — without approved templates, messages are silently discarded
2. Set `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_BASE_URL` in Supabase secrets
3. Set `DELIVERY_LIVE=true`

**Optional:**
- Set `LAUNCH_MONTH` in Supabase secrets if launch month differs from the default (`'August'`)

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

## Connectivity Resilience

The mobile app is built to degrade gracefully on Lagos's variable network conditions. Four utilities in `apps/mobile/lib/` work together:

| Utility | File | Purpose |
|---|---|---|
| `useNetworkState` | `lib/useNetworkState.ts` | Polls Google's `generate_204` endpoint to determine real connectivity. Polls every 30 s when online, every 8 s when offline. No third-party dependency. |
| `fetchWithRetry` | `lib/fetchWithRetry.ts` | Wraps `fetch` with 3 attempts, an 8 s abort-controller timeout per attempt, and silent exponential backoff (1 s → 2 s between retries). Used for all edge function calls that must succeed. |
| `actionQueue` | `lib/actionQueue.ts` | AsyncStorage-backed queue for actions that fail due to connectivity. `enqueueAction()` persists a serialised request; `flushQueue()` replays the queue in order when the device comes back online, removing each entry on success. |
| `cache` | `lib/cache.ts` | AsyncStorage TTL cache (`cacheSet` / `cacheGet` / `cacheInvalidate`). Screens write fresh data to the cache and read stale data from it when offline, so the UI is never blank. |

### OfflineBanner

`components/OfflineBanner.tsx` renders a fixed amber bar ("You're offline — we'll sync when you're back") that slides down from the top of the screen when `useNetworkState` reports offline, and slides back up automatically when connectivity is restored.

---

## Loading States & Animation

All loading states across the app use a custom `ScissorsLoader` component (`apps/mobile/components/ScissorsLoader.tsx`) in place of the platform-default `ActivityIndicator`.

### ScissorsLoader

- Renders the VARS scissors logo mark as an animated SVG using `react-native-svg`
- Two blades rotate ±32° around the scissor joint pivot in a snip-and-return loop (close → open → repeat), driven by the React Native `Animated` API (`Animated.sequence` + `Animated.loop`). Rotation is applied via a nested `translate(pivot) → AnimatedG rotation → translate(-pivot)` pattern, which reliably produces the correct pivot on Android new architecture (React Native 0.76 / Fabric).
- The SVG viewBox is expanded to `-120 -90 800 820` (original content space: 555×718) so the blade tips and handles do not clip during the full ±32° swing.
- Props: `size: 'small' | 'medium' | 'large'` (23×24 / 39×39 / 61×63 px) and `color: 'light' | 'dark'` (#FFFFFF / #1A1A1A)
- Color rule: `light` on filled black button backgrounds; `dark` on white or surface backgrounds

### VendorPriceInput

`components/VendorPriceInput.tsx` is a reusable price input for vendor-facing screens that shows a live earnings preview as the vendor types.

- Renders a `₦` prefix + numeric `TextInput`, with a read-only preview line beneath it
- Preview is hidden when the field is empty or zero; updates on every keystroke
- Pioneer window: if `vendor.pioneer === true` and `vendor.pioneer_bookings_completed < 3`, preview shows 100% (`"You keep 100% — Pioneer booking · ₦X,XXX"`); otherwise shows 80% (`"You'll receive: ₦X,XXX"`)
- Pioneer data is passed as props — no per-keystroke fetch
- Used in: vendor onboarding step 2 (service price inputs)

---

### Launch Transition

The root layout (`app/_layout.tsx`) preloads both authentication state and the `vars_onboarding_done` flag from AsyncStorage in parallel before calling `SplashScreen.hideAsync()`. Once both are ready, a single deterministic redirect fires:

- **Not authenticated or onboarding incomplete** → `/onboarding`
- **Authenticated but phone OTP missing** → `/auth/phone`
- **Authenticated, onboarding done, vendor record exists** → `/(vendor-tabs)`
- **Authenticated, onboarding done, customer** → `/(tabs)`

Vendor detection is a lightweight `vendors` table query (`select id, eq user.id, maybeSingle`) that fires as an async IIFE inside the effect. `app/index.tsx` returns `null`; it never redirects itself. The guard ref `didInitRoute` ensures the redirect fires exactly once. There is no intermediate overlay or ScissorsLoader between the splash screen and the destination screen.

### Pull-to-Refresh

All `RefreshControl` instances suppress the native OS spinner (`tintColor="transparent"`, `colors={['transparent']}`) and instead render an inline ScissorsLoader at the top of the scroll content (or via `ListHeaderComponent` on FlatLists) while `refreshing` is true.

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
  • Creates booking record (sets auto_release_at = scheduled_end + 2hrs; DB trigger overrides to service_rendered_at + 2hrs when vendor marks service complete)
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
         • 2 hours after vendor marks service_rendered (DB trigger sets auto_release_at = service_rendered_at + 2 hrs)
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

The slot grid uses a monochrome shell — border weight signals "has a state", a tiny glyph at the bottom-right specifies which state. No coloured fills anywhere.

| DB state | UI label | Visual |
|---|---|---|
| *(no record)* | Available | 1px faint grey border, transparent fill, no glyph |
| `unavailable` | Blocked | 1.5px black border, transparent fill, ✕ glyph in red |
| `auto_accept` | Auto-accept | 1.5px black border, transparent fill, ⚡ glyph in amber |
| `transport_buffer` | Buffer | 1px black border, 4% black tint fill, 🚗 glyph — read-only |
| *(booking overlay)* | Booked | 1.5px black border, client name + service label, 6px blue dot bottom-right |

Tapping a slot cycles through the three user-controlled states: Available → Blocked → Auto-accept → Available. Transport buffer slots cannot be toggled.

---

## Vendor KYC & Approval

Vendors complete identity verification via the **Youverify SDK** during onboarding.

- **Clean pass** — `vendor-kyc-webhook` sets `kyc_status = verified` AND `is_active = true` in a single update. The vendor goes live **instantly**, no admin action required.
- **Rejection / flagged** — `kyc_status = rejected`, `kyc_rejection_reason` set from the Youverify payload. The case surfaces in the admin Vendors panel (which defaults to the rejected queue). Admin can:
  - **Override & approve** — manually set `kyc_status = verified, is_active = true`
  - **Reset KYC** — send vendor back to pending for re-submission

### Trust Layer — Identity Image Locking

On a clean KYC pass the webhook also:
1. Extracts the liveness face image URL from the Youverify payload
2. Fetches the image and uploads the original to `vendor-identity-images/{vendor_id}/raw.jpg`
3. Crops a passport-style square (centre, top 65% of frame → 400×400 JPEG) and uploads it to `vendor-identity-images/{vendor_id}/profile.jpg`
4. Sets `profile_image_url` (cropped), `profile_image_raw_url` (raw audit copy), and `profile_image_locked = true` on the vendor row

`profile_image_url` is the **single source of truth** for a vendor's photo across all surfaces — discovery feed, vendor public profile, vendor profile screen, and admin panel. Vendors cannot change it. RLS (`vendors_update_own` WITH CHECK) blocks any client-side write to the three identity image columns; only the service role (used by the webhook) can set them.

The admin vendors panel shows both images: the cropped profile circle and the raw liveness capture (labelled "Audit") for verification review. If image extraction fails for any reason, the webhook logs a warning and completes the KYC pass normally — admin can set the image manually.

**Vendor recovery flow** — when a vendor's KYC is rejected:
1. Push notification sent with the rejection reason; deep-link opens `step-4-kyc`
2. On re-login, `vendor-login` routes `kyc_status = rejected` directly to `step-4-kyc` (not vendor-tabs)
3. `step-4-kyc` loads on mount: reads `kyc_rejection_reason` from DB and shows it inline; pre-loads previously verified bank details so the vendor doesn't re-enter them
4. Vendor taps "Try identity check again" → `vendor-kyc-init` clears the reason and starts a fresh Youverify session
5. On success: navigates to `step-5-pending`, which polls every 8 s and navigates to `/(vendor-tabs)` on approval or back to `step-4-kyc` on a second rejection

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
- `auto_release_at` is set by a DB trigger to `service_rendered_at + 2 hrs` when the vendor marks the booking `service_rendered`
- Standard 80/20 settlement — functionally identical to a user confirmation
- User and vendor notified

**Dependency:** auto-release only fires once the vendor has marked the booking as `service_rendered`. If the vendor never taps "Service rendered," `auto_release_at` is irrelevant and the funds remain in escrow. To avoid this, 15 minutes after the scheduled service end time the same cron sends a one-time push notification to the vendor reminding them to mark the job complete. The vendor's jobs screen also shows a persistent in-app banner for any `arrived` booking past its scheduled end time.

---

## Copy Voice & Tone

All user-facing copy — notifications, status labels, in-app hints, error states — follows one principle: **lead with forward momentum, not with failure or judgment**.

### The Rule

Never frame a state as a deficit. Frame it as what happens next, what the user can do, or what is already true.

| Instead of | Write |
|---|---|
| `"Unverified"` (badge) | `"Uploaded"` |
| `"Awaiting approval"` (badge) | `"Sent to client"` |
| `"Not set up"` | `"No zone set"` |
| `"Disabled"` | `"Off"` |
| `"Paused — outside zone"` | `"Outside your zone"` |
| `"Identity check didn't go through"` | `"Let's try that again"` |
| `"Make sure your ID is..."` | `"For best results: ID well-lit..."` |
| `"Something went wrong"` (button) | `"Report an issue"` |
| `"Your vendor did not respond in time"` | `"This booking expired"` |
| `"couldn't confirm this time"` | `"isn't available for this slot"` |
| `"didn't approve this photo"` | `"preferred not to include this photo"` |
| `"didn't respond within 72 hours"` | `"72-hour window closed"` |
| `"didn't accept your suggested time"` | `"went with a different time"` |
| `"wasn't confirmed in time"` | `"expired before it was confirmed"` |
| `"Awaiting vendor"` | `"Confirming..."` |
| `"if something went wrong"` | `"if you need to raise a dispute"` |
| `"deleted permanently"` | `"removed from their profile entirely"` |

### Patterns to avoid

**Passive blame** — `"wasn't confirmed"`, `"didn't respond"`, `"couldn't verify"` places failure on the subject. Describe the state neutrally (`"expired"`, `"window closed"`) or flip to forward framing (`"needs one more try"`).

**Imperative criticism** — `"Make sure you..."` in an error state reads as accusation. Use `"For best results:"` instead.

**Deficit labels** — Badges and status chips that brand something as insufficient (`"Unverified"`, `"Disabled"`, `"Awaiting"`) should describe the current state neutrally or point toward the next positive state.

**Consequence-led copy** — `"If you decline, the photo is deleted permanently"` leads with loss. Lead with the action: `"Declining removes this photo from their profile entirely."`

### Where copy lives

| Copy type | File |
|---|---|
| Push & in-app notifications | `supabase/functions/_shared/notifications.ts` |
| Lead outreach messages | `supabase/functions/_shared/lead-copy.ts` |
| In-app status labels & hints | Inline in each screen component |

Re-read this section before adding or editing anything in `notifications.ts` or any user-facing string.

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

### Build Android APK locally

A local build compiles the full native Android project and installs it directly to a connected device. It runs the production-equivalent Hermes JS bundle — use this instead of Expo Go when testing native modules or the final build output.

**Windows prerequisites**

| Variable | Value |
|---|---|
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\Sdk` |

Android Studio ships a bundled JDK at the `jbr` path — use that, not a separately installed JDK. Set both in your system environment variables, or inline in the terminal session:

```powershell
$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo run:android --no-build-cache
```

- Run from the **repo root** (not `apps/mobile/`). Expo reads root `.env.local` from CWD at bundle time.
- `android/` is auto-generated on first run and is gitignored — do not commit it.
- First build after a fresh clone takes 15–35 min (full Gradle compile). Subsequent builds use the Gradle cache.
- `--no-build-cache` forces a full recompile; omit it once the cache is warm.
- If Metro port 8081 is already in use, add `--port 8082`.

**Cloud build (no local toolchain needed)**

```bash
eas build --platform android --profile preview   # produces a shareable .apk via EAS
```

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

### Mobile

`apps/mobile/.env` is read by Expo Go and the development server when running from within the `apps/mobile/` workspace. When running `expo run:android` from the **repo root** (the standard local build path), Expo reads `.env.local` from the current working directory instead. All `EXPO_PUBLIC_*` variables must be present in the **root `.env.local`** for local Android builds to pick them up at bundle time.

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_VENDOR_TEST_MODE=     # set to 'true' in dev to show the vendor/customer split-screen entry
EXPO_PUBLIC_DEV_VENDOR_EMAIL=     # test vendor email when VENDOR_TEST_MODE=true
EXPO_PUBLIC_DEV_VENDOR_PASSWORD=  # test vendor password when VENDOR_TEST_MODE=true
```

### Edge Functions (Supabase Secrets)

```
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_URL=
PAYSTACK_SECRET_KEY=
YOUVERIFY_API_KEY=
YOUVERIFY_BASE_URL=        # defaults to https://api.youverify.co if unset
YOUVERIFY_WEBHOOK_SECRET=  # HMAC secret for Youverify webhook signature verification
CRON_SECRET=               # shared secret validated by all cron-triggered edge functions
RESEND_API_KEY=            # email delivery (outreach + marketing)
TERMII_API_KEY=            # WhatsApp + SMS delivery
TERMII_SENDER_ID=
TERMII_BASE_URL=           # https://v3.api.termii.com
DELIVER_OUTREACH_SECRET=   # required — deliver-outreach throws on startup if absent
UNSUBSCRIBE_SECRET=        # HMAC key for email unsubscribe tokens
DELIVERY_LIVE=             # set to 'true' to activate real delivery (default: stub mode)
LAUNCH_MONTH=              # month name used in all outreach copy (default: 'August')
```

### Admin (`apps/admin/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # used only for auth sign-in on the login page
SUPABASE_SERVICE_ROLE_KEY=       # server-side only — never exposed to the browser
```

To create an admin account: insert a row into `auth.users` via Supabase Auth (email + password), then insert the same UUID into `public.admin_users`. The first login sets the session cookie used by middleware.

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
