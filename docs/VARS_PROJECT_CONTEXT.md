# VARS — Project Context

Things not visible from the codebase alone. Reference before making product, copy, payment, KYC, or architecture decisions.

| Founder | Seyi Ibitoye |
|---|---|
| Name meaning | Fresh (Afrikaans) |
| Domain | bookwithvars.com |
| Admin | vars-admin.vercel.app |
| Launch market | Lagos, Nigeria |
| Secondary market | United Kingdom |
| Phase | Phase 2 — Open the Market (active milestone: 400 Vendors in Pipeline, June 2026 target) |
| Roadmap | `apps/landing/src/app/roadmap/data/milestones.ts` — source of truth for all phase and milestone state |

---

## 1. Product Spec V1.0

**Status: Not in repo — held by founder/PO.**

The full spec (screen-by-screen UX, edge case handling, brand voice §9, cancellation policy table §5) lives outside the codebase. Flag any ambiguous UI/UX or copy decision — the spec is the source of truth. The README and this doc capture what's implemented; the spec governs everything not yet built.

---

## 2. Build State

**Source of truth: `/README.md`**

The README is the canonical record of what's implemented — screens, edge functions, migrations, payment flow, auto-accept, KYC, cron jobs. Before asking "is X built?", check there.

**Current blockers (external — no code changes needed):**

