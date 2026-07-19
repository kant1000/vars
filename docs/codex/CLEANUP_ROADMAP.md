# VARS Cleanup Roadmap

This roadmap tracks the practical path to make the whole app work as intended.

## Phase 1: Stabilize The Repo

- Resolve the merge conflict in `apps/mobile/package.json`. Done.
- Inspect the `yarn.lock` changes caused by the conflict. Done.
- Decide whether `apps/mobile/dist/` should be ignored or committed. Done: ignore generated export output.
- Decide whether new mobile image assets are source assets or generated artifacts. Done: committed as source assets (`banner.png`, `barbing.png`, `hair.png`, `makeover.png`).
- Review the deletion of `CLAUDE.md` and confirm whether it should stay deleted. Done: restored and committed.
- Add `**/next-env.d.ts` to `.gitignore`. Done.
- Re-run `corepack yarn audit:access`. Done.

## Phase 2: Dependency And Build Health

- Run workspace install/check with the pinned Yarn version. Done.
- Build `apps/admin`. Done — fixed lazy client init + `force-dynamic` on data pages.
- Build `apps/landing`. Passed.
- Lint `apps/mobile`. Done — ESLint flat config added; 0 errors, 16 warnings.
- Fix broken imports, type errors, and package mismatches. Done — `pickAndUploadImage` signature, `AuthSession.parseRedirectResult` removal.
- Confirm all workspace package names and dependency versions are intentional. Done.
- Android JS bundle export validation. Done — 4.9 MB Hermes bundle, 1546 modules.
- Reschedule flow audit and bug fixes. Done — transport buffer cleanup on accept/decline, hourly expiry cron (`reschedule-expire`) created and registered.

## Phase 2b: Landing SEO

- Phase 1 SEO implementation. Done — sitemap, robots, manifest, OG image, privacy page, terms page, canonical, JSON-LD schemas, vercel.json redirect.
- Google Search Console setup. Done — DNS TXT verification, sitemap submitted, 3 pages indexed.

## Phase 2c: Paystack Subaccount Migration

**Status: Complete (June 2026). Pending: sandbox testing + live key swap.**

Split model: vendor's share (80% normal, 100% Pioneer) splits at charge time into their Paystack subaccount. Settlement is manual (VARS ops triggers from Paystack dashboard). Settlement is gated at the vendor level via `settlement_on_hold`.

- Migration `20260624000001_paystack_subaccounts.sql`: adds `paystack_subaccount_code` + `settlement_on_hold` to vendors; adds `paystack_settlement_reference` to payout_history; adds `settlement_queued` enum value. Done.
- `_shared/paystack.ts`: added `createSubaccount`, `triggerSubaccountSettlement` (ops-alert stub — no public Paystack API), updated `initializeTransaction` signature. Done.
- `_shared/constants.ts` + `packages/shared/src/constants.ts`: added `VARS_COMMISSION_PERCENT`, `PIONEER_BOOKINGS_THRESHOLD`. Done (both files in sync).
- `paystack-verify-bank`: save action now creates both Transfer recipient and Paystack subaccount; both codes stored on vendor row. Done.
- `paystack-initialize`: fetches `paystack_subaccount_code`, `pioneer`, `pioneer_bookings_completed`; computes split at init time; passes `subaccount`, `bearer: 'account'`, `transaction_charge: 0` for Pioneer. Done.
- `paystack-webhook`: `handleChargeDispute` now sets `settlement_on_hold = true` on vendor (was: pushed `auto_release_at` 90 days forward). Done.
- `paystack-settle`: full rewrite — sweeps by vendor not booking; gates on `settlement_on_hold` + open disputes; marks COMPLETED + creates `payout_history(settlement_queued)`; Pioneer counter incremented here; calls `triggerSubaccountSettlement` for clear vendors. Done.
- `paystack-release`, `paystack-cancel`, `vendor-cancel-booking`, `vendor-cancel-grace`: clawback manual reconciliation comments added. Done.
- Docs updated. Done.
- **Remaining:** Run full test against Paystack sandbox. Swap `PAYSTACK_SECRET_KEY` to live key once Paystack account activation resolves.

## Phase 2d: Gate-at-Departure Payment Model

**Status: Complete (June 2026). Pending: sandbox testing + live key swap.**

No Paystack charge at booking creation. The charge fires when the vendor commits to travel via "On My Way" (manual) or proximity trigger (automatic). Binary cancellation model: pre-gate cancel is free (no money was ever moved); post-gate cancel locks the customer out and triggers full refund + vendor restriction.

**Important — GATE_PAYMENT_RETRY_WINDOW_MINUTES is a PENDING FOUNDER DECISION.** The constant is currently a placeholder value. It drives a visible countdown shown to customers in the gate-checkout screen. No real number has been chosen. Do not document or assume a specific value until the founder confirms.

`GATE_PROXIMITY_KM = 3` — also a placeholder. Needs product sign-off.

