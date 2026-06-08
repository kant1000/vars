# VARS Daily Codebase Audit

**Pre-flight:** run the build/lint checks in `docs/ACCESS_AND_AUDIT.md` → Baseline Audit Order before starting.
NOTE: build or lint failures caused by absent node_modules in a remote execution container are environment limitations, not codebase regressions. Run locally or in a provisioned CI environment to verify.

**Pre-flight: Live Infrastructure** — run these SQL queries in Supabase SQL Editor before Section 3:

```sql
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

SELECT jobname, command
FROM cron.job
WHERE command NOT LIKE '%ojxlfbmetoyggetdfwro%'
  AND command LIKE '%net.http_post%';
```

FAIL if the second query returns any rows — a wrong project ID means the cron job silently calls the wrong project's edge function.

Run every check in order. For each: **PASS**, **WARN**, or **FAIL** with one-line reason.
Final output: severity-grouped summary, then **ITEMS REQUIRING FOUNDER DECISION**.

---

## 1. Schema Integrity

**Source:** `supabase/migrations/*.sql` — read all files.

- Migration sequence: numbered series 000–018 all present (009 absent by design confirmed); timestamp-based series from May 2026 onward covers leads, outreach, KYC, blog, and surcharge migrations — flag any unexpected gap in either series
- Tables exist: `profiles`, `vendors`, `services`, `vendor_services`, `bookings`, `vendor_calendar`, `reviews`, `disputes`, `payout_history`, `vendor_leads`, `portfolio_photos`, `vendor_lead_outreach`, `system_alerts`, `blog_comments`, `notifications`
- `booking_status_enum` contains: `pending`, `accepted`, `expired`, `cancelled`, `on_way`, `arrived`, `service_rendered`, `completed`, `disputed`, `rescheduled_pending`
- `block_state_enum` contains: `unavailable`, `auto_accept`, `transport_buffer` — `available` must **not** be present (removed in 017)
- `disputes.reason` column exists — not `disputes.statement` (renamed in 012)
- `disputes.category` column exists (`dispute_category` enum — added in 013)
- `bookings.suggested_scheduled_at` exists (014)
- `bookings.reschedule_expires_at` exists (015)
- `bookings.access_building`, `access_floor`, `access_flat`, `access_code`, `user_location_lat`, `user_location_lng` exist (011)
- `bookings.transport_fee_kobo INTEGER NOT NULL DEFAULT 0`, `distance_km NUMERIC(6,2) NOT NULL DEFAULT 0`, `pre_transport_buffer_slots INTEGER NOT NULL DEFAULT 0` exist (20260531000002)
- `bookings_user_update` and `bookings_vendor_update` RLS policies have `WITH CHECK` correlated-subquery guards preventing JWT clients from writing `transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots` — FAIL if either policy is absent or the `WITH CHECK` clause is missing
- `portfolio_photos` has a `consent_state` enum column
- `vendor_leads` has: `pioneer` boolean (003/004); `lead_state` enum (PROSPECT/COLD/VERIFIED/CONVERTED), `last_state_change TIMESTAMPTZ NOT NULL`, `last_outreach`, `converted` columns (020); `UNIQUE(email)` constraint (021); `email_unsubscribed` boolean column
- `vendor_lead_outreach` table exists with `channel`, `status` (draft/approved/sent/failed/blocked), `message_type`, `message_body` columns (020)
- `vendors.kyc_rejection_reason TEXT` column exists (019) — populated on rejection, cleared on each new attempt
- `vendors.profile_image_url TEXT`, `profile_image_raw_url TEXT`, `profile_image_locked BOOLEAN NOT NULL DEFAULT false` exist (20260531000001)
- `vendors_update_own` RLS policy has `WITH CHECK` correlated-subquery guards on `profile_image_url`, `profile_image_raw_url`, `profile_image_locked` — FAIL if absent
- `vendor-identity-images` storage bucket exists and is public (required for mobile `<Image>` auth-free URLs)
- `vendors.auto_accept_zone_radius_km` is `NUMERIC(4,1)` constrained to (1, 1.5) — FAIL if column is still INT or constraint allows other values (20260526000001)
- `system_alerts` table exists (010)
- `blog_comments` table exists (022/023) — columns: `article_slug`, `name`, `email`, `body`, `approved BOOLEAN DEFAULT TRUE`, `created_at`; RLS enabled; SELECT policy returns `approved = true` only; anon INSERT policy `WITH CHECK (approved = true)`
- `notifications` table has a partial unique index `notifications_reminder_idempotency` on `(booking_id, type) WHERE type IN ('reminder_24h', 'reminder_1h', 'vendor_reminder_30min')` — prevents duplicate reminder sends under concurrent cron runs (024)
- `register_vendor_lead()` Postgres function exists (021) — uses advisory lock for atomic pioneer count + insert
- Booking status trigger blocking invalid JWT client transitions exists (016)
- Migration targeting `rescheduled_pending` adds it to `booking_status_enum` — confirm it targets `booking_status_enum` (not `booking_status`, which was the bug 014 introduced)

