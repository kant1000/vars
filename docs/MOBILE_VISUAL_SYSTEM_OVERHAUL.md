# VARS Mobile Visual System Overhaul

Status: research deliverable and reference implementation, not a live migration.

Scope: `apps/mobile` only. This document preserves the existing navigation, screen order, component boundaries, business logic, payment logic, KYC logic, and V1/V2 scope. Visual confirmation on real iOS, Android, and OLED hardware is intentionally left out for founder review.

Reference code added:

- `apps/mobile/constants/visualSystem.ts`
- `apps/mobile/components/ui/primitives.tsx`
- `apps/mobile/components/ui/index.ts`

External references used:

- Apple HIG Dark Mode: https://developer.apple.com/design/human-interface-guidelines/dark-mode
- Apple UIKit Dark Mode overview: https://developer.apple.com/documentation/uikit/supporting-dark-mode-in-your-interface
- Android/Material elevation and shadows: https://developer.android.com/develop/ui/views/theming/shadows-clipping
- Material dark elevation overlay in Compose: https://developer.android.com/develop/ui/compose/designsystems/material
- Material 3 tonal elevation: https://developer.android.com/develop/ui/compose/designsystems/material3
- Expo Symbols: https://docs.expo.dev/versions/latest/sdk/symbols/
- React Navigation native tab/icon docs: https://reactnavigation.org/docs/native-bottom-tab-navigator/ and https://reactnavigation.org/docs/8.x/icons/

## Governing Rule

Nothing in the mobile app should be built outside the fixed catalogue below. A new visual need must first be solved by composing primitives. A proposed new primitive needs an explicit justification for why composition cannot do the job.

## 1. Current State Audit

### 1.1 Screen Inventory

README named customer screens:

| Screen | Route | Primary states to audit |
|---|---|---|
| Home / discovery | `/(tabs)/` | location loading, feed loading, empty feed, populated feed, offline stale feed |
| Bookings list | `/(tabs)/bookings` | loading, empty, active/past populated, review-needed, gate banners |
| Notifications | `/(tabs)/notifications` | loading, empty, unread/read populated |
| Customer profile | `/(tabs)/profile` | signed out, signed in, edit mode, upload progress |
| Vendor public profile | `/vendor/[id]` | loading, missing vendor, services, reviews, portfolio carousel, selected services |
| Booking flow | `/booking/[vendorId]` | service load, slot load, access form, location map, card verification WebView, booking submit |
| Booking detail | `/booking/detail/[bookingId]` | loading, each booking status, map tracking, action submitting, dispute/action errors |
| Live tracker | `/live/[bookingId]` | loading, live GPS stale, phone reveal, dispute modal, action submitting |
| Leave review | `/review/[bookingId]` | loading, error, rating empty/filled, submitting |

README named vendor screens:

| Screen | Route | Primary states to audit |
|---|---|---|
| Jobs dashboard | `/(vendor-tabs)/` | restricted wall, prerequisites, empty, pending, active, history, gate modal phases |
| Schedule | `/(vendor-tabs)/schedule` | initial load, slot states, calendar modal, range select, recurring chips, booking sheet, undo toast |
| Earnings | `/(vendor-tabs)/earnings` | loading, empty, hidden balance, period filters, paid/confirming/under-review rows |
| Vendor profile | `/(vendor-tabs)/profile` | profile load, schedule nudge, portfolio loading/uploading, services loading, empty services/photos |
| Auto-accept zone | `/vendor-zone-setup` | GPS load, map, saved zone, confirm modal, saving, error |
| Vendor onboarding | `/vendor-onboarding/step-[1-5]-*` | step-specific loading, inputs, upload, bank verify, KYC WebView, pending poll |
| Add service | `/vendor-services/add` | form empty, category/duration selection, price picker, saving, validation errors |

Additional app routes that should be included in migration QA:

- `auth/login`, `auth/phone`, `auth/vendor-login`
- `booking/gate-checkout/[bookingId]`
- `consent/[photoId]`
- `delete-account`
- `privacy-data`
- `terms-acceptance`
- `vendor-services/edit`
- `vendor-settings`, `vendor-terms`, `vendor-privacy`

