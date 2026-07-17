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
| Paystack live mode | **Live — fully verified, July 2026.** CAC-backed verification complete. Live keys issued and active: `PAYSTACK_SECRET_KEY` swapped to live in Supabase edge function secrets (3 July 2026). Architecture confirmed compliant: gate model, one-time non-refundable card verification, per-vendor subaccounts with Split Payments, manual dashboard settlement. Remaining step: register production webhook URL in the Paystack live dashboard (Settings → Webhooks → point at the Supabase `paystack-webhook` function URL). |
| Youverify credentials | Done — all three secrets set in Supabase (`YOUVERIFY_API_KEY`, `YOUVERIFY_BASE_URL`, `YOUVERIFY_WEBHOOK_SECRET`), production values, webhook URL pointed at `vendor-kyc-webhook`. KYC is live-ready. |
| Google Maps API key | Set in `apps/mobile/.env` and Supabase secrets. No code changes needed — activate billing in Google Cloud Console. |
| Android APK | Use EAS Cloud Build (`eas build --platform android --profile preview`) — avoids Windows PATH/JDK friction, produces a shareable `.apk` without local Android Studio. |
| Auth OTP email | **Live (July 2026).** Supabase GoTrue SMTP wired to Resend on port 465 with SSL (`smtp.resend.com:465`, sender `noreply@bookwithvars.com`). OTP emails arrive from the VARS domain. Supabase Dashboard: Authentication → SMTP Settings → "Secure" checkbox must remain enabled (port 465 requires immediate TLS — without it GoTrue times out). |
| Email delivery (outreach + marketing) | Ready — `RESEND_API_KEY`, `DELIVER_OUTREACH_SECRET`, `UNSUBSCRIBE_SECRET` are set. Set `DELIVERY_LIVE=true` to activate. |
| WhatsApp delivery | Provider switched to 360dialog (direct Meta BSP). API key active and tested. Blocked only on Meta HSM template approval (intro, reengagement, go-live templates must be submitted and approved via 360dialog before free-form messages deliver). Once templates are approved, set `DIALOG360_API_KEY`, `DIALOG360_BASE_URL` in Supabase secrets and `DELIVERY_LIVE=true`. |

**In-progress work:** See `docs/codex/CLEANUP_ROADMAP.md` — Phases 3–6 (Supabase health audit, app flow verification, product polish, delivery) are still pending.

---

## 3. Brand Identity

### Visual system