---

## 2. Edge Function Coverage

**Source:** `ls supabase/functions/` vs `README.md` edge functions table.

All 30 must exist on disk:

```
paystack-initialize        paystack-webhook           paystack-capture
paystack-release           paystack-settle            paystack-cancel
paystack-verify-bank       vendor-cancel-booking      vendor-cancel-grace
dispute-raise              vendor-kyc-init            vendor-kyc-webhook
vendor-register-lead       vendor-set-zone            vendor-confirm-zone
vendor-update-location     photo-consent-request      photo-consent-respond
photo-consent-expire       phone-reveal               send-reminders
vendor-suggest-reschedule  customer-accept-reschedule customer-decline-reschedule
reschedule-expire          deliver-outreach           vendor-update-job-status
submit-review              unsubscribe-lead           send-marketing-email
```

FAIL any function present in README but absent from disk, or on disk but missing from the README table.

---

## 3. Cron Job Coverage

**Source:** Live database — `SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;`

Cron jobs are registered directly in the database via `pg_cron` and must be verified by querying the live `cron.job` table — not from migration files or README alone.

Nine jobs must be present and active:

| Job | Schedule | Target |
|---|---|---|
| `booking-expire-every-5min` | `*/5 * * * *` | `paystack-release` |
| `paystack-settle-cron` | `*/5 * * * *` | `paystack-settle` |
| `phone-reveal` | `*/5 * * * *` | `phone-reveal` |
| `send-reminders` | `*/5 * * * *` | `send-reminders` |
| `photo-consent-expire-cron` | `0 * * * *` | `photo-consent-expire` |
| `reschedule-expire-hourly` | `0 * * * *` | `reschedule-expire` |
| `cron-health-check` | `0 */2 * * *` | `check_cron_health()` DB fn |
| `vendor-lead-tick` | `0 * * * *` | `vendor_lead_tick()` DB fn |
| `deliver-outreach-cron` | `*/10 * * * *` | `deliver-outreach` edge fn |

**URL integrity (critical):** every `net.http_post` command must reference project ID `ojxlfbmetoyggetdfwro` — FAIL if any command contains a different project ID. The call silently routes to the wrong project with no error.

NOTE: `cron-health-check` and `vendor-lead-tick` call their Postgres functions directly via `SELECT` — not via `net.http_post`. All other jobs use `net.http_post` with the `x-vars-cron-secret` header.

NOTE: a duplicate `reschedule-expire` job (no suffix) was confirmed present and removed from the live project. If it reappears, it will cause reschedule expiry to fire twice per hour.

---

## 4. Payment Logic

**Source:** `supabase/functions/paystack-settle/index.ts`, `supabase/functions/paystack-cancel/index.ts`, `supabase/functions/_shared/constants.ts`, `packages/shared/src/constants.ts`

**Transport surcharge:**

- `BASE_RADIUS_KM = 5` defined in both `_shared/constants.ts` (Deno) and `packages/shared/src/constants.ts` (mobile) — FAIL if values differ
- `TRANSPORT_FEE_TIERS` defined in both files with four tiers: 0–3 km over → ₦3,000; 3–6 km → ₦5,000; 6–10 km → ₦7,500; 10 km+ → ₦10,000 — FAIL if values differ between files or tier boundaries overlap
- `paystack-initialize` calculates surcharge server-side using Haversine; client value never trusted — FAIL if `transport_fee_kobo` is accepted from the request body
- Surcharge stored in Paystack metadata (`transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots` inside `vars_booking`) and read back by `paystack-webhook` on `charge.success` — FAIL if any of the three fields are absent from the metadata or missing from the booking insert
- `totalKobo = service_price_kobo + transport_fee_kobo` is the basis for all downstream money calculations — FAIL if any of `paystack-settle`, `paystack-cancel`, `vendor-cancel-booking`, `vendor-cancel-grace`, `customer-decline-reschedule`, `reschedule-expire`, or the `paystack-release` admin dispute path uses `service_price_kobo` alone