- Migration `20260624000002_gate_payment_model.sql`: adds gate fields to bookings (`gate_fired`, `gate_trigger_type`, `gate_triggered_at`, `gate_charged_at`, `gate_retry_expires_at`); adds `paystack_authorization_code` to profiles; adds restriction fields to vendors (`is_restricted`, `restriction_amount_owed_kobo`, `restriction_reason`, `restriction_repayment_claimed_at`); drops legacy pre-charge fields (`payment_captured`, `paystack_access_code`, tiered-fee columns, `auto_accept_grace_expires_at`). Done.
- `paystack-gate`: new edge function. Manual/proximity trigger, atomic gate claim (`UPDATE WHERE gate_fired=FALSE RETURNING id`). Returning customers → `chargeAuthorization`; first-time → `initializeTransaction` + push. `openRetryWindow` handles failed charges. Done. **Do not modify.**
- `paystack-gate-checkout`: new endpoint. Customer calls for a fresh `access_code` when opening app after gate push. Returns 409 if already charged, 410 if expired. Done.
- `vendor-claim-repayment`: new endpoint. Restricted vendor taps "I've paid". Sets `restriction_repayment_claimed_at`. Idempotent. Admin confirms and lifts restriction. Done.
- `paystack-release`: cron now runs two sweeps — (1) pending timeout (pre-existing), (2) gate-fired accepted bookings where `gate_retry_expires_at` has passed and `gate_charged_at` is null. Sweep 2 cancels the booking (no Paystack call), notifies both parties. Done.
- `paystack-cancel`: rewritten. Binary model — pre-gate = free cancel; post-gate = 409 lock. Done.
- `vendor-cancel-booking`: rewritten. Post-gate vendor cancel triggers full Paystack refund + sets vendor restricted with amount owed. Done.
- `paystack-settle`: cron skips `is_restricted = true` vendors (alongside `settlement_on_hold`). Done.
- `paystack-initialize`: no longer initialises a Paystack transaction. Creates booking only, returns `booking_id`. Split ratio computed at gate time. Done.
- `paystack-webhook`: `charge.success` finds booking by `paystack_reference` (set at gate time), advances to `on_way`, sets `gate_charged_at`. Stores `paystack_authorization_code` on profile for returning customers. Done.
- `send-reminders`: added gate nudge (5 min before gate window closes) + proximity trigger (calls `paystack-gate` if vendor within `GATE_PROXIMITY_KM` of customer). Done.
- `_shared/notifications.ts`: gate messages added (`msg_gatePaymentNeeded`, `msg_gatePaymentFailed`, `msg_gatePaymentExpired`, `msg_vendor_gatePaymentPending`, `msg_vendor_gateCharged`, `msg_vendor_gatePaymentExpired`, `msg_vendor_restricted`, `msg_vendor_restrictionLifted`, `msg_vendor_onWayNudge`). Tiered-fee messages removed. Done.
- Mobile gate-checkout screen (`/booking/gate-checkout/[bookingId]`): new screen for first-time customer checkout at gate time. Phases: loading → checkout (WebView) → confirming → cancelled/expired/error. Done.
- Mobile bookings screen: gate payment banner ("Complete payment") + "Confirming payment" state for poll-timeout case. Done.
- Mobile vendor jobs screen: "On My Way" button (gate-window gated), "Confirming payment" banner, vendor restriction wall with repayment CTA. Done.
- Admin restrictions page (`/restrictions`): lists restricted vendors, shows "Awaiting review" (claimed repayment) vs "Not yet claimed" queues. Admin lifts via `liftRestriction` server action. Done.
- **Remaining:** Run full end-to-end test against Paystack sandbox (including `chargeAuthorization` for returning customers, `initializeTransaction` WebView for first-timers, webhook handling, `paystack-release` gate-expiry sweep). Swap `PAYSTACK_SECRET_KEY` to live key once Paystack account activation resolves.

## Phase 3: Supabase Health

- Review all migrations in order.
- Confirm generated shared database types are current (note: `database.types.ts` is auto-generated — never edit manually).
- Audit Edge Function env requirements.
- Check booking, payment, cancellation, reschedule, dispute, KYC, and notification functions.
- Run local Supabase reset if local environment is ready.

## Phase 4: App Flow Verification

- Verify mobile auth flow.
- Verify customer booking flow.
- Verify vendor onboarding/KYC flow.
- Verify vendor scheduling and reschedule flow.
- Verify admin login and dashboard views.
- Verify payment initialization, capture, settlement, cancellation, and disputes with test keys. Blocked until payment credentials are activated.
- Verify offline/resilience behavior in mobile.

## Phase 5: Product Polish

- Remove dead screens, dead utilities, and duplicate code.
- Align shared constants and types across apps.
- Normalize loading, error, empty, and offline states.
- Check mobile assets, splash behavior, and app config.
- Check admin and landing responsive layouts.

## Phase 6: Delivery

- Create a cleanup branch with the `codex/` prefix if requested.
- Commit in small batches by area.
- Push and open a PR if GitHub write access is available.
- Keep `docs/codex/PROJECT_HANDOFF.md` updated with major decisions.

## Phase 2b+ Work Done (May 2026)

- Pioneer cohort complete. Landing page (`PioneerSection.tsx`) transitioned from pioneer/waitlist acquisition flow to a single static stylist registration form. All pioneer-specific conditions and dead CSS removed. Done — `e7fcc49`.
- **Wide Awake blog** launched at `bookwithvars.com/blog`. New route in `apps/landing/src/app/blog/` with article index, individual article pages (`[slug]/`), reading progress bar, mid-article CTA, comment system, and cross-article related links. Content defined in `articles.ts` — no CMS. 3 live articles. Done.
- Mobile: `react-native` `Image` replaced with `expo-image` across the app for WebP support and automatic caching. Done — `fcc61bf`.
- Landing page shifted from pioneer acquisition framing to Phase 2 general stylist/customer marketing copy. Done — `e85eff3`, `da27c41`.

## Phase 2b++ Work Done (May 2026 — continued)