### 1.2 Component Inventory

Current reusable components:

| Component | Current role | Catalogue placement |
|---|---|---|
| `ScissorsLoader` | Branded loading mark, currently used for most waits | Keep, but narrow to true indeterminate/honest waits and button busy state |
| `ConfirmModal` | Confirmation dialog | Replace with `VarsDialog` primitive |
| `OfflineBanner` | Offline connectivity bar | Pattern composed from `VarsToast` plus fixed positioning |
| `VendorCard` | Discovery result card | Pattern composed from `VarsSurface`, `VarsBadge`, `VarsIcon`, fixed avatar/media slots |
| `VendorPriceInput` | Price picker row plus bottom sheet | Pattern composed from `VarsField`, `VarsListRow`, `VarsSheet`; keep business-specific wrapper |
| `StatusDot` | Online/busy/offline indicator | Replace with `VarsBadge`/`VarsStatusGlyph` |
| `icons.tsx` | Custom SVG icon pack | Transitional fallback for `VarsIcon` until platform symbols are enabled |

Current near-duplicates and one-offs:

- Buttons are hand-built with `TouchableOpacity` or `Pressable` in nearly every screen. Variants differ in height, disabled opacity, border width, destructive treatment, and loading content.
- Cards use repeated combinations of `backgroundColor`, `borderRadius: 5`, `borderWidth`, and optional colored surfaces.
- Modals are split across `ConfirmModal`, bottom sheets, full-screen WebViews, and per-screen `Modal` definitions.
- Inputs are local `TextInput` styles with mostly similar 50px heights and 1.5px borders.
- Tabs appear as Expo Router bottom tabs plus in-screen segmented controls (services/reviews, earnings period, booking steps).
- Badges use color fills in several places, which conflicts with the monochrome shell rule.
- Loaders mix `ScissorsLoader` and `ActivityIndicator` despite README saying all loading states use `ScissorsLoader`.

### 1.3 Icon Inventory

Current custom SVG concepts in `components/icons.tsx`:

check, close, pin, bell, heart, edit, pen line, star filled, star empty, lightning, lock, car, chevron up/down/right, hourglass, gear, check circle, x circle, credit card, banknote, arrow up, star, warning, clock, eye, eye off, sparkle, search, calendar, person, briefcase.

Additional text glyphs currently used inline:

- Star text in booking/review surfaces and Pioneer labels.
- Checkmark and cross text in schedule/onboarding states.
- Lightning text for instant confirm/auto-accept.
- Pin/vehicle-like emoji in address and transport contexts.
- Plus text for add-photo tiles.

Forward rule: all non-copy symbols move through `VarsIcon` or a specialized pattern that internally uses `VarsIcon`. Text glyphs are only allowed when the symbol is part of prose.

### 1.4 Async Wait Point Inventory

