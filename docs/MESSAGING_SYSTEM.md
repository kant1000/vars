# VARS Messaging System — Full Reference

> Written for external audit. Covers every channel, trigger, and message that
> VARS sends — pre-app vendor onboarding, in-app booking lifecycle, and ad-hoc
> bulk marketing. All code references are relative to the repo root.

---

## Overview

VARS runs **three independent messaging pipelines**. They share providers and
copy utilities but are otherwise separate — different tables, different triggers,
different operational controls.

| Pipeline | Purpose | Audience | Channels |
|----------|---------|----------|----------|
| **A — Lead Onboarding** | Move vendor leads from sign-up to KYC completion | Vendor leads (pre-app) | WhatsApp, SMS, Email |
| **B — Booking Lifecycle** | Transactional messages around every booking event | App users + verified vendors | Push, In-app, SMS, Email |
| **C — Bulk Marketing** | Ad-hoc campaign emails to lead segments | Vendor leads (pre-app) | Email only |

Providers:
- **Termii** — WhatsApp and SMS (outreach + phone reveal)
- **Resend** — Email (outreach + transactional + bulk marketing)
- **Expo Push API** — Mobile push notifications (in-app only)

Feature flag: `DELIVERY_LIVE` (Supabase secret). When `false`, all three
pipelines run in stub mode — execution is logged, nothing is delivered. This
single flag controls all three pipelines simultaneously.

---

## Pipeline A — Vendor Lead Onboarding

### What it does

Vendor leads sign up on the landing page before the app opens to customers.
Pipeline A keeps them warm and nudges them to complete KYC (profile
activation). Once a lead completes KYC, they are no longer in this pipeline —
they become a verified vendor in the main app.

### Data model

**`vendor_leads`** — one row per person who submitted the landing page form.

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `full_name`, `email`, `phone` | text | Collected at sign-up |
| `service_type` | text | `hair_styling \| barbing \| makeovers \| other` |
| `pioneer` | boolean | First 50 leads get Pioneer status (0% commission on first 3 bookings) |
| `waitlist` | boolean | Leads 51+ |
| `lead_state` | text | State machine: `PROSPECT → COLD → VERIFIED` |
| `last_outreach` | timestamptz | Stamped after every phone-channel delivery. Drives cadence timing. |
| `converted` | boolean | True when the lead has completed KYC and become a vendor |
| `converted_vendor_id` | uuid | FK to `vendors` row when converted |
| `email_unsubscribed` | boolean | Set true via unsubscribe link. Excludes from all marketing sends. |

**`vendor_lead_outreach`** — message queue. One row per message, regardless of
channel.

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `lead_id` | uuid | FK to vendor_leads |
| `channel` | text | `whatsapp \| sms \| email` |
| `message_type` | text | `introduction \| welcome_email \| reengagement \| reengagement_email \| go_live \| blocked` |
| `state_from` | text | Lead state when the record was created |
| `message_template` | text | Template identifier or email subject line |
| `message_body` | text | Full rendered message body, computed at creation time |
| `status` | text | `draft → approved → sent` (or `failed \| blocked`) |
| `approved_by` | uuid | Admin user who approved (null for auto-approved records) |
| `approved_at` | timestamptz | |
| `sent_at` | timestamptz | |
| `provider_message_id` | text | Termii or Resend message ID after delivery |
| `provider_error` | text | Error string if delivery failed |

Status flow:
```
draft → approved → sent
              ↓
           failed  (provider error, retryable by re-approving)
blocked            (set manually by admin to suppress a message)
```

### Lead state machine

```
Sign-up
  ↓
PROSPECT  ← initial state on registration
  |
  ├─ KYC completed → VERIFIED (tick promotes, intro messages replaced with go_live)
  |
  └─ last_outreach set, 7 days pass → COLD
       |
       ├─ KYC completed → VERIFIED
       |
       └─ stays COLD (reengagement messages sent every 7 days, capped at 3)
```

State transitions happen inside `vendor_lead_tick()` on every hourly run.
`CONVERTED` is a fourth state set manually by the admin when a lead is marked
as a paying customer (distinct from `converted_vendor_id` which is set
automatically on KYC completion).