- **Android profile photo upload fix** (`apps/mobile/lib/storage.ts`): `fetch('file://...')` fails silently on Android. `uploadProfilePhotoFromUri` now uses `expo-file-system.readAsStringAsync` (base64) → `Uint8Array` → Supabase Storage upload. Done.
- **ScissorsLoader size reduction**: All three sizes reduced by one-third — small 35→23px, medium 58→39px, large 92→61px. Container sizes at call sites unchanged. Done.
- **Vendor cold-launch routing fix** (`app/_layout.tsx`): Returning authenticated vendors were routed to `/(tabs)` (customer). Root layout now queries `vendors` table after auth resolves; vendors route to `/(vendor-tabs)`, customers to `/(tabs)`. Done.
- **Root `.env.local` mobile vars**: `expo run:android` from repo root reads `.env.local` from CWD, not `apps/mobile/.env`. All `EXPO_PUBLIC_*` vars added to root `.env.local`. Done.
- **Monochrome design system** (`constants/colors.ts`, all vendor tab screens): Implemented the monochrome shell + colour-as-glyph design system. New token layer (`ink`, `inkMuted`, `inkFaint`, `accentBlue/Amber/Green/Red`, `white`) added alongside legacy tokens. Vendor screens migrated: slot grid (4→2 columns, 60px height, all fills removed), state glyphs positioned absolute, booked slots (blue fill→transparent+6px blue dot), online pill (green fill→transparent+dot), tab bar (blue active→black), avatar (blue fill→black), zone card (gold fill→transparent+ink border), earnings cards (grey fill→transparent+ink border), all primary CTAs (blue fill→black). `docs/MONOCHROME_DESIGN_SYSTEM.md` deleted — now live in code. Done.

## Phase 2b+++ Work Done (May/June 2026)

- **Vendor trust layer — identity image locking**: The liveness photo captured by Youverify during KYC is now the vendor's permanent, locked profile picture across all surfaces (discovery feed, vendor public profile, vendor profile screen, admin panel). `vendor-kyc-webhook` extracts the face image from the Youverify payload, uploads raw + passport-cropped versions to the new `vendor-identity-images` storage bucket, and sets `profile_image_url` / `profile_image_raw_url` / `profile_image_locked` on the vendor row. RLS (`vendors_update_own` WITH CHECK via correlated subquery) blocks vendor clients from writing to those columns — service role only. `get_nearby_vendors` updated to return `profile_image_url`. Vendor photo upload removed from onboarding step 1 and the vendor profile screen. Admin vendors panel shows both the cropped profile circle and the raw liveness image for audit. Migration: `20260531000001_vendor_trust_layer`. Done.

- **Distance-based transport surcharge + pre-booking buffers + vendor earnings display**: When a customer books a vendor beyond the 5 km base radius, a distance-based surcharge (₦3,000–₦10,000 in four tiers) is added to the Paystack charge. Server-side Haversine calculation in `paystack-initialize` — client never trusted. Surcharge passed through Paystack metadata, stored on booking row (`transport_fee_kobo`, `distance_km`, `pre_transport_buffer_slots`). Settlement (80/20 split + Pioneer waiver), cancellation fees, and refunds all operate on total charged amount. Pre-booking `transport_buffer` calendar slots inserted before the booking (1 or 2 × 30 min, tier-driven, clamped to 07:00 UTC working-hours floor) using the existing `transport_buffer_source_booking_id` FK — cancel functions clean up pre + post buffers automatically with no changes. Vendor acceptance cards redesigned with prominent "YOUR EARNINGS FOR THIS JOB" block including Pioneer awareness. Customer booking review (Step 3 Location) shows updated total + soft explanatory note. `msg_vendor_newBooking` notification updated with earnings figure. Tier constants in `_shared/constants.ts` (Deno) and `packages/shared/src/constants.ts` (mobile) — single source of truth, no inline hardcoding. Migration: `20260531000002_transport_surcharge`. Done — `BASE_RADIUS_KM = 5` documented in both constants files.

## Phase 2b++++ Work Done (June 2026)

- **Price scroll picker** (`components/VendorPriceInput.tsx`): Replaced the free-text `TextInput` with a tappable row that opens a `BottomSheetModal` + native `Picker` wheel (₦10,000–₦999,000 in ₦1,000 steps). Same `value`/`onChangeText` interface preserved — call sites unchanged. Travel cost hint added below the component in both vendor onboarding step 2 and vendor-services/add. Done.

- **Vendor profile redesign** (`app/vendor/[id].tsx`): Replaced the old hero + tabs layout with a compact side-by-side profile row (72px avatar + info), portfolio photo carousel (approved photos only, pagingEnabled FlatList + dot indicators, tap-to-expand via `react-native-image-viewing` lightbox), and a sticky Services | Reviews tab row. Portfolio tab removed — carousel covers it. Services are the default tab; swipe left/right via PanResponder switches tabs without conflicting with vertical scroll. Floating back/fav buttons with semi-transparent pill background. Customers never see online/offline status — only "Typically accepts in X" derived from `avg_response_minutes`. `react-native-image-viewing@0.2.2` and `@react-native-picker/picker@2.11.4` added as native packages — new dev build required.

- **Online = visibility + go-live checklist** (`app/(vendor-tabs)/index.tsx`): Going online sets `is_online = true` in the `vendors` table; `get_nearby_vendors` now filters `is_online = TRUE` so offline vendors are invisible to customers. Three prerequisites gate the go-live toggle: KYC verified, ≥1 active service, device notifications granted. The single most relevant unmet condition is shown as a banner with a Settings deep-link for the notification case. Auto-offline: all 3 conditions are checked every 2 minutes while online (`setInterval`) and on every screen focus return (`useFocusEffect`); if any fail, `is_online` is set to `false` in DB and state. Done — commits `93166b5`, `8a82670`.

- **`avg_response_minutes` EMA trigger** (`supabase/migrations/20260603000002_online_visibility_and_response_time.sql`): New `INT` column on `vendors`; exponential moving average (80/20) updated by `trg_vendor_response_time` trigger on `pending → accepted` status changes (auto-accepted bookings excluded). Displayed on vendor profile as "Typically accepts in under 15 min / 30 min / within 1 hour". **Pending: apply this migration to remote Supabase.** Done.

- **Schedule crash fix — hooks-after-early-return** (`app/(vendor-tabs)/schedule.tsx`): `useRef` and `useEffect` for the slot scroll position were declared after an `if (loading) return` early return, violating React Rules of Hooks and causing a blank white screen. Fixed by moving `const slots = generateSlots(selectedDay)`, `slotScrollRef`, and the scroll `useEffect` above the early return. Pure derived values (selectedDayStr, autoAcceptActiveForDay, etc.) are not hooks and remain after. Done.