| Journey / wait point | Current examples | Classification | Reason |
|---|---|---|---|
| Root auth/onboarding boot | `app/_layout.tsx` | Honest wait hidden by splash | Correct: no intermediate loader needed if splash stays until route known |
| Discovery vendor feed | `/(tabs)/index` Supabase RPC | Skeleton candidate | Known list/card shape; stale cache should render first when available |
| Bookings list | `/(tabs)/bookings` | Skeleton candidate | Known row/card shape and can preserve prior list footprint |
| Notifications list | `/(tabs)/notifications` | Skeleton candidate | Known row shape; unread/read state can settle after data |
| Customer/vendor profile DB load | profile screens | Skeleton candidate | Known avatar, rows, and cards |
| Vendor public profile | `/vendor/[id]` parallel vendor/services/photos/reviews | Skeleton candidate | Hero/profile row, carousel, tabs, service cards have stable shapes |
| Booking slot fetch | `/booking/[vendorId]` | Skeleton candidate | Slot grid shape is known |
| Booking creation | `paystack-initialize` | Honest wait | Financial/trust action; no fake success |
| Card verification WebView | `paystack-verify-card` and polling | Honest wait | Financial verification must name the system and wait for confirmation |
| Gate checkout | `paystack-gate-checkout`, WebView, poll | Honest wait | Charge state controls booking state; no optimistic success |
| Booking detail actions | cancel, confirm, dispute | Mixed: honest wait for financial/status actions | Can disable buttons instantly, but success must wait for server |
| Live tracker GPS polling | vendor location query/realtime | Honest transient overlay | Location freshness must be explicit; skeleton after first load is wrong |
| Review submit | `submit-review` | Optimistic safe after local validation | Low-risk social content; can show submitted row then reconcile |
| Favourite toggle | vendor profile favourite insert/delete | Optimistic safe | Reversible low-risk preference |
| Customer profile photo upload | storage upload | Honest upload progress | Image upload can fail; keep action local until stored |
| Portfolio OCR scan/upload | `imageContainsContact`, storage upload | Honest wait with choreographed motion | Trust/content control; do not hide scan |
| Vendor service add/edit | DB insert/update | Optimistic unsafe | Business inventory affects bookings; wait for DB |
| Vendor online toggle | prerequisites + DB update | Honest wait | Visibility affects marketplace; wait for server |
| Schedule slot toggle | calendar insert/delete/update | Optimistic safe with undo | Local slot state can update immediately and rollback on failure if queued |
| Block/unblock day/range | batch calendar writes | Optimistic safe with undo | Existing UI already has undo; preserve and standardize toast |
| Auto-accept zone save | GPS + edge function/DB | Honest wait | Auto-accept affects customer confirmation and trust |
| Gate "On My Way" modal | `paystack-gate` | Honest wait | Payment-gated status transition |
| Vendor KYC bank verify | `paystack-verify-bank` | Honest wait | Payout identity and bank verification |
| Vendor KYC session/WebView/poll | Youverify | Honest wait | Identity verification must be explicit |
| Pending KYC poll | step 5 interval | Honest wait, branded motion | Verification can be delayed or needs review |
| Privacy/export/delete account | edge functions | Honest wait | Account/data actions are sensitive |
| Offline queue flush | `actionQueue` | Toast/status pattern | Work can continue; queue state should be visible but not blocking |

ScissorsLoader fate: keep it, narrowed. Use `VarsSkeleton` for shaped content loads, `ScissorsLoader` for buttons and true indeterminate waits: KYC, payments, OCR, privacy/export/delete, root-level unexpected waits, WebView render loading.

### 1.5 Layout Shift Risk Inventory

| Cause | Current offenders / risk areas | Forward rule |
|---|---|---|
| Safe area metrics settle after first paint | `SafeAreaProvider` is used without `initialWindowMetrics` in `app/_layout.tsx` | Import `initialWindowMetrics` and pass it to `SafeAreaProvider` during migration |
| Images without explicit footprint | Discovery avatars, profile photos, portfolio carousel, consent photo, onboarding images | Every image reserves width/height or aspect ratio before URI load |
| Text grows containers | Vendor names, service names/descriptions, addresses, notification bodies, booking cards | Clamp with `numberOfLines`, fixed row heights where possible, and `adjustsFontSizeToFit` only for numeric totals |
| Sticky/fixed headers | Booking flow header, profile tab row, schedule nav header | Fixed heights and no content-derived header height |
| Maps | Booking review map, live map, zone setup map | Fixed aspect ratio/height and skeleton/map placeholder with identical footprint |
| Bottom sheets/modals | Floor picker, schedule sheets, support/password modals | Fixed snap points or max heights; no dynamic sizing unless final content footprint is known |
| `onLayout`/second render sizing | Carousel/page calculations and schedule slot scrolling | Avoid footprint changes after measurement; use dimensions/aspect ratio up front |
| Long dynamic lists | Schedule slots, bookings, notifications, portfolio | Stable row/card min heights and skeleton rows matching final rows |

Skeletons and layout stability are one solution where they overlap: a correct skeleton occupies the final footprint before data arrives.

## 2. Open Decision Resolutions

### 2.1 Appearance Control

Options:

| Option | Tradeoff |
|---|---|
| System only | Best platform expectation, simplest implementation, but no manual user escape hatch |
| Manual only | User control, but violates platform expectation and adds friction |
| System default plus manual override | Best fit: respects platform, supports Lagos daytime/outdoor usage and brand review needs |

Recommendation: system default plus manual override in customer and vendor settings. Store override as `vars_appearance_override = system | light | dark` in AsyncStorage. Do not add backend state.

Project context has been updated to approve this direction.

### 2.2 Elevation Ladder

Research conclusion: in dark mode, shadows alone are not sufficient. Apple uses base/elevated dark backgrounds to preserve depth, and Material uses tonal overlays/surface tint because shadows become hard to perceive against dark surfaces.

Recommended fixed ladder:

| Step | Use | Light treatment | Dark treatment |
|---|---|---|---|
| 0 | App background, unframed sections | `#FFFFFF`, 1px faint border only if bounded | `#0B0B0B`, 1px faint border only if bounded |
| 1 | List rows, input containers, flat cards | `#FAFAFA`, 1px border, tiny shadow | `#141414`, 1px border, no shadow |
| 2 | Cards, sticky bars, tab bars | `#F5F5F5`, 1.5px border, small shadow | `#1D1D1D`, 1.5px border, no shadow |
| 3 | Sheets, popovers, floating controls | `#EEEEEE`, 1.5px border, medium shadow | `#272727`, 1.5px border, no shadow |
| 4 | Dialogs, blocking overlays | `#E7E7E7`, 1.5px border, strongest shadow | `#323232`, 1.5px border, no shadow |

Reference implementation: `varsElevationStyle(theme, elevation)` in `apps/mobile/constants/visualSystem.ts`.

### 2.3 Loading Scope

Recommendation: visual perception layer first, data architecture only where it already exists. Use existing `cache`, `actionQueue`, and stale data paths, but do not introduce broad prefetch or new backend contracts as part of this visual overhaul.

Rule:

- Skeletons for predictable content surfaces.
- Optimistic UI only for reversible, non-financial, non-identity, non-settlement actions.
- Honest waits for payments, KYC, disputes, bank verification, OCR/contact scans, privacy/export/delete, and anything that changes booking trust state.

## 3. Design System Spec

### 3.1 Tokens

Core light tokens:

- `bg #FFFFFF`
- `surface0 #FFFFFF`
- `surface1 #FAFAFA`
- `surface2 #F5F5F5`
- `surface3 #EEEEEE`
- `surface4 #E7E7E7`
- `ink #111111`
- `inkMuted #6B7280`
- `inkFaint #D0D0D0`
- `inverseInk #FFFFFF`

Core dark tokens:

- `bg #050505`
- `surface0 #0B0B0B`
- `surface1 #141414`
- `surface2 #1D1D1D`
- `surface3 #272727`
- `surface4 #323232`
- `ink #F7F7F7`
- `inkMuted #B7B7B7`
- `inkFaint #555555`
- `inverseInk #111111`

Accent glyph tokens:

- Blue: booked / info
- Amber: auto-accept / warning
- Green: online / success
- Red: blocked / destructive warning

Accent colors remain tiny glyphs, dots, rails, or text emphasis. They are not broad fills for cards, badges, or sections.

### 3.2 Fixed Primitive Catalogue