| Item | Status |
|---|---|
| Paystack live mode | Blocked — CAC registration complete, business bank account open. Now pending Paystack account activation review (ticket ref: Vars 1850306, opened mid-May; escalation email sent 17 June to hello@paystack.com, no response yet). Pursuing via Paystack live chat and @PaystackHelp on X. Swap `PAYSTACK_SECRET_KEY` in Supabase secrets (test → live) and register webhooks against production URLs once live keys are issued. |
| Youverify credentials | Done — all three secrets set in Supabase (`YOUVERIFY_API_KEY`, `YOUVERIFY_BASE_URL`, `YOUVERIFY_WEBHOOK_SECRET`), production values, webhook URL pointed at `vendor-kyc-webhook`. KYC is live-ready. |
| Google Maps API key | Set in `apps/mobile/.env` and Supabase secrets. No code changes needed — activate billing in Google Cloud Console. |
| Android APK | Use EAS Cloud Build (`eas build --platform android --profile preview`) — avoids Windows PATH/JDK friction, produces a shareable `.apk` without local Android Studio. |
| Email delivery (outreach + marketing) | Ready — `RESEND_API_KEY`, `DELIVER_OUTREACH_SECRET`, `UNSUBSCRIBE_SECRET` are set. Set `DELIVERY_LIVE=true` to activate. |
| WhatsApp delivery | Blocked — two layers: (1) Termii account flagged/blocked by 360dialog (Termii's Meta BSP partner) on the Termii dashboard, no reason given via notification; draft escalation email to Termii contact Emmanuel Danso prepared, pending send. Account block must resolve before (2) Meta HSM template approval (intro, reengagement, go-live templates submitted via Termii dashboard) can proceed. Once both clear, set `TERMII_API_KEY`, `TERMII_SENDER_ID` in Supabase secrets and `DELIVERY_LIVE=true`. |

**In-progress work:** See `docs/codex/CLEANUP_ROADMAP.md` — Phases 3–6 (Supabase health audit, app flow verification, product polish, delivery) are still pending.

---

## 3. Brand Identity

### Visual system

| Element | Decision |
|---|---|
| Palette | Monochrome shell. Core tokens: `ink` `#111111`, `white` `#FFFFFF`, `inkMuted` `#6B7280`, `inkFaint` `#D0D0D0`. Accent glyphs only (never fills, borders, or anything larger than ~16px): `accentBlue` `#0A7AFF` (booked dot), `accentAmber` `#F59E0B` (auto-accept ⚡), `accentGreen` `#22C55E` (online dot), `accentRed` `#EF4444` (blocked ✕). Tokens live in `apps/mobile/constants/colors.ts`. |
| App background | White (`#FFFFFF`) throughout. Splash screen is the only dark-background screen (`#111111` with white VARS logo) — reference point for the whole system. |
| Containers | Always monochrome: transparent bg or white bg, 1px–1.5px `#111111` border. No coloured card fills, pill backgrounds, or button fills except black. |
| CTAs | Black fill (`#111111`), white text. Secondary/ghost actions: transparent bg, 1px black border, black text. Destructive actions: same — black border, black text; the confirmation dialog carries the gravity, not red colour. |
| State signalling | Border weight signals "this element has a state" (1px = neutral/available, 1.5px = active state). A tiny icon or dot in the corner specifies *which* state. Typography weight signals selection (active nav = bold 700, inactive = regular 400). |
| Typography | Inter — Regular, Medium, Bold. Same across app, web, and all content. |
| Illustration style | Human ink sketch — loose, gestural linework in the style of 19th century engraving (Gustave Doré reference). Black ink on white or white ink on black. No fills, no gradients, no colour. Used on onboarding screens, empty states, brand moments. |
| Logo mark | Crosshair/location pin — two blades that cross at a pivot point. Drives the scissors loading animation. |
| Loading animation | Blades open and close slowly and precisely. 0.7s per direction, ease-in-out, no bounce. Three sizes: small (23×24px), medium (39×39px), large (61×63px). White (`light`) on filled black buttons; dark (`dark`) on white/surface backgrounds. |

### Brand voice

- **In-product** — English. Professional, clear, calm, trustworthy. Every notification speaks with authority.
- **Social media** — Pidgin-forward. Warm, direct. Sounds like someone who genuinely understands the Nigerian beauty hustle.
- Never corporate. Never desperate. Never generic.

### Trust as the product (Phase 2 framing)

In Phase 2, what VARS is selling is trust — not beauty services. Any customer can find a barber or stylist in Lagos. What they cannot find elsewhere is a verified professional, with their identity confirmed, arriving at a home address, with payment secured at booking and settled only when the job is done.

Every copy decision should reflect this. The platform's job is to make the invisible visible: the payment split is real, verification happened, the phone number reveal is intentional, the dispute window is real. When in doubt, name the system out loud. "Your payment is secured with VARS" is more powerful than "payment confirmed." "You're now Verified by VARS" is more powerful than "you're live."

Trust signals to surface at every opportunity:
- **Secure payments** — name how the split works in confirmations: the stylist's share is already secured at payment time, not held back by VARS.
- **Verified by VARS** — the badge is the proof; use the phrase.
- **The 2-hour dispute window** — frame it as protection, not a deadline.
- **Phone reveal at 15 min** — frame it as connection, not exposure.
- **Cancellation fees** — frame as fairness to the stylist, not penalty to the customer.

### Locked terminology

| Term | Usage |
|---|---|
| **New on VARS** | Shown on vendor profiles with no reviews yet — replaces empty stars |
| **VARS Pioneers** | The first 50 vendors to register and verify — founding cohort |
| **Verified by VARS** | Badge after successful Youverify KYC |
| **VARS' Choice** | Badge manually awarded by VARS team to standout vendors |
| **Top Rated** | Badge based on sustained high ratings |
| **You're live on VARS** | Vendor approval notification copy |
| **You're in the VARS queue** | Vendor verification pending copy |
| **Let's find you another one** | Re-engagement copy when vendor declines or times out |

---

## 4. V1 Scope — Locked

Build only what is listed. Everything else is explicitly out of scope for V1.

**Included in V1:** User booking flow end-to-end, vendor acceptance and active job flow, Paystack escrow, live location discovery, push notifications + in-app log, vendor KYC via Youverify, photo tagging and consent workflow, vendor reschedule flow, auto-accept zone system, admin dashboard.

**Explicitly excluded from V1:**
- E-commerce / Shop
- In-app wallet top-up
- Subscription or loyalty features
- AR or virtual try-on
- ~~Multi-service bookings (one service per booking only)~~ **Shipped in V2 — see service taxonomy migration**
- Saved addresses / address book
- Full offline mode (lightweight resilience only)

**V2 service taxonomy (shipped — replaces V1 master catalogue):**

Free-name services organised under a two-level taxonomy. Vendors define their own service names; the platform provides the category structure only.

| L1 | L2 subcategories |
|---|---|
| Hair | Braids, Weaves, Locs, Natural, Relaxed |
| Barber | Cuts, Shaves, Beard, Colour |
| Face | Makeup, Skincare, Lashes, Brows |
| Nails | Manicure, Pedicure, Nail Art |

Service constraints: name ≤ 60 chars, description ≤ 200 chars (optional), minimum price ₦10,000, duration in 30-min blocks (1–48), max 10 active services per vendor. Schema: `vendor_services` (free-name) + `booking_services` join table. Migration: `20260603000001_service_taxonomy_v2`.

---

## 5. Key Product Decisions — Do Not Reverse Without Discussion

These decisions were made deliberately. Flag explicitly before suggesting any reversal.

| Decision | Rule | Reason |
|---|---|---|
| Payment: gate-at-departure model | No Paystack charge at booking creation. The charge fires when the vendor commits to travel — via "On My Way" (manual trigger, available within 2 hours of `scheduled_at`) or a proximity trigger in the `send-reminders` cron. Atomic gate claim (`UPDATE WHERE gate_fired=FALSE`) prevents double-fire. Returning customers (stored card): silent `chargeAuthorization`. First-time customers: `initializeTransaction` → WebView checkout. Both paths converge at `charge.success` webhook, which advances status to `on_way` and sets `gate_charged_at`. | Paystack confirmed that authorisation-not-capture is not supported for NGN transactions. Charging at departure is the correct model: vendor commits first, customer is charged at that moment, no refund is needed for vendor no-shows because nothing was charged. |
| Payment: subaccount split at gate time | Vendor's share (80%, or 100% for Pioneer) splits immediately into their Paystack subaccount when the charge fires at gate time. VARS's share stays in the VARS main account. Split ratio is computed at gate time and cannot change at settle time. No Transfer API — settlement is fully subaccount-based. | No Transfer API needed for any payment path. Normal settlement: vendor's money is already in their subaccount. Vendor restriction (post-gate vendor cancel): tracked via DB flag; ops recovers funds out-of-band. |
| Settlement: manual, vendor-gated | Paystack has no public API endpoint to trigger subaccount settlement. VARS ops must trigger payouts from the Paystack dashboard (settlement_schedule = manual). Settlement is gated at the vendor level — any open or under-review dispute on any of the vendor's bookings, or `is_restricted = true`, freezes their subaccount balance for that cycle. | Prevents partial settlement of disputed funds. Restriction enforcement is a single `is_restricted` flag on the vendor row, checked by the settle cron. |
| Cancellation: binary pre/post-gate rule | Pre-gate cancel (customer): free — no Paystack call, nothing was charged. Post-gate cancel (customer): 409 locked — vendor has committed to travel. Post-gate cancel (vendor): full Paystack refund to customer + vendor restricted. | Tiered-fee cancellation model was removed with the gate model. No charge exists before the gate fires, so there is nothing to partially refund. Post-gate cancellation by vendor is penalised precisely because the charge has succeeded and VARS has already refunded the customer. |
| Vendor acceptance window | 1 hour exactly. 30-min reminder at halfway. | Not 2 hours (too slow for customers), not 15 min (too short for vendors). |
| Auto-release timing | **2 hours** after `service_rendered_at` — set by DB trigger in migration `001`. | Ties release to when service actually finishes. The DB trigger is authoritative: `NEW.auto_release_at := NEW.service_rendered_at + INTERVAL '2 hours'`. |
| Transport buffer | Two 30-min blocks AFTER the booking only — not before. | Vendor travels from wherever they are, not a fixed location. After-only is correct. |
| User verification | Customers are NOT KYC'd. Phone number collected as plain text after login — not verified via OTP. | Trust infrastructure is concentrated on the vendor side via Youverify. Behavioural flags in admin handle bad actors. |
| Auth methods | Google, Facebook, email — three methods only. Phone is collected as a text field after auth, not as an OTP login method. | |
| Status flow is rigid | Vendors cannot skip On My Way → Arrived → Service Rendered. | Each step triggers phone reveal, location sharing, and escrow release. Skippable steps would break the trust architecture. |
| Dispute freezes vendor settlement | Disputes set `settlement_on_hold = true` on the vendor row (not on the booking). The settle cron skips the entire vendor for that cycle. | Paystack controls dispute holds on subaccount funds; VARS mirrors this in the vendor flag. |
| No customer filter for auto-accept | Users cannot filter vendor feed by auto-accept status in V1. | |
| ~~One service per booking~~ | **Removed in V2.** Multi-service bookings now supported via `booking_services` join table. Total amount and duration are summed across selected services. | Was: simpler escrow logic, simpler vendor scheduling. Now: free-name taxonomy removes V1 master catalogue dependency. |
| Dispute freezes auto-release | Disputed bookings are completely exempt from auto-release. | Escrow stays frozen until admin resolves manually. |
| Youverify is final | Clean KYC pass = vendor goes live instantly. Only rejected/flagged cases reach admin queue. | |
| Pidgin on socials only | App and landing page stay in English for trust and clarity. Social is Pidgin-forward. | Same brand personality, different register. |
| Location locked at home screen | User location is set before browsing and cannot be changed at booking stage. | Changing it requires returning to home screen which refreshes the feed. |
| Access details structured, not free text | Structured inputs with silent filtering — strips 7+ digit sequences and `@` symbols. | Prevents contact sharing before the platform has done its job. |
| Pioneer counter reads from `vendor_leads` | The Pioneer counter on bookwithvars.com reads from `vendor_leads WHERE pioneer = true`, not the full `vendors` table. | At launch most Pioneers will still be leads not yet fully onboarded. Reading from leads prevents counter showing 0. |

---

## 6. Notification Strings

**Source: `supabase/functions/_shared/notifications.ts`**

All push and in-app notification copy lives here as exported functions. Never write notification copy inline in edge functions — add a `msg_*` function here and import it.

| Function | Recipient | Trigger |
|---|---|---|
| `msg_paymentAuthorized(vendorName)` | Customer | Booking submitted — vendor has 1 hour to confirm |
| `msg_vendorAccepts(vendorName, date, time)` | Customer | Vendor accepts |
| `msg_vendorDeclines(vendorName)` | Customer | Vendor declines |
| `msg_reminder24h(vendorName, time)` | Customer | 24h before appointment |
| `msg_reminder1h(vendorName)` | Customer | 1h before appointment |
| `msg_reminder15min(vendorName)` | Customer | Phone revealed, vendor on way |
| `msg_vendorOnWay(vendorName)` | Customer | Vendor status → on_way confirmed |
| `msg_vendorArrived(vendorName)` | Customer | Vendor taps "Arrived" |
| `msg_serviceRendered(vendorName)` | Customer | Vendor marks service done |
| `msg_autoReleaseWarning(vendorName)` | Customer | 30 min before auto-release |
| `msg_paymentReleased(vendorName)` | Customer | Escrow settled |
| `msg_cancelFree()` | Customer | Cancelled pre-gate — no charge was made |
| `msg_gatePaymentNeeded(vendorName)` | Customer | Gate fired — first-time customer must complete checkout |
| `msg_gatePaymentFailed()` | Customer | `chargeAuthorization` failed — retry window opened |
| `msg_gatePaymentExpired()` | Customer | Payment window expired — booking cancelled |
| `msg_autoAccepted(vendorName, date, time)` | Customer | Auto-accept fired |
| `msg_bookingCancelledByVendor(date, time)` | Customer | Vendor cancelled (pre-gate) |
| `msg_bookingCancelledFullRefund(date, time)` | Customer | Vendor cancelled post-gate — full refund issued |
| `msg_disputeRaised_user()` | Customer | Dispute submitted |
| `msg_disputeResolved_userRefunded(amount)` | Customer | Admin resolves in customer's favour |
| `msg_disputeResolved_vendorPaid(amount)` | Customer | Admin resolves in vendor's favour |
| `msg_consentRequest(vendorName)` | Customer | Vendor requests portfolio photo consent |
| `msg_reschedule_suggested_customer(vendorName, day, time)` | Customer | Vendor suggests new time |
| `msg_vendor_newBooking(clientFirstName, service, date, time, earningsFormatted)` | Vendor | New booking arrives |
| `msg_vendor_reminder30min(clientFirstName)` | Vendor | 30 min left to accept pending booking |
| `msg_vendor_bookingExpired()` | Vendor | Pending booking expired without acceptance |
| `msg_vendor_reminder24h(time, service, clientFirstName)` | Vendor | 24h before appointment |
| `msg_vendor_reminder1h(clientFirstName)` | Vendor | 1h before appointment |
| `msg_vendor_reminder15min(clientFirstName)` | Vendor | 15 min mark — head out |
| `msg_vendor_paymentReleased(amount)` | Vendor | Escrow settled to vendor |
| `msg_vendor_customerCancelledFree(clientFirstName)` | Vendor | Customer cancelled pre-gate — no charge applied |
| `msg_vendor_gatePaymentPending()` | Vendor | Gate fired, waiting for first-time customer checkout |
| `msg_vendor_gateCharged()` | Vendor | Charge succeeded — officially on their way |
| `msg_vendor_gatePaymentExpired(clientFirstName)` | Vendor | Customer payment window expired — slot is free |
| `msg_vendor_restricted(amountFormatted)` | Vendor | Vendor cancelled post-gate — account restricted |
| `msg_vendor_restrictionLifted()` | Vendor | Admin lifted vendor restriction |
| `msg_vendor_onWayNudge(clientFirstName)` | Vendor | Reminder to tap "On My Way" before gate window closes |
| `msg_vendor_newReview(clientFirstName)` | Vendor | Customer leaves a review |
| `msg_vendor_verificationApproved()` | Vendor | KYC passed — now live |
| `msg_vendor_verificationFailed(reason)` | Vendor | KYC rejected |
| `msg_vendor_autoAccepted(clientFirstName, service, date, time)` | Vendor | Auto-accept fired |
| `msg_vendor_serviceRenderReminder(clientFirstName)` | Vendor | Overdue — mark service complete |
| `msg_vendor_selfCancelled(clientFirstName, service)` | Vendor | Vendor cancelled summary |
| `msg_disputeRaised_vendor(clientFirstName)` | Vendor | Customer raised dispute |
| `msg_vendor_consentApproved()` | Vendor | Customer approved portfolio photo |
| `msg_vendor_consentDeclined()` | Vendor | Customer declined portfolio photo |
| `msg_vendor_consentExpired()` | Vendor | Photo consent request timed out |
| `msg_reschedule_accepted_vendor(clientFirstName, day, time)` | Vendor | Customer accepted reschedule |
| `msg_reschedule_declined_vendor(clientFirstName)` | Vendor | Customer declined reschedule |
| `msg_reschedule_expired_vendor(clientFirstName)` | Vendor | Reschedule timed out |

---

## 7. Youverify KYC Integration

**Status: Live. Production credentials set in Supabase secrets (19 June 2026). Webhook URL configured in Youverify dashboard.**

What is built:
- `vendor-kyc-init` initiates a Youverify hosted KYC session; returns a URL opened in a WebView.
- `vendor-kyc-webhook` receives the result and handles three outcomes:
  - **Verified** (`status: "found"`, `allValidationPassed: true`): extracts liveness face image (base64 data URI at `data.image`) and legal name (`data.firstName/middleName/lastName`), crops to passport-style 400×400, uploads raw + cropped to `vendor-identity-images` bucket, sets `kyc_status = verified`, `is_active = true`, `profile_image_locked = true`.
  - **Rejected** (`status: "found"`, `allValidationPassed: false`, or `failed/rejected/declined`): sets `kyc_status = rejected`, stores reason, sends "try again" push notification.
  - **needs_review**: if face image or legal name is missing from the webhook payload, the webhook calls `GET /v2/api/identity/:id` as a fallback. If data is still missing after the GET, sets `kyc_status = needs_review` — vendor stays unverified; admin resolves manually using the Youverify dashboard.
- Webhook authenticated via HMAC-SHA256 (`YOUVERIFY_WEBHOOK_SECRET`).
- `kyc_status_enum` includes: `pending`, `verified`, `rejected`, `needs_review` (migration `20260619000001`).
- All three Supabase secrets are set to production values: `YOUVERIFY_API_KEY`, `YOUVERIFY_BASE_URL`, `YOUVERIFY_WEBHOOK_SECRET`.

---

## 8. Go-To-Market

### Phase 1 — Vendor acquisition (complete)

Vendors first. Always. A user who opens VARS and sees no vendors nearby deletes the app and never returns. Supply density is the product.

- **Primary seeding strategy:** Personal barber contact in Lagos connecting his professional network. Founder-led, zero cost, highest conversion rate.
- **Channels:** Instagram (organic + paid), TikTok (organic + paid), WhatsApp groups, physical shop visits — Lekki, VI, Surulere, Yaba, Ikeja.

### Phase 2 — Open the Market (current phase)

**Milestone timeline** (source of truth: `apps/landing/src/app/roadmap/data/milestones.ts`):

| Milestone | Period | Status |
|---|---|---|
| 400 Vendors in the Pipeline | June 2026 | **Active now** — 75 registered, target 400 verified and ready to go live |
| App Store Launch | July 2026 | Upcoming — supply-only month; vendor onboarding only, no customer marketing yet |
| Both Sides Open | August 2026 | Upcoming — customer marketing activates; first month both sides are live simultaneously |
| Platform Health Review | Q3 2026 | Upcoming — audit booking quality, vendor performance, platform health before year-end push |
| Year-End | November–December 2026 | Upcoming |
| 1,000 Completed Bookings | End 2026 | The Year 1 milestone — completed sessions, not installs |

Phase 2 entry conditions were met as of May 2026: 100+ verified vendors, 4+ Lagos neighbourhoods, all 3 service categories, 3+ vendors per category per area.

**Wide Awake blog** (`bookwithvars.com/blog`) — content marketing arm, launched ahead of the August customer marketing activation. Covers money, mindset, culture, and the Nigerian beauty market. Articles are authored by Seyi Ibitoye. Content is defined statically in `apps/landing/src/app/blog/articles.ts` — no CMS. Live articles as of May 2026: *The Culture of Shame*, *Lagos Has the Talent*, *The Number in Your Head*. Five further articles are queued as "coming soon".

### Two-stage vendor registration

- **Stage 1 — Website lead:** 5-field form on bookwithvars.com. `pioneer` flag set here. Data goes to `vendor_leads` table.
- **Stage 2 — App onboarding:** VARS follows up personally. Vendor downloads app and completes full profile, KYC, bank account. Phone/email match bridges lead to full vendor record, pioneer flag transfers.

### VARS Pioneers programme

- First 50 vendors to register and verify = VARS Pioneers
- Zero commission on first 3 completed bookings (100% to vendor) — split set at `paystack-initialize` time via `transaction_charge: 0` when `pioneer=true AND pioneer_bookings_completed < PIONEER_BOOKINGS_THRESHOLD`; counter incremented in `paystack-settle` when booking completes
- Permanent VARS Pioneer badge on profile — never expires
- **Pioneer cohort is complete** (50 spots filled, May 2026). The landing page registration form (`PioneerSection.tsx`) no longer shows pioneer-specific copy, countdown, or waitlist branching — it presents a single general stylist registration state. Pioneer benefits remain enforced in the backend.
- Counter reads from `vendor_leads WHERE pioneer = true` — not the full `vendors` table

### Partnerships in discussion

- **Marketing Extension** — Nigerian marketing agency (fintech/B2B SaaS background). Marketing brief sent. Decision pending.
- **Youverify** — KYC provider. Production credentials active as of 19 June 2026 (contact: Ayotomide).

---

## 9. Vendor Onboarding Conversion

**Status: No measured data — pre-launch.**

No formal drop-off data across the 5-step onboarding flow yet. Once vendors onboard at scale, watch:
- Step 4 (KYC) — highest friction
- Portfolio upload — optional but affects booking conversion downstream

---

## 10. Operational Context

| Item | Detail |
|---|---|
| Business registration | Nigerian CAC registration in progress — required for Paystack live mode. |
| UK entity | Seyi is based in Maidenhead, UK. A UK limited company can be registered quickly if needed for Stripe or other global payment rails. |
| Domain | bookwithvars.com — registered via Google/Squarespace. DNS pointed at Vercel for landing page. |
| GitHub | github.com/kant1000/vars — private. |
| Hosting | Vercel (landing + admin), Supabase (backend), EAS (mobile builds). |