- **Schedule slot icon system** (`app/(vendor-tabs)/schedule.tsx`, `components/icons.tsx`): Added green `CheckIcon` (✓) for available slots — same stroke style as the red `CloseIcon` (✕). Auto-accept (`⚡`) changed from black to `Colors.success` green in both the slot grid and the header Auto-accept button (text stays black). Legend updated to four states: green ✓ Available, red ✕ Blocked, green ⚡ Auto-accept, thick black fill Booked. `EyeIcon` and `EyeOffIcon` added to `components/icons.tsx`. Done.

- **Vendor profile screen** (`app/(vendor-tabs)/profile.tsx`): Portfolio section moved before My Services. "Long-press a row to reorder" hint line removed entirely. Portfolio redesigned from flex-wrap 3-column grid to horizontal `ScrollView` with "Add photo" tile always first on the left (hidden at 10/10 photos). WCAG accessibility: `heroEditBtn` padding increased (touch area ~36px → ~46px), `photoDeleteBtn` `hitSlop={11}` (22×22 → 44×44 effective area). Done.

- **Login screen accessibility** (`app/auth/login.tsx`): STYLIST LOGIN link `paddingBottom: 8` (~21px touch target) replaced with `paddingVertical: 14` (~41px). Done.

- **Earnings screen Stage 1** (`app/(vendor-tabs)/earnings.tsx`): Full rewrite. Period filter (Today / This week / This month / All time); earnings hero card with period total + paid/confirming split; hide-balance eye toggle (Nigerian fintech privacy convention); booking-level FlatList showing client name, service, date/time, amount, and status pill (Paid in green / Confirming in amber). Data sourced from `bookings` with `status IN (service_rendered, completed)`, gross `service_price_kobo`. Stage 2 items identified: weekly goal progress bar, bar chart, revenue-by-service breakdown. Done.

## Phase 2b+++++ Work Done (June 2026)

- **Schedule UX — block/unblock range + legend hints** (`app/(vendor-tabs)/schedule.tsx`, `vendor-services/add.tsx`): Three improvements from a moderated vendor user test. (1) Add-service screen: context copy "Tell us what you do. Customers will book you to come to their home." added below the title — addresses vendors naming their service after the category rather than the actual service. (2) Schedule legend: "What the slots mean" heading + "Tap any slot to block or unblock it." hint; "Block a range" underlined link in the legend footer. (3) `BlockRangeSheet` component: Block | Unblock mode toggle; From/To 30-min time chip pickers; Mon–Sun day-of-week chips; Just this week / Until a date repeat modes (flash-calendar picker, 8-week cap); live slot count preview; batch writes/deletes to `vendor_calendar` (skips active bookings + `transport_buffer` rows); 10-second undo toast — block undo deletes inserted rows and reverts any `auto_accept` rows; unblock undo re-inserts deleted rows. Done.

## Phase 2b++++++ Work Done (June 2026)

- **Youverify KYC webhook hardening** (`supabase/functions/vendor-kyc-webhook/index.ts`, `apps/mobile/app/vendor-onboarding/step-4-kyc.tsx`): Fixed two critical bugs discovered from Youverify API docs review. (1) Status detection: KYC Link flow sends `status: "found"` + `allValidationPassed` boolean — not `success/verified/approved`. Previous code classified every webhook as intermediate and silently ignored it; no vendor would ever have been verified or rejected. (2) Face image format: Youverify sends the liveness image as a base64 data URI (`data:image/jpg;base64,...`) at `data.image` — not an HTTP URL. Previous code checked `startsWith('http')` and always skipped it; every vendor would go live with no locked profile photo. Added GET API fallback (`GET /v2/api/identity/:id`) when webhook payload is thin. If both webhook and GET miss image or name, sets `kyc_status = needs_review` — vendor stays unverified, admin resolves via Youverify dashboard. `needs_review` added to `kyc_status_enum` (migration `20260619000001`). Mobile KYC screen handles `needs_review` with a "Confirming your details" callout (no retry button). Done. Also: Youverify production credentials activated (19 June 2026) — `YOUVERIFY_API_KEY`, `YOUVERIFY_BASE_URL`, `YOUVERIFY_WEBHOOK_SECRET` all set in Supabase secrets; webhook URL configured in Youverify dashboard.

## Phase 2b+++++++ Work Done (June 2026)