| Element | Decision |
|---|---|
| Palette | Monochrome shell. Core tokens: `ink` `#111111`, `white` `#FFFFFF`, `inkMuted` `#6B7280`, `inkFaint` `#D0D0D0`. Accent glyphs only (never fills, borders, or anything larger than ~16px): `accentBlue` `#0A7AFF` (booked dot), `accentAmber` `#F59E0B` (auto-accept ⚡), `accentGreen` `#22C55E` (online dot), `accentRed` `#EF4444` (blocked ✕). Tokens live in `apps/mobile/constants/colors.ts`. |
| App appearance | Light and dark appearance are both locked for the mobile app. Default control is system appearance, with a manual override available in customer and vendor settings (`vars_appearance_override: system \| light \| dark`, stored locally, no backend state). Light mode keeps the monochrome white shell. Dark mode uses the splash screen's black surface as its reference point and communicates depth through the five step elevation ladder defined in `apps/mobile/constants/visualSystem.ts`, not through light mode shadows carried across unchanged. Approved by founder, 2026-07-16. |
| Containers | Always monochrome: transparent bg or surface-tone bg, 1px to 1.5px border. Border color is `inkFaint` (`#D0D0D0` light, `#555555` dark), not solid ink. This supersedes the earlier `#111111` container border rule, effective 2026-07-16, founder approved override. No coloured card fills, pill backgrounds, or button fills except black. |
| CTAs | Black fill (`#111111`), white text. Secondary/ghost actions: transparent bg, 1px black border, black text. Destructive actions: same — black border, black text; the confirmation dialog carries the gravity, not red colour. |
| State signalling | Interactive primitives (`VarsButton`, `VarsInput`, `VarsCheckbox`, `VarsSwitch`, `VarsSegmentedControl`) signal state through fill and colour, not a border-weight delta: filled ink = primary/selected/checked, transparent with an ink border = secondary/unselected, 0.5 opacity = disabled. Border *weight* (1px vs 1.5px) belongs to the elevation ladder — it signals surface depth, not interactive state. A tiny icon or dot in the corner specifies which non-interactive state (status dots). Typography weight signals nav selection (active = bold 700, inactive = regular 400). Approved by founder, 2026-07-17 — supersedes the earlier border-weight-as-state description, which didn't match the shipped primitive catalogue once built. |
| Elevation ladder | Five-step ladder (0–4) for surface depth: light `#FFFFFF → #E7E7E7`, dark `#0B0B0B → #323232`, border always `inkFaint`. iOS shadow strengthens with elevation; Android uses native `elevation`; dark mode carries no shadow — depth reads through tone alone. Implemented as `varsElevationStyle()` in `apps/mobile/constants/visualSystem.ts`, used by `VarsSurface`. Approved by founder, 2026-07-17. |
| Primitive catalogue | Fixed set of 11 components — `VarsSurface`, `VarsButton`, `VarsInput`, `VarsCheckbox`, `VarsSwitch`, `VarsSegmentedControl`, `VarsTabItem`, `VarsSkeleton`, `VarsToast`, `VarsDialog`, `VarsIcon` — is the only sanctioned way to build new UI in `apps/mobile`. Per-primitive use / do-not-use guidance in the [Primitive catalogue reference](#primitive-catalogue-reference) below; source in `apps/mobile/components/ui/primitives.tsx`. Shipped and live on vendor onboarding (all 5 steps), booking flow, gate checkout, schedule (undo toast + booking sheet), and both appearance-settings screens. A proposed new primitive needs explicit justification for why composing the existing 11 can't do the job. Approved by founder, 2026-07-17. |
| Loading & wait states | `VarsSkeleton` for predictable content shapes (discovery, bookings, notifications, profiles, earnings). `ScissorsLoader` stays for true indeterminate waits: payments, KYC, OCR, WebViews, button-busy states. Payment, KYC, dispute, bank-verification, and account-deletion flows never show optimistic success ahead of server/webhook confirmation — non-negotiable, verified line-by-line during the booking flow, gate checkout, and KYC primitive migrations. Approved by founder, 2026-07-17. |
| Icon system | Platform-native rendering behind `VarsIcon`'s single name-based API: SF Symbols on iOS via `expo-symbols@~0.2.2` (the version compatible with this app's Expo SDK 52 — iOS-only at this version), classic Material Icons on Android via `@expo/vector-icons` (not Material Symbols, which needs an Expo SDK upgrade past 55 — out of scope for now, revisit if/when the SDK moves). SVG fallback remains for web and any unresolved symbol name. Full 33-icon mapping table lives in code — `apps/mobile/components/ui/iconMap.ts` (`iconSystemNames`) — not duplicated here so it can't drift from what actually ships. Approved by founder, 2026-07-17. Caveat carried forward, not resolved by this approval: the Android build currently fails at the native Gradle/prebuild stage on a pre-existing toolchain issue unrelated to this work (tracked in `docs/audit/mobile.md`) — on-device icon rendering has not been visually confirmed on either platform yet. |
| Typography | Inter — Regular, Medium, Bold. Same across app, web, and all content. |
| Illustration style | Human ink sketch — loose, gestural linework in the style of 19th century engraving (Gustave Doré reference). Black ink on white or white ink on black. No fills, no gradients, no colour. Used on onboarding screens, empty states, brand moments. |
| Logo mark | Crosshair/location pin — two blades that cross at a pivot point. Drives the scissors loading animation. |
| Loading animation | Blades open and close slowly and precisely. 0.7s per direction, ease-in-out, no bounce. Three sizes: small (23×24px), medium (39×39px), large (61×63px). White (`light`) on filled black buttons; dark (`dark`) on white/surface backgrounds. SVG viewBox must be `"-120 -90 800 920"` — the 920 height gives 112 units of bottom clearance so blade tips never clip at ±32°. The web roadmap `ScissorIcon` uses the same value. Do not reduce VB_H below 920. |

#### Primitive catalogue reference

Per-primitive use / do-not-use guidance. Governing rule: nothing in the mobile app is built outside this catalogue — a new visual need is solved by composing these first; a proposed new primitive needs explicit justification for why composition can't do the job. Source: `apps/mobile/components/ui/primitives.tsx`.

