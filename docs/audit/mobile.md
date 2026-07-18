# VARS Mobile Visual System Overhaul — Audit Brief

Branch: `codex-mobile-visual-system-overhaul` — 11 commits, pushed to origin (`7688a66`..`dcf5c25`)
Founder-approved: 2026-07-17
Status: **Implementation complete** (primitive catalogue + app-wide dark-mode theme wiring). **On-device QA not yet run** — see [Gaps & blockers](#6-gaps--blockers)

> **2026-07-18 addendum:** a second, larger phase of work happened directly on `main` (not this branch) after the primitive catalogue landed: wiring live `theme.color.*` tokens into every screen app-wide so dark mode actually renders correctly, plus a related `ScissorsLoader` contrast fix. Condensed in [section 10](#10-themedark-mode-migration-roadmap-complete); the decisions that need to stay accurate long-term are now in `docs/VARS_PROJECT_CONTEXT.md`'s Visual System table, not here.

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

## 3. Phase-by-phase log (condensed — full detail in git history)

What shipped in each phase, against `docs/VARS_Visual_System_Implementation_Plan.md` (since removed — decisions locked into `docs/VARS_PROJECT_CONTEXT.md`).

| Phase | Scope | Commit |
|---|---|---|
| 0 — Foundation | Built `VarsSwitch`/`VarsTabItem` (the two catalogue gaps); fixed a mis-mapped icon; dev-only preview route rendering all 11 primitives in both themes | `4b2af1d` `39aaa35` |
| 1 — Infrastructure | `ThemeContext` (system appearance + persisted override), folded into the existing splash-hold gate, `StatusBar` follows resolved appearance, appearance settings UI on both roles | `50859dd` |
| 2 — Skeletons | `VarsSkeleton` on 7 screens: discovery, bookings, notifications, both profiles, vendor public profile, earnings — shapes matched to real content dimensions, not approximated | `58e9ec8` |
| 3 — Vendor onboarding | All 5 steps migrated to the primitive catalogue; chip/pill selectors deliberately left alone (architecturally incompatible with `VarsSegmentedControl`) | `33defbe` |
| 4 — Booking flow & gate checkout | Cards/inputs/buttons only — the honest-wait payment states (`webview`, `polling` phases) left byte-for-byte untouched | `65ed63c` |
| 5 — Schedule | Undo toast + booking sheet only — slot grid/gesture UI deliberately out of scope (became Phase 12 of [section 10](#10-themedark-mode-migration-roadmap-complete)) | `8deaaec` |
| 6 — Icon system | SF Symbols (iOS) / classic Material Icons (Android, not Material Symbols — needs an SDK upgrade past 52) behind `VarsIcon`; platform isolation verified via compiled-bundle inspection | `44abb86` |
| 7 — Lock it in | Corrected a stale "state signalling" rule; locked elevation ladder, catalogue, loading/wait-state, and icon-system decisions into `docs/VARS_PROJECT_CONTEXT.md` | `dcf5c25` |

**Post-audit accessibility fix round** (same session): `accentRed` contrast (`#EF4444` → `#DC2626`), `VarsButton` loading-state accessible-name loss, `VarsInput` label association, `VarsToast` live-region, `VarsDialog` modal flag, reduce-motion support added to `VarsSwitch`/`VarsSkeleton`/`ScissorsLoader`. Independently re-verified per-fix in [section 7](#7-accessibility-assessment-wcag-oriented).

Business-logic preservation methodology and evidence for phases 3–5: [section 5](#5-business-logic-preservation-evidence).

---

## 4. File inventory

Every file touched across Phases 0–7 is in the git history for `codex-mobile-visual-system-overhaul` (`7688a66`..`dcf5c25`); Phases 8–16's ~40 files are in `main`'s 2026-07-17–18 commits (phase→scope mapping in [section 10](#10-themedark-mode-migration-roadmap-complete)). Not duplicated here — git is the authoritative record, and a static list here would already be stale relative to it.

One exception worth keeping visible: `vendor-onboarding/step-2-services.tsx` also received an unrelated one-line pre-existing bug fix (`DURATION_OPTIONS` reference error, predates this branch) cherry-picked directly onto `main` in Phase 0 rather than carried on this branch — easy to miss if you're only looking at branch diffs.

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

### 🟢 Fixed — Dark mode is now wired into every real screen (2026-07-18)

Was: `ThemeProvider`, persistence, and the Appearance toggle UI all worked in isolation, but `theme` was never used to style any screen itself — every screen's actual styling came from the static, theme-unaware `Colors` object, so toggling Dark Mode changed nothing anywhere except the Appearance screen's own switches. Surfaced by the founder testing the build on-device, not caught by static analysis — a reminder that "types pass, lint passes, bundle compiles" is not evidence a *feature* works.

Fixed across all 9 phases in [section 10](#10-themedark-mode-migration-roadmap-complete) — every screen and shared component now reads live `theme.color.*` tokens. **Not full primitive-catalogue adoption** — this wired theme tokens into each screen's existing hand-built styles (`useVarsTheme()` + `makeStyles(theme)`), it did not additionally convert those screens onto `VarsButton`/`VarsSurface`/etc. The two gaps below are about that separate, still-open axis.

### 🟠 Scoped gap — Six skeleton screens still hand-build their interactive elements

Discovery, bookings, notifications, customer profile, vendor profile, vendor public profile, and earnings got `VarsSkeleton` loading states in Phase 2 and are now dark-mode-correct (section 10), but their buttons, cards, and inputs still aren't built from the primitive catalogue — that migration was never scoped into either phase of work.

### 🟠 Scoped gap — Schedule's grid/gesture UI never adopted the primitive catalogue

Deliberate, per Phase 5's own risk framing — the slot grid, drag-based range select, recurring-day chips, and block/unblock UI never touched `VarsButton`/`VarsSurface`/etc. It did get dark-mode theme wiring in section 10's Phase 12, so it's visually correct in both themes now, but it's still hand-built JSX rather than primitive components — the single highest-density interaction surface in the app with zero primitive-catalogue adoption.

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

## 10. Theme/dark-mode migration roadmap (complete)

Added 2026-07-17 after on-device testing showed Dark Mode had no visible effect anywhere except the Appearance screen's own switches and `_dev-visual-preview`. All 9 phases below shipped 2026-07-17–18, wiring live `theme.color.*` tokens into every screen and shared component app-wide (~40 files) — previously `theme` was only ever forwarded into an isolated primitive prop. Every phase was styling-only: no business logic, no payment/KYC flow changes, diff-reviewed against [section 5](#5-business-logic-preservation-evidence)'s methodology.

| Phase | Scope | Files |
|---|---|---|
| 8 | Shared components + nav shell | 6 |
| 9 | Auth & onboarding entry | 4 |
| 10 | Customer core tabs | 4 |
| 11 | Vendor core tabs minus schedule | 3 |
| 12 | `schedule.tsx` (dedicated — 2,240 lines) | 1 |
| 13 | Booking flow & live tracking | 5 |
| 14 | Vendor onboarding theme wiring | 5 |
| 15 | Vendor profile/services/zone | 5 |
| 16 | Legal/static pages | 6 |

**The decisions and conventions that need to stay accurate going forward are locked into `docs/VARS_PROJECT_CONTEXT.md`'s Visual System table, not here** — `accentRed` = `#DC2626`, the `inkMuted` muted-text collapse, the deliberate non-migration boundary (status color maps, brand colors, fixed-contrast overlays), the `makeStyles(theme)` pattern, and the `ScissorsLoader` color-flip rule (a related bug found and fixed in the same pass: its `color` prop is a fixed SVG fill, not a theme token, and was hardcoded at every call site — invisible on inverted surfaces until fixed 2026-07-18).

Two further fixes landed after this table closed, same effort: native `Alert.alert` confirmations (sign-out, "Coming soon" placeholders, "Go online first") replaced with the themed `ConfirmModal` component since native alerts follow the OS system theme, not the app's override; and two hand-rolled booking-flow modals (cancel, reschedule) consolidated onto `ConfirmModal` to stop the app growing a second ad-hoc modal pattern. Full list of remaining hand-rolled (but already theme-correct) modals and the `VarsDialog`-vs-`ConfirmModal` architecture note: `docs/VARS_PROJECT_CONTEXT.md`.

**Not done:** a full on-device light/dark toggle walkthrough of every migrated screen — see [section 9](#9-founder-device-qa-checklist).

---

*Generated from the working session that produced `codex-mobile-visual-system-overhaul`, commits `7688a66`–`dcf5c25`, updated after a post-audit accessibility fix round, again after the 2026-07-17 Android device-build and theme-audit session, and condensed on 2026-07-18 once both phase-logs (0–7, 8–16) were fully complete — their still-relevant decisions moved to `docs/VARS_PROJECT_CONTEXT.md`, their still-open items (device QA, screen-reader pass) kept intact in sections 6 and 9. Every claim above traces to a specific file, command output, or diff reviewed during that session — ask for the underlying evidence on any line that matters to your sign-off. This document replaces a prior mobile audit dated 2026-05-25, whose findings (payment WebView redirect handling, in particular) predate the gate-payment model and no longer reflect the current codebase.*
