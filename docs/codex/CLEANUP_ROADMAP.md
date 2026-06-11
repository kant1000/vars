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

## Phase 3: Supabase Health

- Review all migrations in order.
- Confirm generated shared database types are current.
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

## Immediate Next Steps

**Current roadmap position** (source of truth: `apps/landing/src/app/roadmap/data/milestones.ts`):

| Milestone | Period | Status |
|---|---|---|
| 400 Vendors in the Pipeline | June 2026 | **Active now** |
| App Store Launch | July 2026 | Upcoming — supply-only, no customer marketing yet |
| Both Sides Open (customer marketing) | August 2026 | Upcoming |

- Build vendor pipeline to 400 — 75 have registered interest. Outreach system is live; delivery activates when `DELIVERY_LIVE=true` is set in Supabase secrets.
- Android APK delivery: use EAS Cloud Build (`eas build --platform android --profile preview`) — avoids Windows PATH/JDK friction, produces a shareable `.apk` without local Android Studio.
- Activate Paystack live credentials. Blocked on Nigerian business registration completion.
- Activate Youverify credentials. Blocked on pricing negotiation with Ayotomide.
- Activate Google Maps API key. Set in mobile `.env.local` and Supabase Edge Function secrets; no code changes needed.