**paystack-settle:**

- Pioneer exception: `pioneer = true` AND `pioneer_bookings_completed < 3` → 100% of totalKobo to vendor, 0% commission; `pioneer_bookings_completed` increments on each settlement
- Standard split: 80% of totalKobo to vendor / 20% VARS
- Stamp duty: ₦50 on transfers ≥ ₦10,000
- Paystack fee: 1.5% + ₦100, capped at ₦2,000
- Settle cron queries only `service_rendered` — `disputed` bookings must be excluded (escrow stays frozen)
- Auto-release fires 2 hours after `service_rendered_at` — set by DB trigger in migration 001; customer receives a 30-minute warning notification before it fires
- **Known deferred issue — stamp duty threshold:** stamp duty should apply to the vendor transfer amount (80% of totalKobo), not the gross total. Services where vendor net < ₦10,000 may trigger ₦50 stamp duty incorrectly. WARN; not a launch blocker. Flag if seen.

**paystack-cancel — tiers evaluated against `totalKobo` in this priority order (first match wins):**

1. Within 1hr of service start → non-refundable: 70% vendor / 30% VARS
2. Within 15min of booking creation → 15% fee: 5% vendor / 10% VARS
3. All other cases → 50% fee: 20% vendor / 30% VARS

FAIL if the order differs — a cancel 10min after booking but 45min before service must hit tier 1, not tier 2.

---

## 5. Booking Status Machine

**Source:** `supabase/migrations/20240101000016_booking_status_trigger.sql`

Valid transitions only:
```
pending             → accepted | expired | rescheduled_pending | cancelled
rescheduled_pending → accepted | cancelled
accepted            → on_way | cancelled
on_way              → arrived | disputed
arrived             → service_rendered | disputed
service_rendered    → completed | disputed
```

FAIL if trigger permits `on_way → service_rendered` (skipping `arrived`).
FAIL if any multi-step skip is permitted from JWT clients.
Note: edge functions run as service role and bypass the trigger by design.

---

## 6. Auto-Accept System

**Source:** `supabase/functions/paystack-webhook/index.ts`, `supabase/functions/vendor-update-location/index.ts`, `supabase/functions/vendor-cancel-grace/index.ts`, `supabase/functions/_shared/calendar.ts`

- All 4 conditions required to fire: slot = `auto_accept` AND user within zone AND `auto_accept_paused_due_to_drift = false` AND `auto_accept_zone_confirmed_date = today`
- Drift threshold: `zone_radius + 3km` — FAIL if `+1km` or any flat constant is used instead of the relative formula
- Grace window: 5 minutes; controlled by `auto_accept_grace_expires_at`; `vendor-cancel-grace` must check this timestamp before waiving the penalty
- Transport buffers — two kinds, both use `transport_buffer_source_booking_id` FK and are deleted by the same cleanup on any cancellation:
  - Post-booking: two 30-min blocks after booking end; clamped to 22:00 UTC; skipped if slot occupied
  - Pre-booking: 1 or 2 slots (30 or 60 min) immediately before booking start, driven by `pre_transport_buffer_slots` on the booking; only inserted when `transport_fee_kobo > 0`; clamped to 07:00 UTC; skipped if slot occupied, collision logged — FAIL if pre-booking buffers are inserted when `transport_fee_kobo = 0` or if they are not deleted on cancellation
- Zone confirmation: maximum once per day (`auto_accept_zone_confirmed_date = today`)
- `vendor-update-location` writes `vendor_current_lat`/`lng` every 60s while vendor is `on_way` — FAIL if location write is missing from this path

---

## 7. Notification Strings

**Source:** `supabase/functions/_shared/notifications.ts`

All 43 exports must be present. FAIL for each missing one:

```
msg_paymentAuthorized            msg_vendorAccepts                msg_vendorDeclines
msg_reminder24h                  msg_reminder1h                   msg_reminder15min
msg_vendorOnWay                  msg_vendorArrived                msg_serviceRendered
msg_autoReleaseWarning           msg_paymentReleased
msg_cancelTier1                  msg_cancelTier2                  msg_cancelNonRefundable
msg_autoAccepted                 msg_bookingCancelledByVendor     msg_bookingCancelledFullRefund
msg_disputeRaised_user           msg_disputeResolved_userRefunded msg_disputeResolved_vendorPaid
msg_consentRequest               msg_reschedule_suggested_customer
msg_vendor_newBooking            msg_vendor_reminder30min         msg_vendor_bookingExpired
msg_vendor_reminder24h           msg_vendor_reminder1h            msg_vendor_reminder15min
msg_vendor_paymentReleased       msg_vendor_userCancelledWithFee  msg_vendor_newReview
msg_vendor_verificationApproved  msg_vendor_verificationFailed
msg_vendor_autoAccepted          msg_vendor_serviceRenderReminder msg_vendor_selfCancelled
msg_disputeRaised_vendor         msg_vendor_consentApproved       msg_vendor_consentDeclined
msg_vendor_consentExpired
msg_reschedule_accepted_vendor   msg_reschedule_declined_vendor   msg_reschedule_expired_vendor
```

- `msg_vendor_newBooking` takes five parameters: `(clientFirstName, service, date, time, earningsFormatted)` — FAIL if the fifth parameter is absent or if the call site in `paystack-webhook` omits it
- FAIL if user-facing sentence strings appear inline in any `supabase/functions/*/index.ts` rather than imported from this file.
- NOTE: `docs/VARS_PROJECT_CONTEXT.md` §3 only documents ~29 of these 43 functions. The `notifications.ts` file itself is the source of truth — the context doc table is not exhaustive.

---

## 8. Pioneer Counter and Atomic Registration

**Source:** `apps/landing/` (search for `vendor_leads` query), `supabase/functions/vendor-register-lead/index.ts`, `supabase/migrations/*021*`

- Landing page pioneer counter queries all `vendor_leads` (total registrations for social proof, no `pioneer=true` filter) — FAIL only if it queries the `vendors` table instead
- `vendor-register-lead` sets `pioneer = true` on the lead record at insert
- Registration must call `register_vendor_lead()` Postgres function (021) — FAIL if it uses a direct `INSERT` instead (race condition on pioneer slots)
- `register_vendor_lead()` uses an advisory lock — FAIL if the advisory lock is absent
- `UNIQUE(email)` on `vendor_leads` — FAIL if duplicate emails can be inserted via any other path

---

## 9. KYC Flow

**Source:** `supabase/functions/vendor-kyc-webhook/index.ts`, `supabase/functions/vendor-kyc-init/index.ts`

- Clean pass: single update sets `kyc_status = verified` AND `is_active = true` — no admin step required
- Failure: `kyc_status = rejected`; `kyc_rejection_reason` populated; surfaces in admin queue; `msg_vendor_verificationFailed` notification sent to vendor
- On each new KYC attempt: `kyc_rejection_reason` is cleared before the new session is initiated
- Webhook authenticated via HMAC using `YOUVERIFY_WEBHOOK_SECRET` before any processing
- No raw ID data stored at any point
- Trust layer — on clean pass, `vendor-kyc-webhook` must also: extract the Youverify liveness face image (tried across multiple candidate field paths), crop to 400×400 JPEG (top 65% geometric crop), upload raw and cropped versions to `vendor-identity-images` bucket, and set `profile_image_url` / `profile_image_raw_url` / `profile_image_locked = true` on the vendor row — FAIL if any write is absent on the accepted path
- `profile_image_locked` must only be written by service role — RLS guards on `vendors_update_own` `WITH CHECK` (confirmed in Section 1) prevent JWT overwrite; FAIL if a vendor JWT can set `profile_image_url` directly
- WARN always: Youverify webhook payload schema is not yet confirmed with their team (`docs/VARS_PROJECT_CONTEXT.md` §4). Face image field path is tried via multiple candidates and the matched index is logged. Flag if code makes rigid single-field assumptions.

---

## 10. Cancellation Flag and Suspension