| Primitive | Purpose | Use | Do not use | States / variants |
|---|---|---|---|---|
| `VarsSurface` | Bounded surface with theme/elevation | Cards, rows, sheets, dialogs | Full-page sections that should be unframed | elevation 0–4 |
| `VarsButton` | Command surface | Submit, save, confirm, cancel, retry | Navigation rows, chips | primary/secondary/ghost, sm/md/lg, disabled/loading/pressed, tone |
| `VarsInput` | Text input shell | Forms, search, notes, access details | Price picker rows or select rows | default/error/disabled/focus-ready |
| `VarsCheckbox` | Binary consent/selection | Consent checkbox, terms, optional toggles when check style fits | Online/biometric system switches | checked/unchecked/disabled |
| `VarsSwitch` | On/off system toggle | Vendor online/offline, other binary system switches | Consent/selection checkmarks | on/off/disabled |
| `VarsSegmentedControl` | Mutually exclusive compact modes | Period filters, Services/Reviews, Block/Unblock modes | Main app tabs | selected/unselected/disabled-ready |
| `VarsTabItem` | Icon/label styling for a tab bar item | Inside `tabBarIcon`/`tabBarLabel` on Expo Router bottom tabs | A replacement tab bar or navigation structure | focused/unfocused |
| `VarsDialog` | Blocking confirmation | Destructive confirmation, auto-accept confirmation | Long forms or WebViews | neutral/info/warning/danger, visible/hidden |
| `VarsToast` | Temporary feedback | Undo, offline sync, save confirmation | Permanent banners | neutral/success/warning/danger/info with optional action |
| `VarsSkeleton` | Content-shaped wait | Lists, cards, image placeholders | Financial/KYC confirmation | pulse only; fixed footprint required |
| `VarsIcon` | Single app icon API | All app symbols and tab icons | Brand logo/scissors mark | size/color/name |

Prop conventions across the catalogue: visual style is `variant`, semantic color is `tone`, interaction handlers are `onPress`/`onChange`/`onDismiss`/`onConfirm`, busy state is `loading` (not `isLoading`), theme is passed as `theme` (defaults to light).

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
| Payment: card verification for new customers | Customers with no stored `paystack_authorization_code` complete a one-time, non-refundable ₦50 Paystack WebView checkout before their first booking. On success, `charge.success` webhook stores the `authorization_code` on the customer's profile. All subsequent bookings — and all gate charges — skip this step. The ₦50 is not refundable. Customers see explicit disclosure ("one-time, non-refundable ₦50") before the checkout opens. | Silent gate charges (`chargeAuthorization`) require a stored reusable authorization. The ₦50 step ensures the card is active before the vendor commits to travel, eliminating the retry-window flow for first-time gate charges. |
| Payment: gate-at-departure model | No Paystack charge at booking creation. The charge fires when the vendor commits to travel — via "On My Way" (manual trigger, available within 2 hours of `scheduled_at`) or a proximity trigger in the `send-reminders` cron. Atomic gate claim (`UPDATE WHERE gate_fired=FALSE`) prevents double-fire. Returning customers (stored card): silent `chargeAuthorization`. First-time customers at gate time: `initializeTransaction` → WebView checkout. Both paths converge at `charge.success` webhook, which advances status to `on_way` and sets `gate_charged_at`. | Paystack confirmed that authorisation-not-capture is not supported for NGN transactions. Charging at departure is the correct model: vendor commits first, customer is charged at that moment, no refund is needed for vendor no-shows because nothing was charged. After card verification is complete at booking time, all customers are "returning" at gate time — the first-time gate checkout path is now only reached if the webhook-stored auth_code is missing for some reason. |
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
| Earnings screen: "Cleared" ≠ "in vendor's bank" | The earnings screen labels `completed` bookings as "Cleared" — meaning the vendor's share is in their Paystack subaccount. It does NOT mean the funds have been transferred to their bank account. Bank transfer is a manual VARS ops action (Paystack dashboard → Subaccounts → Settle). `payout_history.status` is always `'settlement_queued'` in practice — `'success'` and `'failed'` are dead values left from the old Transfer API model. `paystack_settlement_reference` exists on `payout_history` but nothing writes to it. When ops tracking for bank-transfer confirmation is needed, flip `status → 'success'` at settle time. | Paystack has no public API to trigger subaccount settlement programmatically. Manual ops trigger means no webhook callback to update the DB. Collapsing "in subaccount" + "in bank" into one bucket avoids showing a bucket that cannot be derived from current data. |
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
  - **Verified** (`status: "found"`, `allValidationPassed: true`): extracts liveness face image (base64 data URI at `data.image`) and legal name (`data.firstName/middleName/lastName`), crops to passport-style 400×400, uploads the raw original to the **private** `vendor-identity-raw` bucket (storage path stored in `profile_image_raw_url`) and the cropped version to the **public** `vendor-identity-images` bucket (public URL stored in `profile_image_url`), sets `kyc_status = verified`, `is_active = true`, `profile_image_locked = true`.
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
| Business registration | Nigerian CAC registration complete — Paystack verification passed July 2026. |
| UK entity | Seyi is based in Maidenhead, UK. A UK limited company can be registered quickly if needed for Stripe or other global payment rails. |
| Domain | bookwithvars.com — registered via Google/Squarespace. DNS pointed at Vercel for landing page. |
| GitHub | github.com/kant1000/vars — private. |
| Hosting | Vercel (landing + admin), Supabase (backend), EAS (mobile builds). |