### The tick function — `vendor_lead_tick()`

Database function (PostgreSQL), called hourly by pg_cron via the
`deliver-outreach` cron registration.

Runs five steps in order on each call. Processes up to 50 leads per step per
call (LIMIT 50 on each CTE). Multiple calls accumulate coverage.

**Step 1 — Promote to VERIFIED**
Any lead whose `converted_vendor_id` now has `kyc_status = 'verified'` is
moved to `VERIFIED`. (Checks the `vendors` table.)

**Step 2 — Go-live messages (VERIFIED, highest priority)**
For leads in `VERIFIED` state:
- Deletes any outstanding draft/approved WhatsApp intro or reengagement records
  (superseded by the go-live message).
- Creates one WhatsApp `go_live` record and one email `go_live` record if not
  already sent (cap: 3 go-live sends total per lead).

**Step 3 — Promote PROSPECT → COLD**
Any lead who has `last_outreach IS NOT NULL` and `last_outreach < NOW() - 7
days` and is still in `PROSPECT` state moves to `COLD`.

**Step 4 — Reengagement (COLD leads who have been contacted before)**
For COLD leads where `last_outreach < NOW() - 7 days`:
- Deletes any pending WhatsApp intro records (superseded).
- Creates one WhatsApp `reengagement` record and one email `reengagement_email`
  record if not already queued or sent (cap: 3 each per lead).

**Step 5 — Introduction (never contacted, 24h after sign-up)**
For leads in `PROSPECT` or `COLD` with `last_outreach IS NULL` and
`created_at < NOW() - 24 hours`:
- Creates one WhatsApp `introduction` record and one email `welcome_email`
  record (cap: 1 ever for welcome_email, 3 for introduction).

**Email vs WhatsApp independence**
The email and WhatsApp channels are checked independently. A pending WhatsApp
record never blocks an email record from being created, and vice versa. The
`last_outreach` timestamp is only stamped by phone-channel (WhatsApp/SMS)
deliveries — email delivery does not affect the WhatsApp cadence clock.

Source: `supabase/migrations/20260525120000_vendor_lead_tick_august_copy_email_channel.sql`

### Registration flow — `vendor-register-lead`

Edge function (`supabase/functions/vendor-register-lead/index.ts`), called by
the landing page form.

On POST:
1. Calls `register_vendor_lead()` DB function (advisory lock prevents pioneer
   slot race conditions). Atomically inserts the lead and determines pioneer
   status.
2. If the lead already existed: returns `already_registered: true` — no new
   records created.
3. For new leads: immediately inserts one `welcome_email` outreach record with
   `status = approved` (auto-approved so it delivers as soon as `deliver-outreach`
   runs, without needing admin review).
4. Fire-and-forgets `upsertResendContact()` to add the lead to the Resend
   audience with their `service_type`, `pioneer`, and `lead_state` properties.

The tick's introduction step (Step 5) also creates a WhatsApp intro record, but
that runs 24 hours after sign-up to give the email a head start.

### Delivery — `deliver-outreach`

Edge function (`supabase/functions/deliver-outreach/index.ts`).

Called by pg_cron (registered via the `register_deliver_outreach_cron`
migration). Also callable manually from the admin outreach panel.

On each call:
1. Queries `vendor_lead_outreach` for `status = approved`, ordered by
   `approved_at ASC`, limit 50.
2. For each record:
   - `whatsapp` → Termii `/api/sms/send` with `channel: whatsapp`
   - `sms` → Termii `/api/sms/send` with `channel: generic`
   - `email` → Resend `/emails` (single send). Renders branded HTML from
     `EMAIL_TEMPLATE` + `fillTemplate()` for known message types
     (`welcome_email`, `reengagement_email`, `go_live`). Falls back to
     plain-text for unknown types.
3. On success: sets `status = sent`, stamps `sent_at`, stores
   `provider_message_id`.
4. On failure: sets `status = failed`, stores `provider_error`.
5. After phone-channel delivery: stamps `vendor_leads.last_outreach = now()`.
   Email delivery does NOT stamp last_outreach.

Optional request body:
- `{ lead_id }` — deliver only approved records for one lead
- `{ record_id }` — deliver one specific record