**Source:** `supabase/functions/vendor-cancel-booking/index.ts`, `supabase/migrations/20240101000006_vendor_cancellation_flag.sql`

- `cancellation_flagged` set when rolling 30-day cancel count ≥ 3
- `cancellation_flagged ≠ is_suspended` — flagged vendor stays live and bookable
- `is_suspended = true` removes vendor from discovery via RLS: `is_active = TRUE AND is_suspended = FALSE`
- No automated suspension trigger — suspension is manual admin action only
- No vendor notification on flag; no admin alert on new flag — both are known gaps, not bugs

---

## 11. Access Detail Security

**Source:** `apps/mobile/app/booking/`, `supabase/functions/paystack-initialize/index.ts`

- Step 3 inputs are structured fields: `access_building`, `access_floor`, `access_flat`, `access_code` — not free text
- Filter strips sequences of 7+ consecutive digits and `@` symbols silently — validation applied at the mobile app layer (`apps/mobile/app/booking/`), not in the edge function
- No unfiltered free-text field exposed before service begins

---

## 12. Brand Constants

**Source:** `apps/mobile/` — grep

- Vendors with no reviews: must show "New on VARS" — FAIL if empty stars are rendered
- `#0A7AFF` must not appear as `backgroundColor` on screen, container, or card-level components — FAIL if found at that scope; interactive element backgrounds (buttons, active tabs, pills) are exempt by design
- ScissorsLoader spec:
  - Sizes: small = 23×24 px, medium = 39×39 px, large = 61×63 px — FAIL if old values (35/58/92 px) appear
  - Animation: 0.7s cycle (350ms close + 350ms open), ease-in-out, CLOSE_DEG = 32 — FAIL if 33° or bounce easing
  - ViewBox: must be `"-120 -90 800 820"` for the mobile ScissorsLoader component — FAIL if original `"0 0 555 718"` (blades clip at ±32°)
  - Rotation: must use nested translate-rotate-untranslate pattern (`G transform={translate(pivot)}` → `AnimatedG rotation` → `G transform={translate(-pivot)}`) — FAIL if `originX`/`originY` props are used on `AnimatedG` (unreliable on React Native 0.76 new architecture)
  - color prop: `light` (#FFFFFF) on dark/primary-colour backgrounds; `dark` (#1A1A1A) on white or surface backgrounds — FAIL if hardcoded colour values appear inside the component
- Pull-to-refresh: `RefreshControl` must suppress the native OS spinner (`tintColor="transparent"`, `colors={['transparent']}`) and render an inline `ScissorsLoader` instead — FAIL if the native spinner is visible
- Splash: `app.config.js` `splash.backgroundColor` must be `"#000000"` — FAIL if `"#111111"` or any other value (mismatch causes letterbox strips on device)
- Hex colour check: `constants/colors.ts` defines an approved semantic colour system — FAIL only for colour values outside the base palette (`#111111`, `#FFFFFF`, `#F5F5F5`, `#0A7AFF`, `#1A1A1A`) that appear hardcoded in component or screen files without referencing `constants/colors.ts`
- VendorPriceInput: pioneer preview must show "You keep 100% — Pioneer booking · ₦X,XXX" when `pioneer = true` AND `pioneer_bookings_completed < 3`; "You'll receive: ₦X,XXX" otherwise — FAIL if this preview triggers a fetch per keystroke rather than deriving from props
- Web `ScissorIcon` (roadmap): `viewBox` must be `"-120 -90 800 920"` and `height="37"` — FAIL if original `"-120 -90 800 820"`/`height="33"` (blade tips clip at ±30° on the roadmap page)

---

## 13. V1 Scope Boundary

**Source:** grep `apps/` and `supabase/functions/`

FAIL for any implemented feature matching:

```
wallet  top-up  subscription  loyalty  augmented reality  virtual try
multi-service  address book  saved address  full offline
```

WARN for TODO or comment references to these features.

---

## 14. Launch Flow Integrity

**Source:** `apps/mobile/app/index.tsx`, `apps/mobile/app/_layout.tsx`

- `app/index.tsx` must return `null` — FAIL if it contains a `router.replace()` or any redirect logic
- `app/_layout.tsx` must preload both auth state and `vars_onboarding_done` (AsyncStorage) before calling `SplashScreen.hideAsync()` — FAIL if either is missing from the pre-hide gate
- Routing must be guarded by a single-fire ref (`didInitRoute`) — FAIL if `useEffect` dependencies could trigger multiple redirects
- No `ScissorsLoader` overlay must exist between splash and destination screen — FAIL if a full-screen animated overlay is rendered in `_layout.tsx` after the splash hides
- Homepage (`/(tabs)/index.tsx`): must show `ScissorsLoader` (size="medium" color="dark") while `loading && vendors.length === 0` — FAIL if a blank screen or immediate empty-state is rendered on first load
- Booking flow Step 3 (Location step): transport surcharge preview must calculate distance client-side via Haversine using vendor zone coordinates fetched at `BookingFlow` mount; when `transport_fee_kobo > 0`, total shown must include the surcharge and the note "Your stylist is travelling further to reach you — this price reflects that." must appear — FAIL if the pay button shows `service_price_kobo` alone when a surcharge applies; WARN if vendor zone coordinates are unavailable and preview silently shows service price only (acceptable fallback)

---

## 15. Vendor Lead Outreach System

**Source:** `supabase/functions/_shared/lead-copy.ts`, `supabase/functions/deliver-outreach/index.ts`, Postgres `vendor_lead_tick()` function

**lead-copy.ts exports** — all 5 must be present, FAIL for each missing:
```
welcomeEmail  reengagementEmail  whatsappIntro  whatsappReengagement  whatsappGoLive
```

- Each function must vary output by `service_type` (barbing/hair_styling/makeovers/other) AND pioneer status — FAIL if either branch is absent
- `whatsappReengagement`: both the pioneer branch and the non-pioneer branch must reference the service label — FAIL if either branch omits service type
- `lead-copy.ts` must read `LAUNCH_MONTH` from `Deno.env` (defaulting to `'August'`) — FAIL if launch month is hardcoded as a string literal

**vendor_lead_tick() priority order (highest first)** — FAIL if order differs:
1. PROSPECT/COLD → VERIFIED (KYC approved)
2. GO-LIVE message (`lead_state = VERIFIED`) — deletes any pending intro/reengagement WhatsApp drafts first
3. PROSPECT → COLD (`last_outreach > 7 days ago`)
4. REENGAGEMENT message (`lead_state = COLD`, 7-day silence) — deletes any pending intro WhatsApp draft first
5. INTRODUCTION message (`last_outreach IS NULL`, 24h after signup)

Return type: `TABLE(transitions integer, queued integer)` — FAIL if it returns void or a single scalar

**Guards** — FAIL if any are absent:
- Email channel never blocks WhatsApp cadence — only phone channels (whatsapp/sms) block new phone messages
- Max 3 sent messages per type per lead
- 50 leads processed per tick

**deliver-outreach:**
- Routes by channel: whatsapp/sms → Termii; email → Resend
- Stamps `last_outreach` on lead for phone channels only — FAIL if email stamps `last_outreach`
- Guards email sends against `email_unsubscribed = true` on the lead record — FAIL if this check is absent
- Marks record `sent`/`failed` with provider message ID
- `DELIVERY_LIVE` secret gates real delivery — logs only when unset; FAIL if provider calls fire without this flag set
- Outreach emails must include RFC 8058 `List-Unsubscribe` headers (mailto: + HTTPS) pointing to the `unsubscribe-lead` function — FAIL if headers are absent
- Auth: accepts `x-vars-cron-secret` (cron calls) OR `Authorization: Bearer DELIVER_OUTREACH_SECRET` (manual/admin calls) — FAIL if only one path is implemented

**unsubscribe-lead:**
- Sets `email_unsubscribed = true` on `vendor_leads` — FAIL if it modifies any other column or table
- Must verify `UNSUBSCRIBE_SECRET` token before writing — FAIL if unauthenticated writes are possible

**vendor-register-lead welcome email:**
- On POST: must auto-create an `approved` `welcome_email` outreach record — FAIL if it only inserts the lead without creating the outreach record
- Phone number must be normalised to E.164 (`+234XXXXXXXXXX`) before insert — FAIL if raw local format (`080XXXXXXXXXX`) is stored
- WARN if `DELIVERY_LIVE=true` but Termii/Resend secrets are unset

---

## 16. Connectivity Resilience

**Source:** `apps/mobile/lib/`

Four utilities must exist and match spec — FAIL for each deviation:
- `lib/useNetworkState.ts` — polls Google generate_204; 30s interval online, 8s offline; FAIL if a third-party dependency is used instead
- `lib/fetchWithRetry.ts` — 3 attempts, 8s abort-controller timeout per attempt, exponential backoff (1s → 2s); FAIL if retry count or timeout differs
- `lib/actionQueue.ts` — AsyncStorage-backed; `enqueueAction()` + `flushQueue()`; replays in order, removes each entry on success; FAIL if queue is in-memory only (lost on app restart)
- `lib/cache.ts` — AsyncStorage TTL cache; `cacheSet` / `cacheGet` / `cacheInvalidate`; FAIL if cache is not read on offline state

**components/OfflineBanner.tsx:**
- Fixed amber bar rendered when `useNetworkState` reports offline
- Slides in on disconnect, slides out automatically on reconnect — FAIL if manual dismissal is required or banner persists after reconnection

---

## 17. Admin Panel

**Source:** `apps/admin/src/`

- All mutations (KYC overrides, dispute resolution, outreach approvals) must run through Next.js Server Actions with service-role client — FAIL if `SUPABASE_SERVICE_ROLE_KEY` is referenced in a client component or exposed in the browser bundle
- Cookie-based session (`sb-access-token`); Next.js middleware must redirect unauthenticated requests to `/login` — FAIL if any admin route is accessible without auth
- Disputes: SLA timer per dispute — warns at 18h, critical at 24h — FAIL if thresholds differ
- Disputes: each card must show a colour-coded `dispute_category` label — FAIL if category is absent from the UI
- Outreach queue: checkboxes + bulk approve/reject with per-message channel selector — FAIL if bulk actions bypass the channel selector
- Outreach compose panel: filter by service type, converted/unconverted toggle — FAIL if either filter is absent
- KYC queue: defaults to rejected cases only; clean passes never reach the queue — FAIL if verified vendors appear requiring admin action
- Vendors list: must show both `profile_image_url` (circular, 40×40) and `profile_image_raw_url` (rectangular audit image labelled "Audit") per vendor row — FAIL if either column is absent from the query or not rendered

---

## 18. Outstanding Operational Items

**Source:** `docs/VARS_PROJECT_CONTEXT.md` §2, §4–6

- `reschedule-expire-hourly` cron — edge function and migrations built and merged; job confirmed in live project. WARN only if removed or renamed in the Dashboard.
- `photo-consent-expire-cron` — confirmed present in live project. WARN only if removed or renamed.
- `booking-expire-every-5min` — confirmed in live project. Critical: without this job, unanswered bookings sit as pending indefinitely and customer funds are never released. FAIL if missing from Dashboard.
- `vendor-lead-tick` — must be registered hourly. WARN until confirmed in Dashboard.
- `deliver-outreach-cron` — deployed and confirmed active at `*/10 * * * *`. Delivery is stubbed — set `DELIVERY_LIVE=true` in Supabase secrets to activate real Termii/Resend delivery.
- WhatsApp delivery — blocked on Meta HSM template approval via Termii dashboard. Three templates required: intro, reengagement, go-live. Free-form WhatsApp messages are silently discarded by Meta. WARN until all three templates are approved and `TERMII_API_KEY` / `TERMII_SENDER_ID` are set in Supabase secrets.
- Youverify webhook schema — unconfirmed with vendor. WARN until confirmed with their team.
- Monnify — no code action; note only if Paystack live mode is blocked at launch.
- `DELIVERY_LIVE` secret — WARN if unset in production and outreach delivery is expected.
- Paystack live mode — blocked on CAC registration. Swap `PAYSTACK_SECRET_KEY` once complete; no code changes needed.
- Youverify production credentials — blocked on pricing negotiation. Swap `YOUVERIFY_API_KEY` and `YOUVERIFY_WEBHOOK_SECRET` once complete; no code changes needed.

---

## Output Format

```
PASS — [check]
WARN — [check]: [what to watch]
FAIL — [check]: [what is broken or missing]
```

**ITEMS REQUIRING FOUNDER DECISION**
Anything the audit cannot resolve from the codebase or context docs alone.