- **Schedule calendar overhaul** (`app/(vendor-tabs)/schedule.tsx`): Complete UX rebuild of vendor schedule navigation and blocking. (1) **Day navigation**: replaced 14-chip horizontal scroll strip with a ◀ date label ▶ arrow header; fixed-width label (`minWidth: 200`) shows "Today" or "Weekday, DD Mon"; tapping opens a `react-native-calendars` monthly modal (pure JS — avoids native module crash pattern); days within the 14-day window are always shown in full colour and tappable via a custom `dayComponent` (overrides react-native-calendars' disabled-extra-day state for next-month overflow cells); fully-blocked days show a red dot. Label shows "Tomorrow" instead of "Today" when it's past 22:00 (effective day has advanced to the next calendar date). (2) **Block / Unblock day**: single context-aware button replaces 2-line legend — blocks/unblocks only future unbooked slots; 3-second undo toast (was 10 s); "Go to today" / "Go to tomorrow" button appears alongside when not on the first day. (3) **Block a range in the modal**: long-press any calendar day starts range selection; Block button appears immediately (single-day range valid); tap a second day extends it; auto-detects block vs unblock from current slot state. Stale-closure fix: `rangeStartRef` updated synchronously in `onDayLongPress` so `onDayPress` reads the correct value before React re-renders. (4) **Recurring weekly blocks**: "BLOCK EVERY" Mon–Sun chip row at the bottom of the calendar modal; tap to add a weekday rule (applies immediately to 14-day window + reapplies to new days on each focus); tap to remove (clears future unbooked blocks for that weekday). Multiple weekdays, no end date. DB: `add_recurring_block_weekdays_to_vendors` migration adds `recurring_block_weekdays integer[] DEFAULT '{}'` to `vendors`. `react-native-calendars` added to mobile deps. Done.

## Phase 2b++++++++ Work Done (June 2026)

- **Auto-accept phantom block check removed** (`supabase/functions/paystack-webhook/index.ts` v29, `supabase/functions/paystack-initialize/index.ts` v24): Root cause of auto-accept never firing. The `checkAutoAccept` function queried `vendor_calendar` for rows with `block_state = 'auto_accept'` — a block state that no code path ever writes. Auto-accept is now day-level: webhook checks `auto_accept_enabled`, `auto_accept_paused_due_to_drift`, `auto_accept_zone_confirmed_date` matches UTC today or booking date, user within zone radius, and `isSlotFree`. Done.

- **`vendor-set-zone` atomic confirmed_date write** (`supabase/functions/vendor-set-zone/index.ts` v17): Previously, zone setup made two sequential fetch calls — `vendor-set-zone` then `vendor-confirm-zone` — creating a race condition where a concurrent set-zone call could reset `confirmed_date` before confirm-zone wrote it. `vendor-set-zone` now accepts `effective_date` in its POST body; when `auto_accept_enabled = true` and `effective_date` is within ±1 day of UTC today, `confirmed_date` is written atomically in the same DB update. The separate `vendor-confirm-zone` call is no longer made from zone setup. Done.

- **`vendor-zone-setup.tsx` parallel load** (`apps/mobile/app/vendor-zone-setup.tsx`): Location permission + GPS fetch and DB vendor fetch now run in parallel via `Promise.all`, cutting worst-case open time from ~5s (GPS 4s + DB 1s sequential) to ~4s (parallel). DB zone centre takes precedence over GPS for pin placement; GPS only used if no saved zone exists. Done.

- **`vendor-zone-setup.tsx` location hang fix** (`apps/mobile/app/vendor-zone-setup.tsx`): `Location.getCurrentPositionAsync` hangs indefinitely indoors. Replaced with `getLastKnownPositionAsync` (instant cache hit) + `Promise.race` 4-second timeout fallback. Done.

- **Schedule calendar/list toggle removed** (`app/(vendor-tabs)/schedule.tsx`): The list view was a duplicate of the Jobs tab (`index.tsx`). Removed: `viewMode` state, `AsyncStorage` persistence, `STORAGE_KEY`, `handleViewMode`, `loadListBookings` callback and its `useEffect`, `listBookings`/`listLoading`/`listRefreshing` state, the toggle UI (`toggleRow` + two `TouchableOpacity` buttons), the `FlatList` list branch, and all list-specific styles. Calendar is now the only view. Real-time subscription and `onAction` callbacks updated accordingly. Done.

## Phase 2b+++++++++ Work Done (July 2026)

- **Vendor onboarding UX overhaul** (multiple files): End-to-end rework of the vendor onboarding journey. Key changes: (1) `step-1-profile.tsx` — label "Full name" → "Display name" with KYC caption; field order reordered to required-before-optional; display name, phone, and email pre-fill from vendor row; phone and email rendered as visually locked read-only rows (`Colors.surface` background, "Locked" badge pill, caption) — not editable and not included in the `vendors.update()` payload. (2) `step-2-services.tsx` — `DURATION_OPTIONS` explicit array replaces computed formula; L1 category pre-selected from `lead_service_type` on vendor row. (3) `step-3-portfolio.tsx` — guidance card above photo grid; consent checkbox ("These are photos of my own professional work") gating the CTA. (4) `step-4-kyc.tsx` — modal replaced by inline two-sub-step structure (bank first, KYC second) with dot progress indicator; prep card before Youverify WebView; mount effect skips to correct sub-step on resume. (5) `step-5-pending.tsx` — copy split by `pending / needs_review / verified`; animated `CheckRow` dots replace emoji checklist; polls on mount + every 8s; routes to `/(vendor-tabs)/profile` on verification. (6) `_layout.tsx` — Pioneer banner (black pill, white text) shown when `vendors.pioneer = TRUE` via `VendorOnboardingContext`; progress bar hidden on step 5. New file: `contexts/VendorOnboardingContext.tsx`. Done.

- **Lead pre-fill trigger** (`supabase/migrations/20260705000002_trigger_prefill_vendor_from_lead.sql`): Replaces `transfer_pioneer_from_lead()` — now copies `full_name`, `phone_number`, `lead_service_type` from matching `vendor_leads` row on vendor INSERT (not just pioneer leads); matches by email first, then normalised phone; pioneer flag granted only for pioneer leads; lead marked `converted = TRUE`. Adds `lead_service_type TEXT` column to `vendors`. Done.

- **Phone normalisation + vendor identity check** (`supabase/migrations/20260705000003_fn_check_vendor_identity.sql`, `supabase/functions/vendor-check-identity/index.ts`): `normalise_nigerian_phone(TEXT)` SQL helper (handles `080…`, `234…`, `+234…` → E.164); `check_vendor_identity(p_email, p_phone)` SECURITY DEFINER function querying `auth.users JOIN vendors` and `vendor_leads`; `transfer_pioneer_from_lead` patched to normalise phone before comparison (closes the silent normalisation mismatch bug). Public edge function `vendor-check-identity` calls the RPC and returns `has_account | lead_only | not_found`. Done.

- **Vendor auth redesign** (`apps/mobile/app/auth/vendor-login.tsx`): Full rewrite. Email OTP primary (phone OTP greyed out + "Soon" — not yet built). Flow: enter email → `vendor-check-identity` → has_account (password form + "Send me a code instead") | lead_only (OTP → create password → onboarding) | not_found (error + link to bookwithvars.com). `vars_onboarding_done` set on every successful auth path. `routeToVendorState` resumes at the correct onboarding step using DB state. Done.

- **Cold-start vendor routing fix** (`apps/mobile/app/_layout.tsx`): Authenticated vendors without `vars_onboarding_done` in AsyncStorage were routed to customer onboarding on every cold launch. Fixed by moving the vendor DB check before the `onboardingDone` gate; vendor check now sets `vars_onboarding_done` automatically as a side-effect. Resume logic bug fixed: `kyc_status = null | rejected` → step 4 (not step 5). Post-onboarding destination changed from `/(vendor-tabs)` (empty jobs dashboard) to `/(vendor-tabs)/profile`. Done.

- **Step-4 KYC resume fix** (`apps/mobile/app/vendor-onboarding/step-4-kyc.tsx`): Mount effect now detects `kyc_status = null` + `paystack_subaccount_code` exists (bank done, WebView never submitted) and skips to KYC sub-step directly rather than leaving the vendor on bank sub-step. Done.

- **Profile tab — schedule nudge** (`apps/mobile/app/(vendor-tabs)/profile.tsx`): Dark nudge card shown on first profile visit after verification: "Set your availability — customers can only book slots you've opened." CTA navigates to the schedule tab and persists dismissal to `vars_schedule_nudge_done` in AsyncStorage. Shows until dismissed. Done.

- **Image upload standardisation** (`apps/mobile/lib/storage.ts`, `apps/mobile/package.json`): All image upload paths now enforce a 1024×1024 JPEG at 80% quality via `expo-image-manipulator@57.0.2` (`resizeToSquare` helper). OS picker uses `allowsEditing: true` + `aspect: [1, 1]` — user pans/zooms to choose their square crop, image is not distorted. `quality: 1` on the picker defers compression entirely to `manipulateAsync`. File extension hardened to `.jpg` regardless of source format (HEIC, etc.). `pickAndUploadPortfolioPhotos` (multi-select) deleted — multi-select is never used. All callers: `pickAndUploadImage`, `uploadSinglePortfolioPhoto`, `uploadProfilePhotoFromUri`. Reduces typical upload from 3–5 MB to ~80–150 KB. New dev build required for `expo-image-manipulator` native module. Done.

- **Portfolio storage RLS policies** (`supabase/migrations/20260705000004_portfolio_storage_policies.sql`): Four RLS policies for the `portfolio` storage bucket — vendor INSERT/UPDATE/DELETE scoped to own `vendors/{uid}/portfolio/` path, public SELECT. Done.

- **`vendor_leads` E.164 phone backfill** (`supabase/migrations/20260706000001_normalize_vendor_leads_phone_e164.sql`): One-time data migration normalising all `vendor_leads.phone` values to E.164. Three rules: strip non-digits after `+` for already-prefixed numbers; local 11-digit Nigerian (`0XXXXXXXXXX`) → `+234XXXXXXXXXX`; 10-digit missing leading zero → `+234XXXXXXXXXX`. Applied to remote — 408/409 entries corrected; 1 anomalous entry (`88142357580`) manually updated. Done.

- **Vendor Settings screen** (`apps/mobile/app/(vendor-tabs)/settings.tsx`, `profile.tsx`, `_layout.tsx`, `icons.tsx`): New dedicated Settings screen replacing the single "Sign out" Account section in the profile tab. Gear icon (`GearIcon` added to icons.tsx) replaces the pen icon next to the vendor display name — tapping navigates to `/(vendor-tabs)/settings` (hidden from tab bar via `href: null`). Sections: (1) Account — display name editable (Save button appears only when dirty, syncs to `vendors.full_name`), email and phone read-only locked rows. (2) Security — change password via `pageSheet` modal (new/confirm fields, Show/Hide toggles, calls `supabase.auth.updateUser`); biometric lock toggle (shown only when `hasHardwareAsync && isEnrolledAsync`, requires biometric confirm to enable, preference stored as `vars_biometric_lock` in AsyncStorage — enforcement gate in `_layout.tsx` still TODO); sign out with confirmation Alert. (3) Payout details — bank name, masked account number (all but last 4 replaced with `•`), account name from `vendors` row; "No bank account connected" state. (4) Support — placeholder row (TODO: scope channel). (5) Legal — Terms + Privacy via `expo-web-browser`. `expo-local-authentication@57.0.0` added — new dev build required. Done.

- **Customer UI design system alignment** (13 customer screens): Full visual parity pass aligning all customer-facing screens to the monochrome design system established on vendor screens. Every screen now uses `Colors.ink` (#111111) for primary CTA fills (not `Colors.primary` blue), `Colors.white` for CTA text, `opacity: 0.5` for disabled states (no `backgroundColor` changes), `borderWidth: 1.5` for text inputs, `Colors.overlay` for modal backdrops, and `Colors.white`/`Colors.inkMuted` tokens instead of raw `'#FFF'`/`'#6B7280'` hex. Status chip `+ '18'` suffix normalised (was `+ '20'`). Empty state titles `fontSize: 20`. Destructive secondary buttons (`cancelBtn`, `declineBtn`) keep `Colors.error` border/text per intentional override. Notification unread rows use `Colors.surface` (not a primary fill). `StarFilledIcon`/`StarEmptyIcon` icon components replace `'★'` text characters in vendor profile star display. Screens touched: `(tabs)/_layout`, `(tabs)/index`, `(tabs)/bookings`, `(tabs)/notifications`, `(tabs)/profile`, `onboarding`, `vendor/[id]`, `consent/[photoId]`, `review/[bookingId]`, `booking/gate-checkout/[bookingId]`, `live/[bookingId]`, `booking/[vendorId]`, `booking/detail/[bookingId]`. Done.

## Phase 2b++++++++++ Work Done (July 2026)

- **Auth trigger `search_path` fix** (`supabase/migrations/20260707000001_fix_trigger_search_path.sql`): `supabase_auth_admin` (GoTrue's DB role) has `rolconfig = ['search_path=auth']`. `fn_handle_new_user` and `transfer_pioneer_from_lead` lacked `SET search_path = public`, so unqualified table names (`vendors`, `profiles`, `vendor_leads`) resolved to the `auth` schema and were not found — causing "Database error saving new user" on every OTP signup attempt. Both functions rebuilt with `SECURITY DEFINER SET search_path = public`. Applied directly to remote via `supabase db query --linked` (remote migration versions are timestamp-based and do not match local sequential filenames; `supabase db push` rejects the diff). Done.

- **Vendor auth + onboarding design system enforcement** (8 screens): Full `Colors.primary` audit and fix pass across all vendor entry surfaces. Every blue `#0A7AFF` fill, border, or non-accent text replaced with `Colors.ink` (`#111111`). All `'#FFF'` → `Colors.white`. All inline `borderRadius: 5` → `BORDER_RADIUS` constant (import added where missing). Screens fixed: `auth/vendor-login.tsx` (back text, wordmark, CTA, secondary link), `auth/login.tsx` (wordmark, submit CTA; BORDER_RADIUS added to import; 4 inline values), `vendor-onboarding/_layout.tsx` (progress bar fill, segment borderRadius, pioneer banner text), `step-1-profile.tsx` (location placeholder text), `step-2-services.tsx` (category pills, duration chips, next CTA; BORDER_RADIUS import added; 5 inline values), `step-3-portfolio.tsx` (add icon, consent checkbox fill/border), `step-4-kyc.tsx` (sub-step dot/label, KYC button, verify button, main CTA, cancel overlay text), `step-5-pending.tsx` (pulsing orb, main CTA). Done.

- **Bank picker duplicate key fix** (`vendor-onboarding/step-4-kyc.tsx`): Paystack bank list API returns duplicate `code` values in some responses, causing a React "Encountered two children with the same key" warning in the picker list. Banks are now deduplicated by `code` before `setBanks`. Done.

- **Vendor content sanitization — text inputs** (`apps/mobile/lib/format.ts`, `app/vendor-onboarding/step-1-profile.tsx`, `step-2-services.tsx`, `app/vendor-services/add.tsx`, `app/vendor-services/edit.tsx`, `app/vendor/[id].tsx`): `sanitizeContent(text, maxLen)` strips `@` symbols, spaced digit clusters matching phone-number patterns (`(\d[\s.\-]{0,2}){7,}`), and 5+ consecutive digits (4 allowed — permits years like 2025); enforces a max 8 total-digit backstop. Applied at input time on bio (150 char), service name (20 char), and service description (60 char) across onboarding and post-onboarding service add/edit flows. Also applied at display time in `vendor/[id].tsx` to sanitise legacy DB values written before the filter existed. Address/access fields in `booking/[vendorId].tsx` and `booking/detail/[bookingId].tsx` use a local `sanitize` with a 7+ digit threshold (allows 4-digit gate codes). Done.

- **Portfolio image contact detection** (`apps/mobile/lib/ocr.ts`, `apps/mobile/lib/storage.ts`): `imageContainsContact(uri)` runs on-device OCR via `expo-text-extractor@2.0.0` (Expo Modules / JSI; Apple Vision on iOS — zero model bundle delta; Google ML Kit on Android — ~4 MB). Detects Nigerian phone patterns, 7+ digit sequences, and `@`-prefixed social handles. Called inside `uploadSinglePortfolioPhoto` after image pick and before resize/upload — covers both the onboarding portfolio step and the post-onboarding profile portfolio tab. On detection throws: *"Photos can't include contact details like phone numbers or handles. Try a different one."* OCR errors return `false` (allow through) to prevent false blocks from library failures. Requires new EAS dev build to activate. Done.

## Phase 2b+++++++++++ Work Done (July 2026)

- **Dark-mode theme wiring — app-wide, complete**: Found that `ThemeProvider`/appearance-override infrastructure worked in isolation but no screen actually used `theme.color.*` for its own styling — toggling dark mode changed nothing except the Appearance screen's own switches. Wired live theme tokens into every screen and shared component across the app (~40 files, 9 phases) via `useVarsTheme()` + `useMemo(() => makeStyles(theme), [theme])`. Unified `accentRed`/error to `#DC2626` everywhere (was split `#EF4444`/`#DC2626` between the static and theme systems); collapsed the static system's two muted-text tiers (`textSecondary`, `textMuted`) into the theme's single `inkMuted`. Deliberately left static: per-status semantic color maps, brand accent colors (Google/Facebook buttons, pioneer gold), fixed-warning banners, and fixed-contrast overlays on photos/maps/WebViews. Full phase log: `docs/audit/mobile.md` §10; locked conventions: `docs/VARS_PROJECT_CONTEXT.md` Visual System table. Done.

- **ScissorsLoader dark-mode contrast fix**: `ScissorsLoader`'s `color` prop (`'light' | 'dark'`, a fixed SVG fill, not a theme token) was hardcoded at every call site app-wide, making loading spinners invisible whenever their surrounding surface inverted in dark mode (full-screen gates on `theme.color.bg`, and small spinners inside `theme.color.ink`-filled buttons, since `ink` itself flips between near-black and near-white per theme). Fixed by flipping the color inline per call site based on `theme.appearance`, matched to each spinner's sibling text/icon color rather than guessed. Also standardized all full-screen loading gates to `size="large"` (six were inconsistently `small`/`medium`) and replaced the raw `Switch` on the biometric-unlock and auto-accept toggles with the `VarsSwitch` primitive. Done.

- **Native `Alert.alert` confirmations replaced with themed `ConfirmModal`**: `Alert.alert` renders as the OS-native dialog, which follows the phone's system appearance rather than the app's own theme override — so it stayed white whenever the app was forced into dark mode while the OS stayed light. Fixed for sign-out (customer + vendor), "My favourites"/"Notification preferences" coming-soon placeholders, and the vendor schedule's "Go online first" auto-accept gate — all now use `components/ConfirmModal.tsx` (added single-button info-dialog support via `dismissLabel: null`). Also consolidated two hand-rolled duplicate modals (booking cancel confirmation, reschedule accept/decline) onto `ConfirmModal`, extending it with `confirmLoading` and `dismissOnBackdropPress` to preserve their exact prior behavior. Audited the other ~9 custom `<Modal>` instances in the app — all already theme-correct, left as-is since they're form/multi-stage UIs, not confirm-dialog duplicates. Found `VarsDialog` (a fuller-featured confirm-dialog primitive in the `Vars*` catalogue) has never actually been adopted anywhere — `ConfirmModal` is the de facto standard; flagged as a known architecture deviation in `docs/VARS_PROJECT_CONTEXT.md` rather than silently papered over. Done.

- **Privacy and Data screen cleanup + customer Terms/Privacy screens** (`apps/mobile/app/privacy-data.tsx`, new `terms.tsx`/`privacy.tsx`): Removed "Marketing messages: Off" — no marketing-send feature exists for logged-in users (no DB column, no edge function), so the row implied a control that did nothing. Removed "Cookie and Tracking Policy" — no in-app equivalent, doesn't meaningfully apply to a native app. Customers had no in-app Terms of Use or Privacy Policy screen at all (vendors already have `vendor-terms.tsx`/`vendor-privacy.tsx`) — every customer-facing legal link opened the public website. Added native `terms.tsx`/`privacy.tsx`, adapted from the live website copy and scoped to what's customer-relevant; rewired `terms-acceptance.tsx` and `privacy-data.tsx` to route in-app instead of externally. For vendors, the redundant "Privacy Policy" row in Privacy and Data (which pointed at the general website page, a different document than the one they actually accepted in-app) is now hidden — they already have it via Settings > Legal. Done.

- **Review screen "Booking not found" fixed** (`apps/mobile/app/review/[bookingId].tsx`): The booking fetch destructured only `data` and silently swallowed `error`, so any failure (RLS, network, actual missing row) rendered the same generic "Booking not found." Now distinguishes a genuine no-match (`PGRST116`) from a real error, logs the real one, and offers a retry action. Done.

- **Avatars storage bucket had zero RLS policies** (`supabase/migrations/20260718000001_avatars_storage_policies.sql`): The `avatars` bucket existed (`public = true`, created outside any migration) but had no `storage.objects` policies at all, so every customer profile-photo upload was rejected by default-deny RLS with "new row violates row-level security policy." Added insert/update/delete/read policies scoped to `users/{user_uid}/...`, mirroring the `portfolio` bucket's shape. Applied directly to the live project. Done.

- **Customer forgot-password flow added** (`apps/mobile/app/auth/login.tsx`): Customer login had no password-recovery path at all (vendor login already has one). Added a "Forgot password?" link on the sign-in form: email OTP → verify → set a new password directly, since customers have no other screen to change a password (unlike vendor-login's forgot flow, which just signs the vendor in via OTP and leaves the old password intact). `signInWithOtp` called with `shouldCreateUser: false` so a mistyped email surfaces as an error instead of silently provisioning a new blank account. Done.

- **Support replaced by Customer Care** (`apps/mobile/components/CustomerCareScreen.tsx`): the old vendor-only "Get help" WhatsApp/Email picker (`handleSupportWhatsApp`/`handleSupportEmail` in `vendor-settings.tsx`, referenced below as the earlier resolution of this item) is gone. Both sides now get a shared Customer Care screen: an audience-filtered searchable bubble grid (`constants/customerCareContent.ts`), an "Ask your AI" handoff sheet to Claude/ChatGPT/Gemini/Perplexity/Copilot/Grok (`constants/aiPlatforms.ts`, clipboard-copy fallback since not all six platforms' URL-prefill is verifiable), and a sticky WhatsApp/Email footer. Routed at `/customer-care` (customer) and `/vendor-customer-care` (vendor, via the same top-level-screen-plus-redirect-shim pattern as `vendor-settings`). Done.

## Immediate Next Steps

**Current roadmap position** (source of truth: `apps/landing/src/app/roadmap/data/milestones.ts`):

| Milestone | Period | Status |
|---|---|---|
| 400 Vendors in the Pipeline | June 2026 | **Active now** |
| App Store Launch | July 2026 | Upcoming — supply-only, no customer marketing yet |
| Both Sides Open (customer marketing) | August 2026 | Upcoming |

- Build vendor pipeline to 400 — 75 have registered interest. Outreach system is live; delivery activates when `DELIVERY_LIVE=true` is set in Supabase secrets.
- Android APK delivery: local debug Gradle build when a phone is connected via USB (tried and tested, faster, real device logs), EAS Cloud Build (`eas build --platform android --profile preview`) when there's no phone plugged in — avoids Windows PATH/JDK friction. Full decision process: `docs/MOBILE_DEVICE_TESTING.md`.
- Activate Paystack live credentials. Blocked on Paystack account activation review (ticket Vars 1850306).
- Activate Google Maps API key. Set in mobile `.env.local` and Supabase Edge Function secrets; no code changes needed.
- ~~Scope support channel for the Settings "Get help" row.~~ **Done** — replaced by the Customer Care screen (`CustomerCareScreen.tsx`), not the earlier WhatsApp/Email picker sheet.
- Wire biometric lock enforcement gate in `apps/mobile/app/_layout.tsx` on `AppState` change (`vars_biometric_lock` preference already stored by the Settings toggle).
- Run the founder device QA checklist (`docs/audit/mobile.md` §9) and a real screen-reader pass — dark mode is now wired app-wide but has not been walked screen-by-screen on a physical device.