Auth: `Authorization: Bearer <DELIVER_OUTREACH_SECRET>` (Supabase secret).
If the secret is unset, any caller can invoke it (development only).

### Admin outreach panel — `/leads/outreach`

Admins see a table of all outreach records with filters by status, channel, and
message type. Actions:
- **Approve** — moves `draft → approved` (single or bulk)
- **Block** — moves any status → `blocked`
- **Send Now** — calls `deliver-outreach` directly for that lead's approved records
- **Compose** — manually author a message for a specific lead (creates an
  `approved` record immediately)

The tick creates records as `draft`. All draft records require admin approval
before they are picked up by `deliver-outreach`, except the Day 0 `welcome_email`
which is auto-approved on registration.

### Message copy

All vendor-facing copy lives in
`supabase/functions/_shared/lead-copy.ts`. Framing is currently "August launch":
leads are told customers start booking in August and they should set up their
profile to be ready from day one.

Message types and their copy functions:

| Type | Channel | Function | When |
|------|---------|----------|------|
| `welcome_email` | Email | `welcomeEmail()` + `welcomeEmailHtmlParts()` | Day 0 on registration |
| `introduction` | WhatsApp | `whatsappIntro()` | 24h after sign-up |
| `reengagement_email` | Email | `reengagementEmail()` + `reengagementEmailHtmlParts()` | 7 days after last outreach |
| `reengagement` | WhatsApp | `whatsappReengagement()` | 7 days after last outreach |
| `go_live` | WhatsApp + Email | `whatsappGoLive()` + `goLiveEmailHtmlParts()` | On KYC verification |

Pioneer leads receive different copy emphasising their 0% commission on first 3
bookings. Non-pioneer leads receive earnings-focused copy (80% of every
booking).

### Email HTML template

`supabase/functions/_shared/email-template.ts` — branded HTML with inline CSS,
suitable for all email clients.

Placeholders filled by `fillTemplate()`:
- `{{heading}}`, `{{first_name}}`, `{{body_paragraph_1}}`, `{{body_paragraph_2}}`
- `{{cta_label}}`, `{{cta_url}}`
- `{{unsubscribe_url}}`

Conditional blocks removed at render time if content is absent:
- `<!--P2_START-->…<!--P2_END-->` — removed when `body_paragraph_2` is empty
- `<!--CTA_START-->…<!--CTA_END-->` — removed when CTA fields are empty

From address for outreach emails: `VARS <hello@bookwithvars.com>`

---

## Pipeline B — Booking Lifecycle (In-App / Transactional)

### What it does

Every booking event — from payment authorisation to service completion — sends
a notification to the relevant party. These messages are never batched or
queued; they fire immediately as part of the edge function handling the event.

### Delivery mechanism

`supabase/functions/_shared/notifications.ts` exports `sendNotification()`.

Every call does two things atomically:
1. **Inserts a row into `notifications`** — the in-app inbox. Always happens,
   regardless of push token availability.
2. **Sends an Expo push notification** — only if `push_token` is present on the
   recipient's profile or vendor row. Push failures are caught and logged; they
   never surface to the caller or affect business logic.

The `notifications` table schema:
```
recipient_id, recipient_type ('user'|'vendor'), type, title, body,
data (jsonb), booking_id, is_read (default false), created_at
```

Deep links are auto-injected into push payloads:
- User notifications with a `booking_id` → `screen: /booking/detail/:id`
- Vendor notifications with a `booking_id` → `screen: /vendor-tabs`

### Booking event triggers

Each event below fires from the edge function named:

| Event | Function | Who gets notified | Channels |
|-------|----------|-------------------|----------|
| Customer pays (Paystack auth) | `paystack-initialize` + `paystack-webhook` | Customer | Push + In-app |
| Vendor accepts booking | `paystack-capture` | Customer | Push + In-app + Email |
| Vendor declines | `paystack-cancel` | Customer | Push + In-app |
| Booking auto-accepted (vendor has auto-accept on) | `paystack-capture` | Customer + Vendor | Push + In-app |
| Vendor cancels (>1 hr before) | `vendor-cancel-booking` | Customer | Push + In-app |
| Vendor cancels (grace window) | `vendor-cancel-grace` | Customer | Push + In-app |
| KYC verified | `vendor-kyc-webhook` | Vendor | Push + In-app |
| KYC failed | `vendor-kyc-webhook` | Vendor | Push + In-app |
| Service rendered by vendor | `vendor-update-job-status` | Customer | Push + In-app |
| Service confirmed by customer | `paystack-release` | Vendor | Push + In-app + Email |
| Auto-release warning (payment) | `paystack-settle` | Customer | Push + In-app |
| Payment released | `paystack-settle` | Customer + Vendor | Push + In-app + Email |
| Dispute raised | `dispute-raise` | Customer + Vendor | Push + In-app |
| Dispute resolved | Admin action | Customer or Vendor | Push + In-app |
| Review submitted | `submit-review` | Vendor | Push + In-app |
| Photo consent request | `photo-consent-request` | Customer | Push + In-app |
| Photo consent approved | `photo-consent-respond` | Vendor | Push + In-app |
| Photo consent declined | `photo-consent-respond` | Vendor | Push + In-app |
| Photo consent expired | `photo-consent-expire` | Vendor | Push + In-app |
| Reschedule suggested | `vendor-suggest-reschedule` | Customer | Push + In-app |
| Reschedule accepted | `customer-accept-reschedule` | Vendor | Push + In-app |
| Reschedule declined | `customer-decline-reschedule` | Vendor | Push + In-app |
| Reschedule expired | `reschedule-expire` | Vendor | Push + In-app |

### Scheduled booking reminders — `send-reminders`

Edge function, runs every 10 minutes via pg_cron.

