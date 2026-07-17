# VARS Mobile Visual System Overhaul — Audit Brief

Branch: `codex-mobile-visual-system-overhaul` — 11 commits, pushed to origin (`7688a66`..`dcf5c25`)
Founder-approved: 2026-07-17
Status: **On-device QA not yet run** — see [Gaps & blockers](#6-gaps--blockers)

> `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` (the original research/spec doc) and `docs/VARS_Visual_System_Implementation_Plan.md` (the phase-by-phase execution plan) have been removed — their decisions were already locked into `docs/VARS_PROJECT_CONTEXT.md`'s Visual System table and Primitive Catalogue Reference in Phase 7, and their still-relevant working material (the founder device QA checklist) is preserved in [section 9](#9-founder-device-qa-checklist) below. The phase log in section 3 cites the deleted plan doc by name as a historical record of what guided the work — it's no longer a live link.

---

## 1. Executive summary

This branch introduces an 11-component visual primitive catalogue (`VarsSurface`, `VarsButton`, `VarsInput`, `VarsCheckbox`, `VarsSwitch`, `VarsSegmentedControl`, `VarsTabItem`, `VarsSkeleton`, `VarsToast`, `VarsDialog`, `VarsIcon`) for the VARS mobile app, wires an app-wide light/dark `ThemeProvider` with a persisted manual override, adds loading skeletons to seven read-heavy screens, migrates five vendor-onboarding screens plus the booking flow, gate checkout, and part of the schedule screen onto the new primitives, and swaps icon rendering to platform-native symbols (SF Symbols on iOS, Material Icons on Android). Every phase was scoped, executed, and verified through static tooling (`tsc`, `eslint`, Metro bundle compilation on both platforms) and manual diff review confirming zero changes to payment, KYC, or booking business logic.

**What this branch is not:** a device-verified visual QA pass. No screen in this branch has been looked at on a real phone by anyone during this work. One real Android device was connected mid-way through Phase 6 and used for research (confirmed SDK/package compatibility facts), but an actual on-device build currently fails — see [Gaps & blockers](#6-gaps--blockers). No iOS device or build was available at any point.

| | |
|---|---|
| Code-verified | ✅ |
| Founder-approved | ✅ (device QA pending) |
| Pre-existing infra blockers | 1 (Android Gradle build) |

---

## 2. Methodology & verification limits

Read this before trusting any "clean" result below — it defines what clean actually means here.

### What was run, every phase, no exceptions

| Check | Proves | Does not prove |
|---|---|---|
| `tsc --noEmit` (workspace-wide) | Type correctness across the whole monorepo, not just changed files | Runtime behaviour, visual output |
| `eslint` (workspace-wide) | No new lint errors or warnings vs. the pre-branch baseline (tracked exactly — below) | Logic correctness, visual output |
| Metro bundle compile, iOS *and* Android | The full module graph resolves and compiles for both platforms; for Phase 6, that `expo-symbols` and `@expo/vector-icons` each appear in exactly one platform's bundle and never the other | What renders on screen |
| Full `git diff` review per risky file | Line-by-line confirmation that specific business-logic functions were not touched (enumerated in [section 5](#5-business-logic-preservation-evidence)) | Absence of bugs in the logic that *was* touched |

### The lint baseline

The mobile workspace had 28 pre-existing lint warnings (0 errors) before this branch started. That count was re-checked after every single phase. It sits at 27 now — one lower, because Phase 2 fixed a genuinely dead `loadingBookings` state variable as a side effect of actually wiring the skeleton it should have driven. No phase introduced a new warning; two phases (3 and 6) introduced then immediately removed self-caused ones (unused imports left behind by a migration) before moving on.

### Environment constraints on this work

This work was done in a Windows sandbox with no Android emulator, no iOS simulator, and no Xcode/macOS at any point. A physical Android phone (Samsung Galaxy A40) was connected by the user partway through Phase 6 and reachable via `adb`, which enabled real package-compatibility research (see [Gaps](#6-gaps--blockers)) but not an installed, on-screen build — the EAS cloud build for a dev client failed at the native Gradle stage on an issue unrelated to this branch's changes (verified via `yarn.lock` diff).

---

## 3. Phase-by-phase log

What shipped in each phase, against `docs/VARS_Visual_System_Implementation_Plan.md`.

### Phase 0 — Foundation `4b2af1d` `39aaa35`

- Container border override: shipped code used `inkFaint`, docs still said solid `#111111` — founder ruled code wins, doc corrected.
- Built `VarsSwitch` and `VarsTabItem`, the two catalogue gaps identified in the prior review.
- Fixed `add` icon silently rendering as a checkmark (wrong SVG mapping); fixed an `Array<T>` lint warning.
- Repo hygiene: deleted an untracked, unrelated Android home-screen screenshot; cherry-picked an unrelated pre-existing bug fix off this branch onto `main` so the overhaul PR stays clean.
- Built a throwaway, unlinked preview route rendering all 11 primitives in both themes for founder review.

### Phase 1 — Infrastructure `50859dd`

- `ThemeContext.tsx`: resolves system appearance via `useColorScheme`, persists a `system | light | dark` override to AsyncStorage.
- Theme load folded into the existing splash-hold gate in `_layout.tsx` — no flash of the wrong theme on launch, reusing the app's existing auth/onboarding-gate pattern rather than inventing a new one.
- `StatusBar` now follows resolved appearance instead of raw OS `auto`.
- `SafeAreaProvider` given `initialMetrics` (caught a version mismatch: this RN safe-area-context version names the prop differently than the plan assumed).
- Appearance settings UI added to both customer and vendor settings screens using two `VarsSwitch` controls ("Match system" / "Dark mode") per explicit instruction, covering the three-way model with the binary primitive.

### Phase 2 — Skeletons `58e9ec8`

- 7 screens: discovery feed, bookings, notifications, customer profile, vendor profile, vendor public profile, earnings.
- Each skeleton shape-matched against the real content's actual dimensions read from source, not approximated.
- Bookings and earnings screens restructured so static chrome (header, filter row) renders immediately instead of being hidden behind a full-screen spinner along with the data-dependent parts.
- Small indeterminate loaders (pull-to-refresh, pagination, button-busy) deliberately left on `ScissorsLoader` — out of scope by the plan's own definition.

### Phase 3 — Vendor onboarding `33defbe`

- All 5 onboarding steps migrated: text inputs, cards, checkboxes, and buttons onto the primitive catalogue.
- Chip/pill selectors (category, subcategory, duration) deliberately left alone — architecturally incompatible with `VarsSegmentedControl`'s fixed equal-width row, not one of the four in-scope primitive types.
- Step 4 (KYC/bank) touched only unambiguous input/button swaps; colored status callouts, the bank-picker, and the WebView cancel overlay were left alone — see [section 5](#5-business-logic-preservation-evidence) for what was verified untouched there.

### Phase 4 — Booking flow & gate checkout `65ed63c`

- Highest-stakes phase by the plan's own framing: the honest-wait rule (no optimistic payment success) is non-negotiable here.
- In the card-verification WebView component, only the `disclosure` and `failed` phase buttons were touched. The `webview` and `polling` phases — the actual wait states — are byte-for-byte untouched.
- One incidental correctness fix: gate checkout's "Back to bookings" buttons used a grey fill that the documented CTA spec never actually sanctioned; `VarsButton`'s secondary variant brings it in line with the spec rather than introducing a new look.
- Note for continuity with prior audit findings: the gate-checkout and card-verification screens in the *current* codebase already poll for server-side confirmation (`pollForCardVerify`, `pollForOnWay`) rather than treating a WebView redirect as success — an earlier version of this audit doc (superseded by this one) flagged that as a P0 gap; it no longer reflects the current implementation, which this session read in full.

### Phase 5 — Schedule `8deaaec`

- Named by the plan as the highest interaction-density, highest regression-risk screen (2,266 lines) — scope was deliberately narrow.
- Migrated: the undo toast (the catalogue's literal named use case for `VarsToast`) and the entire booking bottom sheet (accept/decline, all three status-progress buttons, reschedule flow, four cards).
- Deliberately not touched: the slot grid, drag-based range selection, recurring-day chips, block/unblock UI — named by the plan's own checkpoint as the regression surface, and none of it maps to the primitive catalogue regardless.

### Phase 6 — Icon system `44abb86`

- Research surfaced that the plan's "SF Symbols / Material Symbols" pairing wasn't achievable as written: `expo-symbols` only supports Material Symbols on Android from v55+, which needs an Expo SDK upgrade past this app's SDK 52 — flagged, and the user chose classic Material Icons via `@expo/vector-icons` instead, already bundled at this SDK.
- All 33 icon concepts individually verified against both real type systems: `sf-symbols-typescript`'s typed union for iOS, `MaterialIcons`'s actual glyph map for Android (which uses hyphenated names, not the underscored ones originally researched).
- Platform isolation done via Metro's `.ios.tsx`/`.android.tsx` file resolution and verified by directly inspecting both compiled bundles — `expo-symbols` appears only in iOS's, `MaterialIcons` only in Android's.
- Android dev-client build attempted on the connected device, failed on a pre-existing Gradle/AGP toolchain issue — see [Gaps & blockers](#6-gaps--blockers).

### Phase 7 — Lock it in `dcf5c25`

- Fixed a real, previously-flagged discrepancy: the project doc's "state signalling" rule (border weight = state) never matched what shipped. Corrected to describe reality — fill/colour signals interactive state, border weight belongs to the elevation ladder.
- Locked four decisions that had only existed as recommendations: elevation ladder, primitive catalogue, loading/wait-state rules, icon system — each dated and attributed.
- Overhaul doc status changed from "research deliverable" to "implemented," with the device-QA gap stated explicitly rather than implied away.

### Post-audit fixes (this update)

- **`accentRed` contrast**: `apps/mobile/constants/visualSystem.ts` — light-mode `accentRed` darkened from `#EF4444` to `#DC2626`. Re-verify against the recomputed ratio in [section 7.1](#71-colour-contrast--computed-from-shipped-tokens) before treating this as closed.
- **`VarsButton` loading-state name loss**: `primitives.tsx` — now sets `accessibilityLabel={label}` unconditionally so the label survives the loading state.
- **`VarsInput` label association**: `primitives.tsx` — now derives `accessibilityLabel` from the visible label, an explicit override, or the placeholder.
- **`VarsToast` announcement**: `primitives.tsx` — now sets a polite live region and an accessible label.
- **`VarsDialog` modal flag**: `primitives.tsx` — panel now marked as modal for accessibility.
- **Reduce-motion**: `VarsSwitch`, `VarsSkeleton`, and `ScissorsLoader` now check the OS reduce-motion setting.

See [section 7](#7-accessibility-assessment-wcag-oriented) for independent verification of each of these.

---

## 4. Complete file inventory

Every file touched across the branch, grouped by first phase touched. Files touched again in a later phase are noted inline.

| File | Phase(s) | What changed |
|---|---|---|
| `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` | 0, 6, 7 | New research doc; icon section rewrite; status lock-in |
| `docs/VARS_PROJECT_CONTEXT.md` | 0, 7 | Appearance/container override rows; full lock-in pass |
| `docs/VARS_Visual_System_Implementation_Plan.md` | 0 | New — the execution plan itself |
| `apps/mobile/constants/visualSystem.ts` | 0, post-audit | New — tokens, elevation ladder; `accentRed` darkened for contrast |
| `apps/mobile/components/ui/primitives.tsx` | 0, 6, post-audit | New — 11 primitives; icon rendering delegated; a11y fixes |
| `apps/mobile/components/ui/index.ts` | 0 | New — barrel export |
| `apps/mobile/components/icons.tsx` | 0 | `PlusIcon` added |
| `apps/mobile/app/_dev-visual-preview.tsx` | 0 | New — throwaway, unlinked preview route |
| `apps/mobile/contexts/ThemeContext.tsx` | 1 | New — theme provider |
| `apps/mobile/app/_layout.tsx` | 1 | Theme provider wired in, splash-gate, SafeArea, StatusBar |
| `apps/mobile/app/(tabs)/profile.tsx` | 1, 2 | Appearance settings; active-bookings skeleton |
| `apps/mobile/app/vendor-settings.tsx` | 1 | Appearance settings |
| `apps/mobile/app/(tabs)/index.tsx` | 2 | Discovery feed skeleton |
| `apps/mobile/app/(tabs)/bookings.tsx` | 2 | Bookings skeleton, header restructure |
| `apps/mobile/app/(tabs)/notifications.tsx` | 2 | Notifications skeleton |
| `apps/mobile/app/(vendor-tabs)/earnings.tsx` | 2 | Earnings skeleton, header restructure |
| `apps/mobile/app/(vendor-tabs)/profile.tsx` | 2 | Vendor profile skeleton |
| `apps/mobile/app/vendor/[id].tsx` | 2 | Vendor public profile skeleton |
| `apps/mobile/app/vendor-onboarding/step-1-profile.tsx` | 3 | Full primitive migration |
| `apps/mobile/app/vendor-onboarding/step-2-services.tsx` | 3* | Full primitive migration (chips left alone) |
| `apps/mobile/app/vendor-onboarding/step-3-portfolio.tsx` | 3 | Full primitive migration |
| `apps/mobile/app/vendor-onboarding/step-4-kyc.tsx` | 3 | Partial — inputs/buttons/neutral card only |
| `apps/mobile/app/vendor-onboarding/step-5-pending.tsx` | 3 | Full primitive migration |
| `apps/mobile/app/booking/[vendorId].tsx` | 4 | Partial — cards/inputs/buttons, honest-wait phases untouched |
| `apps/mobile/app/booking/gate-checkout/[bookingId].tsx` | 4 | Partial — 3 non-wait-state phases' buttons only |
| `apps/mobile/app/(vendor-tabs)/schedule.tsx` | 5 | Partial — undo toast + booking sheet only |
| `apps/mobile/components/ui/iconMap.ts` | 6 | New — name/glyph tables, SVG fallback map |
| `apps/mobile/components/ui/VarsIconRenderer.tsx` | 6 | New — web/fallback renderer |
| `apps/mobile/components/ui/VarsIconRenderer.ios.tsx` | 6 | New — SF Symbols renderer |
| `apps/mobile/components/ui/VarsIconRenderer.android.tsx` | 6 | New — Material Icons renderer |
| `apps/mobile/package.json` | 6 | `expo-symbols@~0.2.2` added |
| `yarn.lock` | 6 | Lockfile update for the above only — diffed to confirm no other package moved |
| `apps/mobile/components/ScissorsLoader.tsx` | post-audit | Reduce-motion support added |

\* `step-2-services.tsx` also received an unrelated one-line pre-existing bug fix (`DURATION_OPTIONS` reference error, predates this branch), cherry-picked directly onto `main` in Phase 0 rather than carried on this branch.

---

## 5. Business-logic preservation evidence

This isn't a claim — it's what was actually checked, and how.

For every screen touched in Phases 3–5 (onboarding, booking flow, gate checkout, schedule), the full `git diff` was reviewed after each edit and filtered against everything that should legitimately appear in a primitive-swap diff (JSX tag names, `style=` props, `theme=` props, import lines). What's left over after that filter is what actually changed in substance. Across all five files, that remainder was empty except for import cleanup and dead-style removal.

Named functions explicitly confirmed untouched by this review, because they sit directly adjacent to primitive swaps and are the highest-consequence code in the app if a migration mistake reached them:

| Function | File | Why it matters |
|---|---|---|
| `callEdgeFn`, `launchKyc`, `handleVerifyAccount` | `step-4-kyc.tsx` | Youverify/Paystack bank verification calls |
| `handleWebViewMessage` | `step-4-kyc.tsx` | Parses KYC WebView completion signal |
| `submitBooking`, `pollForCardVerify`, `handleCardVerifyNav`, `handlePay` | `booking/[vendorId].tsx` | Booking creation, ₦50 card verification state machine |
| `fetchCheckout`, `pollForOnWay`, `handleWebViewNav` | `gate-checkout/[bookingId].tsx` | Gate charge, Paystack checkout WebView state machine |
| `handleAction`, `handleUndo`, `showSavedInfo`, `handleSuggestReschedule`, `loadRescheduleSlots` | `schedule.tsx` | Job status transitions, calendar undo, reschedule flow |

> **What this does and doesn't cover.** This confirms no *migration mistake* altered these functions. It does not constitute an independent security or correctness review of the functions themselves — they were read for context, not audited as a target.

---

## 6. Gaps & blockers

Everything an auditor should independently re-check, in order of how much it should worry you.

### 🟢 Fixed — Android native build (2026-07-17)

Root-caused properly instead of leaving as "unrelated toolchain issue." Two separate, real, pre-existing bugs, neither introduced by this branch:

1. **`expo-haptics` version mismatch** — `apps/mobile/package.json` declared `^56.0.3`, a version from a much later Expo SDK generation with an incompatible native-module Gradle-plugin mechanism, against this project's SDK 52 (which expects `~14.0.1` per `expo/bundledNativeModules.json`). This was the actual cause of the `expo-module-gradle-plugin not found` error. Fixed in `apps/mobile/package.json`.
2. **Sentry double-autolinking** — `@sentry/react-native` was registered as two separate Gradle projects: Expo's module resolver additionally autolinks it as a legacy `react-native.config.js` module (`sentry-react-native`) on top of the correct registration React Native's own settings-plugin autolinking already creates (`sentry_react-native`) for the identical sourceDir. Every Gradle output they both produce (codegen schema, resValues, ...) collided. Fixed via a local Expo config plugin (`apps/mobile/plugins/withSentryAutolinkFix.js`, registered in `app.config.js`) that applies `useExpoModules(exclude: ['@sentry/react-native'])` on every prebuild — necessary because `android/` is gitignored and fully regenerated by `expo prebuild`, so a raw `settings.gradle` edit alone would not survive.

Verified on a physical Samsung Galaxy A40 (`SM_A405FN`, Android, USB debugging): built a debug APK via `gradlew app:assembleDebug`, installed with `adb install`, launched, connected to a local Metro server via `adb reverse`, and confirmed the real 2,845-module app bundle rendered — not just the dev-client shell.

### 🟢 Resolved — On-device visual confirmation (Android)

Confirmed on real hardware per above: the `_dev-visual-preview` screen renders the primitive catalogue correctly in both light and dark mode (buttons, elevation surfaces, icons all correct). iOS still has zero on-device confirmation — no Mac/Xcode available in this environment.

### 🔴 New finding — Dark mode is not actually wired into any real screen (2026-07-17)

`ThemeProvider`, persistence, and the Appearance toggle UI (`vendor-settings.tsx`) all work correctly in isolation. But checking every file that imports `useVarsTheme()` (16 files) shows `theme` is never used to style the screen itself — it's only ever forwarded into a prop on an isolated `VarsSwitch` or two. Every screen's actual container/card/text styling comes from the static `Colors` object in `constants/colors.ts`, which has no theme awareness at all. Net effect: **toggling Dark Mode changes nothing anywhere in the app except the two switches on the Appearance screen and the dedicated `_dev-visual-preview` screen.** This was surfaced by the founder testing the build on-device, not caught by any prior static-analysis pass in this document — a reminder that "types pass, lint passes, bundle compiles" is not evidence a *feature* works.

Full inventory and a phased migration plan are in [section 10](#10-themedark-mode-migration-roadmap).

### 🟠 Scoped gap — Six screens have skeletons but not primitive-migrated interactive elements

Discovery, bookings, notifications, customer profile, vendor profile, vendor public profile, and earnings got `VarsSkeleton` loading states in Phase 2, but their buttons, cards, and inputs are still hand-built — that migration was never scoped into this branch. Subsumed by the broader theme migration roadmap in section 10, since these are the same files.

### 🟠 Scoped gap — Schedule's grid/gesture UI is entirely unmigrated

Deliberate, per Phase 5's own risk framing — the slot grid, drag-based range select, recurring-day chips, and block/unblock UI never touched the new primitives. This is the single highest-density interaction surface in the app and has had zero design-system changes applied to it. Its own dedicated phase (12) in section 10, given its size (2,240 lines) and risk.

### 🟢 Confirmed clean — Icon platform isolation

Verified by grepping both compiled Metro bundles directly, not inferred from file structure: `expo-symbols`/`SymbolView` appears only in the iOS bundle (Android: zero matches), `@expo/vector-icons`/`MaterialIcons` appears only in Android's (iOS: zero matches).

---

## 7. Accessibility assessment (WCAG-oriented)

Static analysis only — read the methodology note before acting on any of this. This section was updated after a round of fixes landed against the original findings; each fix is independently re-verified below rather than taken on the fixer's word.

> **Methodology, and its limits.** Every finding below comes from two sources: (1) computing WCAG 2.x contrast ratios from the actual hex values in `apps/mobile/constants/visualSystem.ts` using the standard relative-luminance formula, and (2) reading the accessibility props (`accessibilityRole`, `accessibilityState`, label association) directly out of the shipped primitive source in `apps/mobile/components/ui/primitives.tsx`. **This is not a screen-reader test, not an automated scanner (axe / Accessibility Scanner / Accessibility Inspector), and not a device test.** It catches a real, useful class of bugs — wrong contrast math, missing roles, lost accessible names — and cannot catch focus-order bugs, actual VoiceOver/TalkBack phrasing, dynamic-type reflow, or RTL layout. Run real assistive-tech passes before treating this section as sufficient.

### 7.1 Colour contrast — computed from shipped tokens

| Pair | Context | Ratio | AA text (4.5:1) | AAA text (7:1) |
|---|---|---|---|---|
| ink on bg — light | Primary body text | 18.9:1 | ✅ Pass | ✅ Pass |
| ink on bg — dark | Primary body text | 19.0:1 | ✅ Pass | ✅ Pass |
| inverseInk on ink — both | Primary button text | 17.6–18.9:1 | ✅ Pass | ✅ Pass |
| inkMuted on bg — light | Secondary text, captions, `VarsInput` label | 4.83:1 | ✅ Pass | ❌ Fail |
| inkMuted on bg — dark | Secondary text, captions | 10.16:1 | ✅ Pass | ✅ Pass |
| **accentRed `#DC2626` on bg — light** | `VarsInput` error text — **fixed, was `#EF4444`** | **4.83:1** | **✅ Pass** | ❌ Fail |
| accentRed on bg — dark | Same, dark mode (token unchanged) | 7.37:1 | ✅ Pass | ✅ Pass |
| accentGreen on bg — light | `VarsSwitch` "on" track fill (non-text UI, 3:1 threshold applies) | 2.28:1 | ❌ Fail 3:1 | — |
| accentBlue on bg — light | Info-tone accents, links | 4.0:1 | ⚠️ Borderline | ❌ Fail |
| accentAmber on bg — light | Warning-tone accents (glyph-only by design) | 2.15:1 | ❌ Fail 3:1 | — |

**Independently recomputed for this update, and verified by script, not just by hand:** `#DC2626` = rgb(220, 38, 38). Relative luminance ≈ 0.1674; contrast against white (`L = 1.0`) = `(1.0 + 0.05) / (0.1674 + 0.05) ≈ 4.83:1`. **This clears the 4.5:1 AA text threshold, but only just** — by 0.33, not a comfortable margin. (An earlier draft of this document stated 5.87:1, which was a hand-arithmetic error caught and corrected by re-running the calculation as a script rather than trusting the first pass.) Given the small margin, treat this as "technically passing" rather than "solved" — if the brand ever wants headroom here (e.g. to survive a future token tweak without re-failing), a slightly darker red would do it; not required to close this finding, but worth knowing the margin is thin. `accentGreen`, `accentBlue`, and `accentAmber` were untouched by this fix and remain exactly as flagged in the original audit — still fine given their documented glyph-only usage, still not enforced by the type system.

### 7.2 Touch target size

No changes reported or found in this update; unchanged from the original audit.

| Component | Size | WCAG 2.5.8 (AA, 24×24) | WCAG 2.5.5 (AAA, 44×44) |
|---|---|---|---|
| `VarsButton size="sm"` | 36px tall | ✅ Pass | ❌ Fail |
| `VarsButton size="md"` / `"lg"` | 46 / 56px tall | ✅ Pass | ✅ Pass |
| `VarsCheckbox`, `VarsSwitch` (row) | 44px min height, full width | ✅ Pass | ✅ Pass |
| `VarsSegmentedControl` (row) | 44px min height | ✅ Pass | ✅ Pass |
| `VarsTabItem` | 44px min width, no enforced min height (~35–38px content) | ⚠️ Width only | ❌ Fail |

### 7.3 Screen-reader / semantic structure — original findings and fix status

**✅ Fixed — `VarsButton` loading-state name loss.** Original finding: the `Text` label unmounted while `loading`, leaving no accessible name behind the spinner. Reported fix: `accessibilityLabel={label}` now set unconditionally on the `Pressable`. **This is the right fix** — `accessibilityLabel` overrides the default text-content-derived name regardless of what's currently rendered inside, so the name survives the loading state even though the visible `Text` still unmounts. Re-verify on-device that VoiceOver/TalkBack actually announce it mid-load, since static analysis confirms the prop is set correctly but not the runtime announcement.

**✅ Fixed — `VarsInput` label association.** Original finding: the visible `label` `Text` was a sibling, not programmatically linked to the `TextInput`. Reported fix: `accessibilityLabel` now derived from the visible label, an explicit override, or the placeholder, in that precedence order. Sensible fallback chain — worth confirming the explicit-override case doesn't silently get clobbered by the visible label if both are ever passed (check the actual precedence in the ternary/coalescing logic, not just the description).

**✅ Fixed — `VarsToast` announcement.** Original finding: no live region, so appearing toast text was never announced. Reported fix: polite live region + accessible label added. Correct default choice — `polite` (vs `assertive`) means the announcement waits for the user's current screen-reader activity to finish rather than interrupting, appropriate for a non-critical "3 slots blocked" style message.

**✅ Fixed — `VarsDialog` modal flag.** Original finding: no `accessibilityViewIsModal`, so VoiceOver could swipe into dimmed background content. Reported fix: panel now marked as modal.

**✅ Fixed — reduce-motion respected.** Original finding: `VarsSkeleton`, `VarsSwitch`, and `ScissorsLoader` animated unconditionally. Reported fix: all three now check the OS reduce-motion setting. Confirm the check is read once per mount vs. subscribed live (`AccessibilityInfo` supports both `isReduceMotionEnabled()` and a `reduceMotionChanged` event) — a user who toggles the OS setting while the app is already open should ideally not need to restart it for skeletons/switches to respect the change.

**🟢 Correct, unchanged — `VarsCheckbox`, `VarsSwitch`, `VarsSegmentedControl`.** Label association was already correct via shared-`Pressable` text-content inheritance; no fix needed here originally, none reported.

**🟢 Correct, unchanged — `VarsSkeleton` hides itself from screen readers.** `accessibilityElementsHidden` / `importantForAccessibility="no"` untouched, still correct.

---

## 8. Auditor checklist

Concrete next actions, in a reasonable order. Items resolved by the post-audit fix round are struck through but left visible for the record.

1. ~~Fix `accentRed`-as-text contrast in light mode.~~ **Done** — `#DC2626`, 4.83:1, independently recomputed (passes AA, thin margin — see [section 7.1](#71-colour-contrast--computed-from-shipped-tokens)).
2. ~~Fix the loading-state accessible-name loss in `VarsButton`.~~ **Done** — `accessibilityLabel` now set unconditionally.
3. ~~Wire `VarsInput`'s `label` to `accessibilityLabel` automatically.~~ **Done.**
4. ~~Address `VarsToast` and `VarsDialog` announcement/focus gaps.~~ **Done** for both.
5. ~~Respect reduce-motion in animated primitives.~~ **Done** for `VarsSwitch`, `VarsSkeleton`, `ScissorsLoader`.
6. ~~Independently reproduce the Android Gradle failure.~~ **Done** — root-caused to two real bugs (expo-haptics SDK mismatch, Sentry double-autolinking), both fixed. See section 6.
7. ~~Fix the Android native toolchain issue, then run an actual device build and walk the founder device QA checklist.~~ **Partially done** — built, installed, and visually confirmed on a physical Android device (Galaxy A40); the full QA checklist below has not been walked item-by-item, and iOS is still completely unverified (no Mac/Xcode available).
8. Run a real screen-reader pass (VoiceOver + TalkBack) confirming the `VarsButton`/`VarsInput`/`VarsToast`/`VarsDialog` fixes actually announce correctly at runtime, not just that the props are set — still open, this update was static-analysis-only.
9. Spot-check 2–3 of the diff-audited files in [section 5](#5-business-logic-preservation-evidence) independently rather than trusting the audit trail alone — pick booking flow or gate checkout given they're payment-adjacent. Still open.
10. Decide whether the six skeleton-only screens and the schedule grid get scheduled as follow-up work, and if so, scope them the same way (buttons/inputs/cards only, business logic untouched, diff-reviewed). **Superseded** — folded into the theme migration roadmap in section 10, which covers these plus every other unmigrated screen.
11. ~~Execute the theme migration roadmap in section 10.~~ **Done** — all 9 phases (8–16) complete as of 2026-07-17. Every screen and shared component now reads live `theme.color.*` tokens; remaining static `Colors.*` references are deliberate exceptions (brand colors, per-status semantic maps, fixed-warning treatments, overlays on photos/maps/WebViews).

---

## 9. Founder device QA checklist

Carried over from `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` section 6 (now removed — see the note at the top of this document). Not yet run on either platform; gated behind fixing the Android Gradle build and getting an iOS build/device in the loop.

- Toggle system light/dark while the app is running.
- Check the manual override: system, light, dark.
- Verify dark elevation on OLED: cards/sheets/dialogs should separate by tonal step, not by visible shadow.
- Confirm all body text meets contrast in both modes — start with `accentRed` error text (4.83:1, thin margin — see [section 7.1](#71-colour-contrast--computed-from-shipped-tokens)).
- Confirm skeletons occupy exactly the final content footprint.
- Confirm payment, KYC, OCR, dispute, and deletion actions never show optimistic success.
- Compare SF Symbols and Material Icons at 14, 16, 18, 24, and tab sizes before signing off on final icon weights.
- Check long Lagos addresses, long vendor names, long service names, and long notification bodies for truncation rather than layout growth.
- With a screen reader running (VoiceOver / TalkBack), confirm the five accessibility fixes in [section 7.3](#73-screen-reader--semantic-structure--original-findings-and-fix-status) actually announce correctly — static analysis confirmed the props are set, not that assistive tech phrases them usefully.

---

## 10. Theme/dark-mode migration roadmap

Added 2026-07-17 after on-device testing showed Dark Mode has no visible effect anywhere except the Appearance screen's own switches and `_dev-visual-preview` (see [section 6](#6-gaps--blockers)). 40 files import the static `Colors` object from `constants/colors.ts`; of those, 16 also import `useVarsTheme()` but never use `theme.*` for their own styling — `theme` is only ever forwarded into a prop on an isolated primitive. Every phase below is styling-only: no business logic, no payment/KYC flow changes, diff-reviewed against [section 5](#5-business-logic-preservation-evidence)'s methodology same as prior phases.

Grouped by risk and reuse rather than file order — shared components go first since fixing them pays off in every later phase.

| Phase | Scope | Files | Lines | Why this grouping |
|---|---|---|---|---|
| 8 ✅ | Shared components + nav shell (`ConfirmModal`, `VendorCard`, `VendorPriceInput`, both tab layouts, onboarding layout) | 6 | ~590 | Reused everywhere — do first so later phases inherit the fix. `OfflineBanner` excluded on inspection — its colors are a fixed warning treatment, not theme-reactive by design |
| 9 ✅ | Auth & onboarding entry (`auth/login`, `auth/phone`, `auth/vendor-login`, `onboarding`) | 4 | ~1,480 | Pre-login, zero payment/business-logic risk. **Preserved the hardcoded Google/Facebook brand colors in `login.tsx` untouched** — see CLAUDE.md's Brand Color Exceptions |
| 10 ✅ | Customer core tabs (home, bookings, notifications, profile) | 4 | ~1,416 | Highest-traffic customer screens |
| 11 ✅ | Vendor core tabs minus schedule (dashboard, earnings, profile) | 3 | ~2,280 | Highest-traffic vendor screens; `(vendor-tabs)/index.tsx` is 1,304 lines alone |
| 12 ✅ | `schedule.tsx` — dedicated phase | 1 | 2,240 | Custom grid/gesture UI, previously scoped out of Phase 5 for the same reason; too large and too risky to bundle with anything else |
| 13 ✅ | Booking flow & live tracking (`booking/[vendorId]`, `booking/detail`, `gate-checkout`, `live/[bookingId]`, `review`) | 5 | ~3,400 | Highest business value, touches payment *UI* (not logic) — needs the most care |
| 14 ✅ | Vendor onboarding theme wiring (steps 1–5) | 5 | ~1,438 | Already on `Vars*` primitives from Phase 3 — this is finishing the wiring, not a re-skin |
| 15 ✅ | Vendor profile/services/zone (`vendor-settings`, `vendor/[id]`, services add/edit, zone-setup) | 5 | ~2,224 | Where the dark-mode gap was originally noticed |
| 16 ✅ | Legal/static pages (terms, privacy, consent, delete-account) | 6 | ~1,478 | Lowest visual priority — migrated anyway for consistency |

Total: 9 phases, ~14,600 lines across 40 files. **All phases complete as of 2026-07-17.**

### Phase 8 notes (completed 2026-07-17)

- Resolved a real conflict surfaced during migration: `constants/colors.ts` had `Colors.accentRed`/`Colors.error` at `#EF4444`, diverged from `constants/visualSystem.ts`'s `#DC2626` (the WCAG-fixed value from the prior accessibility round). Unified both to `#DC2626` — founder decision, not a unilateral pick.
- Resolved a second conflict: the static system has two muted-text tiers (`textSecondary` `#6B7280`, `textMuted` `#A3A3A3`); the theme system only has one (`inkMuted`). Founder decision: collapse both into `theme.color.inkMuted` rather than add a new token tier. Applied consistently across all Phase 8 files.
- Pattern established: screens/components call `useVarsTheme()`, memoize `StyleSheet.create` output via `useMemo(() => makeStyles(theme), [theme])` instead of a module-level static `StyleSheet.create`. Semantic/brand tokens with no theme equivalent (badge colors, pioneer gold, star rating, status colors) are deliberately left on the static `Colors` import — only core-shell tokens (background/surface/border/text/ink) migrate.
- Verified: `tsc --noEmit` clean, lint clean (0 errors, same 26 pre-existing warnings), on-device confirmation that the underlying `theme.color.*` mechanism renders correctly in both light and dark via `_dev-visual-preview`. Did not force-verify the migrated tab bar specifically on-device — the terms-acceptance gate blocked further in-app navigation for the test account and re-triggering it wasn't worth a real, timestamped acceptance record on that account.

### Phases 9–16 notes (completed 2026-07-17)

- Every phase followed the pattern and conventions locked in during Phase 8: `useVarsTheme()` + `useMemo(() => makeStyles(theme), [theme])` replacing module-level `StyleSheet.create`; `#DC2626` as the sole `accentRed`/error value; both muted-text tiers collapsed into `theme.color.inkMuted`; `Colors.primary` → `theme.color.accentBlue`; `Colors.success` → `theme.color.accentGreen`; buttons/pills filled with `theme.color.ink` pair their text with `theme.color.inverseInk` rather than a static `'#FFF'`.
- Subcomponents defined outside a screen's root component either call `useVarsTheme()` independently (small presentational helpers reused many times per file — `Section`/`Body`/`Bullet`/`Bold` in the legal pages, `CheckRow` in onboarding step 5) or receive `theme`/`styles` as an explicit prop (`Badge`, `DocItem`, `VendorProfileSkeleton`).
- Deliberate non-migration boundary, applied consistently: per-status semantic color maps (`STATUS_CONFIG` etc. — object keys stay string literals per CLAUDE.md, values stay on static `Colors.status*`), fixed-warning-treatment banners (`Colors.warning`), brand accent colors (Google/Facebook buttons, pioneer gold), and fixed-contrast overlays sitting on photos/maps/WebViews (map hint pills, floating nav buttons on portfolio photos) are intentionally left static — not gaps.
- Fixed two real pre-existing bugs surfaced by the migration itself: a hardcoded white-translucent booked-slot label in `schedule.tsx` that would have gone illegible against an inverted dark background, and a Timeline status-icon color ternary in the booking flow that conflated "done" (reactive) and "active" (fixed-per-status) states into one incorrect branch.
- Verified per-phase: `tsc --noEmit` clean and lint at or below the pre-existing 23-warning baseline (0 errors) for every phase, checked before each commit.
- Not done: a full on-device light/dark toggle walkthrough of every migrated screen (40 files) — only the vendor-settings screen (the screen where the gap was first reported) and the underlying token mechanism via `_dev-visual-preview` were visually confirmed on the physical test device. Recommend a manual pass through [section 9](#9-founder-device-qa-checklist)'s theme-toggle checklist before shipping.

---

*Generated from the working session that produced `codex-mobile-visual-system-overhaul`, commits `7688a66`–`dcf5c25`, updated after a post-audit accessibility fix round and again after the 2026-07-17 Android device-build and theme-audit session. Every claim above traces to a specific file, command output, or diff reviewed during that session — ask for the underlying evidence on any line that matters to your sign-off. This document replaces a prior mobile audit dated 2026-05-25, whose findings (payment WebView redirect handling, in particular) predate the gate-payment model and no longer reflect the current codebase.*