| Primitive | Purpose | Use | Do not use | States / variants | Current users / near duplicates |
|---|---|---|---|---|---|
| `VarsSurface` | Bounded surface with theme/elevation | Cards, rows, sheets, dialogs | Full-page sections that should be unframed | elevation 0-4 | Most `card`, `summaryCard`, `phoneCard`, settings sections |
| `VarsButton` | Command surface | Submit, save, confirm, cancel, retry | Navigation rows, chips | primary/secondary/ghost, sm/md/lg, disabled/loading/pressed, tone | All hand-built `TouchableOpacity` buttons |
| `VarsInput` | Text input shell | Forms, search, notes, access details | Price picker rows or select rows | default/error/disabled/focus-ready | Auth, booking, settings, service forms |
| `VarsCheckbox` | Binary consent/selection | Consent checkbox, terms, optional toggles when check style fits | Online/biometric system switches | checked/unchecked/disabled | Portfolio consent, manual checkmark boxes |
| `VarsSwitch` | On/off system toggle | Vendor online/offline, other binary system switches | Consent/selection checkmarks | on/off/disabled | Vendor online toggle |
| `VarsSegmentedControl` | Mutually exclusive compact modes | Period filters, Services/Reviews, Block/Unblock modes | Main app tabs | selected/unselected/disabled-ready | Earnings filters, vendor profile tabs |
| `VarsTabItem` | Icon/label styling for a tab bar item | Inside `tabBarIcon`/`tabBarLabel` on Expo Router bottom tabs | A replacement tab bar or navigation structure | focused/unfocused | Bottom tab bar icon + label styling |
| `VarsDialog` | Blocking confirmation | Destructive confirmation, auto-accept confirmation | Long forms or WebViews | neutral/info/warning/danger, visible/hidden | `ConfirmModal`, support/password modal patterns |
| `VarsToast` | Temporary feedback | Undo, offline sync, save confirmation | Permanent banners | neutral/success/warning/danger/info with optional action | Schedule undo toast, OfflineBanner |
| `VarsSkeleton` | Content-shaped wait | Lists, cards, image placeholders | Financial/KYC confirmation | pulse only; fixed footprint required | Replaces many full-screen loaders |
| `VarsIcon` | Single app icon API | All app symbols and tab icons | Brand logo/scissors mark | size/color/name | Replaces custom icon calls and text glyphs over time |
| `ScissorsLoader` | Branded indeterminate wait | Payment, KYC, OCR, WebView, button busy | Predictable list/card/page loads | small/medium/large, light/dark | Keep and narrow |
| `VendorPriceInput` | Business-specific price picker pattern | Vendor service price entry | Generic input | composed from field/list row/sheet | Keep wrapper, restyle using primitives |
| `OfflineBanner` | Connectivity feedback pattern | App-wide offline state | General alerts | composed from toast pattern | Keep behavior, restyle from `VarsToast` |

Prop conventions:

- Visual style prop: `variant`.
- Semantic color prop: `tone`.
- Interaction handler: `onPress`, `onChange`, `onDismiss`, `onConfirm`.
- Content: `children` for composition; named string props only for simple primitives such as `label`.
- Busy state: `loading`, not `isLoading`.
- Theme prop: `theme`, with a provider added during migration.

### 3.3 Icon Mapping Table

Preferred implementation path:

1. Short term: use `VarsIcon` with existing SVG fallback so the catalogue can compile now.
2. Migration: install and test `expo-symbols` with the current Expo SDK/dev build, or use React Navigation native tab icon objects for tab icons only.
3. Final: SF Symbols on iOS, Material Symbols on Android, with fallback SVG only where either system lacks a close match.

Expo compatibility note: the current app is Expo SDK 52. The official Expo Symbols page currently recommends a newer package line and marks the library beta. Do a dev-build compatibility check before adding it to production.

Weight/style recommendation to test: SF Symbols regular/monochrome paired with Material Symbols outlined weight 400. If Material appears too light at 16px, test weight 500 only for Android.