Sends reminders at three time windows:
1. **24 hours before** — customer ("Tomorrow at [time], [vendor] is coming to
   you") + vendor ("Tomorrow at [time] — [service] for [client]")
2. **1 hour before** — customer ("coming in an hour") + vendor ("Head out in
   about 45 minutes")
3. **30 minutes after booking created** (if still PENDING) — vendor only
   ("30 minutes left to confirm [client]'s booking")

Idempotency: checks `notifications` table for existing rows with matching
`booking_id` + `type` before sending. Safe to run frequently.

Auth: `x-vars-cron-secret` header must match `CRON_SECRET` Supabase secret.

### Phone reveal — `phone-reveal`

Edge function, runs every 5 minutes via pg_cron.

Finds accepted bookings where `scheduled_at` is within 15 minutes from now and
`phone_revealed = false`. For each:
1. Sets `phone_revealed = true` on the booking.
2. Push + in-app to customer: vendor is on their way.
3. Push + in-app to vendor: customer's number is now visible.
4. **SMS** to both parties via Termii (plain `dnd` channel) with the actual
   phone numbers. This is the only moment phone numbers are transmitted
   out-of-band. SMS fires independently of push — if the app is closed, the SMS
   is still the fallback.

The phone number is never included in push payload or in-app messages — only in
the SMS.

Auth: `x-vars-cron-secret` header.

### Transactional email

`notifications.ts` also exports `sendTransactionalEmail()`, which calls
`POST https://api.resend.com/emails` (single send, plain text only).

From address: `VARS <no-reply@bookwithvars.com>` (distinct from outreach
`hello@bookwithvars.com`).

Sent for two events only:
- **Booking confirmed** — email to customer + vendor (`paystack-capture`)
- **Payment released / service complete** — email to customer + vendor
  (`paystack-settle` / `paystack-release`)

These are plain-text emails. No HTML template used. No unsubscribe link. Not
sent to the Resend audience — they go directly to `resend.com/emails`.

### In-app inbox — `notifications` table

Every `sendNotification()` call writes to this table. The mobile app reads from
it to populate the notification bell. Row stays in the table permanently. The
app marks rows `is_read = true` when the user taps them.

The table has no retention or archival policy currently.

---

## Pipeline C — Bulk Marketing Email

### What it does

Ad-hoc HTML campaigns sent to segments of vendor leads. Separate from Pipeline
A outreach — these are not queued or approval-gated; an admin composes and
sends them directly from the admin panel.

### Audience and contact sync

All vendor leads are mirrored as contacts in a Resend audience
(`RESEND_AUDIENCE_ID`). Each contact carries:
- `first_name`, `last_name`
- `unsubscribed` — toggled to `true` when the lead clicks their unsubscribe link
- Custom `properties`: `service_type`, `pioneer`, `lead_state`

Contacts are upserted (create or update by email) in three places:
1. **On registration** — `vendor-register-lead` fire-and-forgets
   `upsertResendContact()` immediately after a new lead is saved.
2. **On marketing send** — `send-marketing-email` upserts every recipient in
   the send loop. This keeps properties current and acts as a rolling backfill.
3. **On unsubscribe** — `unsubscribe-lead` upserts with `unsubscribed: true`.

The Resend audience is for contact management and unsubscribe tracking only.
**Segmentation is always performed in Supabase, not in Resend.** Resend's
audience is not used for filtering sends.

### Sending — `send-marketing-email`

Edge function (`supabase/functions/send-marketing-email/index.ts`).

Called by the admin panel via `/api/marketing/send` (server-side Next.js route)
which forwards with the service role key. Never callable from the client.

Request body:
```json
{
  "segment": {
    "service_type": ["hair_styling", "barbing"],   // optional, [] = all
    "pioneer": true,                                // optional, omit = all
    "lead_state": ["COLD"],                         // optional, [] = all
    "converted": false                              // optional, omit = all
  },
  "content": {
    "subject": "string",    // required
    "heading": "string",    // required
    "body1":   "string",    // required
    "body2":   "string",    // optional — second paragraph
    "cta_label": "string",  // optional — omit to hide button
    "cta_url":   "string"   // optional — omit to hide button
  }
}
```

What it does:
1. Queries `vendor_leads WHERE email_unsubscribed = false` + segment filters.
2. For each lead: generates HMAC-SHA256 unsubscribe token, renders HTML via
   `EMAIL_TEMPLATE` + `fillTemplate()`, builds plain-text fallback.
3. Sends via Resend Batch API (`POST /emails/batch`) in chunks of 100.
4. Returns `{ sent, failed, recipients }`.

From address: `VARS <hello@bookwithvars.com>` (same as outreach emails).
Every email includes a `List-Unsubscribe` header and a real unsubscribe URL in
the footer.

### Unsubscribe — `unsubscribe-lead`

Edge function (`supabase/functions/unsubscribe-lead/index.ts`). `verify_jwt: false`
(public link).

`GET /functions/v1/unsubscribe-lead?id=<lead_id>&t=<token>`

The token is HMAC-SHA256(`UNSUBSCRIBE_SECRET`, `lead_id`), base64url-encoded.
Generated in `send-marketing-email` per lead, verified here. One-click
unsubscribe — no confirmation page, no re-entry required.

On valid token:
1. Sets `vendor_leads.email_unsubscribed = true`.
2. Fire-and-forgets `upsertResendContact()` with `unsubscribed: true`.
3. Returns a branded HTML confirmation page.

On invalid token: returns 400 HTML, no DB write.

`email_unsubscribed = true` is checked by both the send function and the
recipients count API. Unsubscribed leads are permanently excluded from all
future marketing sends. There is currently no re-subscribe mechanism.

### Admin marketing panel — `/leads/marketing`

Server page at `apps/admin/src/app/leads/marketing/`. Requires admin session.

Features:
- **Segment panel** — service type chips (multi-select, empty = all), pioneer
  radio (All / Pioneers only / Non-pioneers only), lead state chips (empty =
  all), converted radio (Exclude / Include / Only)
- **Live recipient count** — calls `/api/marketing/recipients` on every segment
  change. Uses identical filter logic to the actual send, so the count is exact.
- **Email content fields** — Subject*, Heading*, Body 1*, Body 2 (optional),
  CTA label + URL (optional)
- **Two-step confirmation** — "Confirm send" reveals a red "Send now" button +
  cancel. Prevents accidental bulk sends.

---

## Operational Controls

### DELIVERY_LIVE

Supabase secret. `'true'` = live. Anything else = stub mode.

In stub mode, all three pipelines still execute fully (DB queries, record
updates, rendering) but the final provider call is replaced with a `console.log`.
This makes stub mode safe to run in production without any message leakage.

When flipping to live:
- Termii credentials must be set: `TERMII_API_KEY`, `TERMII_SENDER_ID`,
  `TERMII_BASE_URL`
- Resend key must be set: `RESEND_API_KEY` (already set)
- Test one lead end-to-end before approving bulk records

### Full secrets inventory

| Secret | Used by | Notes |
|--------|---------|-------|
| `RESEND_API_KEY` | deliver-outreach, send-marketing-email, notifications.ts | Single key for all Resend calls |
| `RESEND_AUDIENCE_ID` | resend-contacts.ts | Audience ID: `9faf34c7-fd2f-4da3-a7b5-bd5be545581b` |
| `TERMII_API_KEY` | deliver-outreach, notifications.ts | WhatsApp + SMS |
| `TERMII_SENDER_ID` | deliver-outreach, notifications.ts | Sender name shown to recipients |
| `TERMII_BASE_URL` | deliver-outreach, notifications.ts | `https://v3.api.termii.com` |
| `UNSUBSCRIBE_SECRET` | send-marketing-email, unsubscribe-lead | HMAC key for unsubscribe tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | All admin edge functions | Auto-injected by Supabase |
| `DELIVER_OUTREACH_SECRET` | deliver-outreach | Shared secret for cron + admin calls |
| `CRON_SECRET` | send-reminders, phone-reveal | Prevents public invocation |
| `PAYSTACK_SECRET_KEY` | paystack-* functions | Payment |
| `YOUVERIFY_API_KEY` | vendor-kyc-init, vendor-kyc-webhook | Identity verification |
| `DELIVERY_LIVE` | deliver-outreach, send-marketing-email | Master live/stub switch |

### Cron schedule

| Function | Frequency | Purpose |
|----------|-----------|---------|
| `vendor_lead_tick()` (via deliver-outreach) | Hourly | State transitions + queue new outreach records |
| `deliver-outreach` | Hourly (after tick) | Deliver approved outreach records |
| `send-reminders` | Every 10 min | 24h, 1h, 30min booking reminders |
| `phone-reveal` | Every 5 min | Reveal phone numbers 15 min before appointment |
| `check_cron_health()` | Every 2 hours | Alert on failing cron jobs |
| `reschedule-expire` | Unknown | Expire unresolved reschedule offers |
| `paystack-settle` | Cron/webhook | Auto-release escrowed funds |

### Logging

All edge functions log to Supabase function logs. Format:
`[function-name] outcome — metric: N, live: true/false`

Cron health is monitored via the `system_alerts` table — the admin dashboard
reads this and surfaces any job that has failed on its most recent run.

---

## Copy Management

All user-facing copy is centralised in two files:

**`supabase/functions/_shared/lead-copy.ts`**
- All pre-app vendor lead messages (WhatsApp, outreach email)
- Notification helper functions: `formatDate()`, `formatTime()`, `formatNaira()`
- Transactional email copy for booking events

**`supabase/functions/_shared/notifications.ts`**
- All in-app notification titles and bodies (`msg_*` functions)
- `sendTransactionalEmail()` and `sendTransactionalSms()` implementations

To change any message, edit only these two files. No logic changes required.
Redeploy the affected edge functions after editing.

Voice principle applied across all copy: forward momentum, not failure. Lead
with what's happening next, not what went wrong.

---

## What is NOT in this system

- **No in-app chat** — customers and vendors do not message each other through
  VARS. The only contact is the phone number reveal at 15 minutes.
- **No SMS for vendor onboarding** — the SMS channel (`channel: sms`) exists in
  the schema and the `deliver-outreach` function, but the tick function does not
  currently generate SMS records. Only WhatsApp and email are generated.
- **No email for booking reminders** — reminder notifications (24h, 1h, 30min)
  are push + in-app only. No email reminder is sent.
- **No transactional email HTML** — booking confirmation and payment emails are
  plain text. Only outreach and marketing emails use the HTML template.
- **No re-subscribe** — once `email_unsubscribed = true`, there is no path to
  revert it from the user side.
- **No Resend Broadcasts** — the bulk marketing system uses the Batch API (one
  call per send), not Resend's Broadcasts product. This is intentional:
  segmentation lives in Supabase, and the admin controls timing manually.