| Concept | SF Symbols | Material Symbols | Resolution |
|---|---|---|---|
| add | `plus` | `add` | Replace text plus |
| arrow up | `arrow.up` | `arrow_upward` | Payout/release |
| banknote | `banknote` | `payments` | Material has stronger payments metaphor |
| bell | `bell` | `notifications` | Notifications |
| briefcase | `briefcase` | `work` | Vendor jobs tab |
| calendar | `calendar` | `calendar_month` | Schedule/bookings |
| car | `car` | `directions_car` | On-way/travel |
| check | `checkmark` | `check` | Inline success |
| check circle | `checkmark.circle` | `check_circle` | Status success |
| chevron down | `chevron.down` | `keyboard_arrow_down` | Select affordance |
| chevron right | `chevron.right` | `chevron_right` | Rows |
| chevron up | `chevron.up` | `keyboard_arrow_up` | Expand/collapse |
| clock | `clock` | `schedule` | Time/expiry |
| close | `xmark` | `close` | Dismiss/remove |
| credit card | `creditcard` | `credit_card` | Payment |
| edit | `square.and.pencil` | `edit` | Edit action |
| eye | `eye` | `visibility` | Balance/password visible |
| eye off | `eye.slash` | `visibility_off` | Hidden |
| gear | `gearshape` | `settings` | Settings |
| heart | `heart` | `favorite` | Favourite |
| hourglass | `hourglass` | `hourglass_empty` | Pending |
| lightning | `bolt` | `bolt` | Auto-accept |
| lock | `lock` | `lock` | Locked/read-only |
| pen line | `pencil.line` | `edit_note` | Writing/edit note |
| person | `person` | `person` | Profile |
| pin | `mappin` | `location_on` | Location |
| search | `magnifyingglass` | `search` | Discover/search |
| sparkle | `sparkles` | `auto_awesome` | Service complete |
| star | `star` | `star` | Rating |
| star filled | `star.fill` | `star` | Filled rating |
| star empty | `star` | `star_border` | Empty rating |
| warning | `exclamationmark.triangle` | `warning` | Needs attention |
| x circle | `xmark.circle` | `cancel` | Cancelled/error |

## 4. Reference Implementation

Implemented reference primitives live in `apps/mobile/components/ui/primitives.tsx`.

What is included:

- `VarsSurface`
- `VarsButton`
- `VarsInput`
- `VarsCheckbox`
- `VarsSwitch`
- `VarsSegmentedControl`
- `VarsTabItem`
- `VarsSkeleton`
- `VarsToast`
- `VarsDialog`
- `VarsIcon`
- `iconSystemNames`

Theme/elevation helpers live in `apps/mobile/constants/visualSystem.ts`.

The reference code intentionally does not migrate screens. It is meant to be reviewed, adjusted, and then applied screen-by-screen.

Known implementation gaps:

- No app-wide `ThemeProvider` has been added yet.
- No settings override persistence has been added yet.
- `VarsIcon` currently uses existing SVG icons as a safe fallback. Platform-native symbols require adding and validating `expo-symbols` or upgrading the navigation icon path.
- `VarsSkeleton` is pulse-only, not shimmer. This is deliberate for a monochrome trust product unless media-heavy screens need shimmer after device review.

## 5. Rollout Notes

Recommended order:

1. Add theme provider and appearance override in settings.
2. Wire `SafeAreaProvider` with `initialWindowMetrics`.
3. Replace full-screen predictable loaders with skeletons on discovery, bookings, notifications, vendor profile, customer profile, vendor public profile, and earnings.
4. Migrate buttons/inputs/cards in vendor onboarding first. It is high impact and bounded to five screens.
5. Migrate booking flow and gate checkout next, but preserve honest payment waits.
6. Migrate schedule last. It is the highest interaction-density screen and should benefit from stabilized primitives before being touched.
7. Migrate icons after primitive colors and dark surfaces are stable, because icon weights need side-by-side visual review.

Highest risk areas:

- Payment and KYC waits: visual polish must not imply confirmed success before webhook/server confirmation.
- Schedule: dense state encoding and undo behavior make regressions easy.
- Vendor public profile: media, sticky tabs, and selected services combine several layout-shift risks.
- Dark mode maps/WebViews: third-party surfaces may not honor app theme; wrap them with fixed containers and explicit loading/empty states.

## 6. Visual QA Checklist For Founder Review

- Toggle system light/dark while app is running.
- Check manual override: system, light, dark.
- Verify dark elevation on OLED: cards/sheets/dialogs should separate by tonal step, not by visible shadow.
- Confirm all body text meets contrast in both modes.
- Confirm skeletons occupy exactly the final content footprint.
- Confirm payment, KYC, OCR, dispute, and deletion actions never show optimistic success.
- Compare SF Symbols and Material Symbols at 14, 16, 18, 24, and tab sizes before approving final icon weights.
- Check long Lagos addresses, long vendor names, long service names, and long notification bodies for truncation rather than layout growth.
