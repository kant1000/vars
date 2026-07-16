# VARS Mobile Visual System: Implementation Plan
### Founder-approved. Hand this to Claude Code and work through it phase by phase together.

Status: the direction in `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` has been reviewed and approved by the founder (Seyi Ibitoye). This document is what happens next: a fixed list of immediate fixes, then a systematic, checkpointed rollout across the real app. Read `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` in full before starting anything here, it is still the design spec. This document is the execution plan on top of it.

---

## 0. Decisions locked this session, do not re-litigate these

1. **Appearance direction: approved.** System default appearance with a manual override in customer and vendor settings, the five step elevation ladder, and the token values, all as specified in `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` sections 2.1 and 2.2, are approved as written.
2. **Container border override, priority 0.** The existing project context doc says container borders are solid `#111111`. The shipped reference code in `apps/mobile/constants/visualSystem.ts` uses the fainter `inkFaint` token instead. The founder has ruled: the fainter `inkFaint` treatment is now correct, and it overrides the old `#111111` rule. This is a deliberate override, not an inconsistency to reconcile the other way. Update the documentation to match the code, not the code to match the old documentation.
3. **Two missing catalogue primitives, build these first.** A switch/toggle primitive and a tab/nav item styling primitive were identified as gaps in the last review. Both are approved to be built now, matching the proportions, spacing scale, and prop conventions of the nine primitives already in `apps/mobile/components/ui/primitives.tsx`, before any real screen is touched.
4. **Two known bugs, fix immediately.** The `add` icon silently renders a checkmark instead of a plus. A lint warning on an `Array<T>` type exists in `primitives.tsx`. Both are approved to be fixed as part of this same pass.

Everything else in this document (the phased rollout) proceeds only after Phase 0 is complete and confirmed clean.

---

## Phase 0: Foundation

Nothing in Phase 1 onward starts until every item below is done and the checkpoint at the end of this phase passes.

### 0.1 Update `docs/VARS_PROJECT_CONTEXT.md`

Two edits. Suggested wording below, adjust only for grammar, keep the substance:

**"App appearance" row**, replace the current self-referential wording with a plain statement of what is now true:

> Light and dark appearance are both locked for the mobile app. Default control is system appearance, with a manual override available in customer and vendor settings (`vars_appearance_override: system | light | dark`, stored locally, no backend state). Light mode keeps the monochrome white shell. Dark mode uses the splash screen's black surface as its reference point and communicates depth through the five step elevation ladder defined in `apps/mobile/constants/visualSystem.ts`, not through light mode shadows carried across unchanged. Approved by founder, [date].

**"Containers" row**, apply the priority 0 override:

> Always monochrome: transparent bg or surface-tone bg, 1px to 1.5px border. Border color is `inkFaint` (`#D0D0D0` light, `#555555` dark), not solid ink. This supersedes the earlier `#111111` container border rule, effective [date], founder approved override. No coloured card fills, pill backgrounds, or button fills except black.

Also check the "State signalling" row immediately below it. It currently says border weight alone signals state. Confirm this still reads correctly now that the baseline border is fainter, or propose an adjusted line. Do not silently change it without noting the reasoning; this one row was not part of the explicit override above.

### 0.2 Build the two missing primitives

**`VarsSwitch`** (on/off system toggle, distinct from `VarsCheckbox`, which stays for consent and selection). First real use: the vendor online/offline toggle.

- Props, matching the existing convention: `value: boolean`, `onChange: (value: boolean) => void`, `theme?: VarsTheme`, `disabled?: boolean`, optional `label?: string` for an inline labeled row the same way `VarsCheckbox` takes one.
- Minimum 44px tall hit target, consistent with `VarsCheckbox`'s `checkRow`. A track around 44 by 26 with an inset thumb circle is a reasonable starting point.
- Shape call to make and document: the rest of the catalogue uses `VARS_RADIUS` (5) everywhere. A toggle track is one of the few places a fully rounded pill (radius equal to half the height) reads correctly as a switch to most users. Try the pill shape first. If a squared track is tested instead for stricter visual consistency, it needs a side by side comparison before it's chosen, and either way the decision gets one line in the catalogue entry explaining why.
- Color: on state track uses `accentGreen`, matching the existing "online dot" accent convention already documented in the brand system. Off state track uses a theme aware surface tone with an `inkFaint` border. Thumb is always a light, near white circle in both themes, with enough of an edge (tonal or a very small shadow) to stay visible against the track in both light and dark.
- Disabled: same 0.5 opacity treatment as every other primitive.
- Accessibility: `accessibilityRole="switch"`, `accessibilityState={{ checked: value, disabled }}`.

**Tab/nav item styling primitive.** This is not a new tab bar and does not touch navigation structure, Expo Router keeps owning the actual bottom tabs, per the standing rule that structure does not change. What's missing is a small, consistent styling piece used inside `tabBarIcon` / `tabBarLabel` so active and inactive states look consistent with the rest of the system: active state bold 700 weight, ink colored; inactive state regular 400 weight, `inkMuted` colored, exactly matching the "typography weight signals selection" rule already documented in the brand system. It should render its glyph through `VarsIcon` internally. Confirm it reads correctly against the tab bar's own background, which should sit at elevation step 2 ("cards, sticky bars, tab bars") from the existing ladder.

Add both to the fixed catalogue table in `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` section 3.2, and export both from `apps/mobile/components/ui/index.ts` alongside the existing nine.

### 0.3 Fix the two known bugs

1. `components/icons.tsx` has no dedicated plus glyph, so `add` is currently silently aliased to `CheckIcon` inside `SvgIconByName` in `primitives.tsx`. Add a new `PlusIcon` SVG matching the stroke weight and style of the existing icon set, then change the mapping from `add: CheckIcon` to `add: PlusIcon`.
2. `primitives.tsx` line 309: change `options: Array<{ value: T; label: string }>` to `options: { value: T; label: string }[]` to clear the lint warning.

### 0.4 Repo cleanup

1. Commit `fa55b66` currently sits on top of the overhaul branch but is an unrelated pre-existing bug fix in vendor onboarding step 2. Cherry-pick it onto `main` directly (or open it as its own small PR and merge that first), then rebase the overhaul branch onto the updated `main` so the overhaul PR contains only overhaul commits.
2. `screen.png` has been sitting untracked in the working tree across sessions. Work out what it actually is. If it has no further use, delete it. If it's meant to be kept, either commit it deliberately in the right place or add it to `.gitignore`. Do not leave it sitting in limbo.
3. General pass: confirm the branch is current with `main`, confirm no other stray untracked or uncommitted files exist, confirm there are no merge conflicts, before this goes up for review again.

### Checkpoint 0

Stop here. Confirm `tsc` and lint both pass clean across the whole workspace. Build a quick throwaway test screen that renders all eleven primitives (the original nine plus the two new ones) in both light and dark, on both platforms, and get founder eyes on it before Phase 1 starts.

---

## Phase 1: Infrastructure

- Add an app wide `ThemeProvider` wired to system appearance detection.
- Add manual override persistence: read and write `vars_appearance_override` in AsyncStorage, expose it from both customer and vendor settings screens.
- Wire `SafeAreaProvider` with `initialWindowMetrics` in `app/_layout.tsx` to remove the first paint safe area jump.

**Checkpoint:** founder manually toggles system light/dark and the in-app manual override on a real iOS device and a real Android device, confirms no flash of wrong theme on launch, confirms no safe area jump.

## Phase 2: Skeletons on read heavy screens

Discovery feed, bookings list, notifications, vendor public profile, customer profile, vendor profile, earnings. Replace full screen loaders with `VarsSkeleton` shaped to the real content footprint on each of these.

**Checkpoint:** founder reviews each screen's loading state feels instant relative to before, and confirms no layout shift when real content swaps in.

## Phase 3: Vendor onboarding

All five onboarding steps. Migrate buttons, inputs, cards, and checkboxes to the primitive catalogue. Bounded, high impact, good first real migration.

**Checkpoint:** founder walks the full onboarding flow start to finish in both themes.

## Phase 4: Booking flow and gate checkout

Migrate visual primitives only. The honest wait rule from the original brief is non negotiable here: card verification, gate charge, and any payment adjacent screen never show an optimistic success state ahead of server confirmation, regardless of how the loading state is dressed up.

**Checkpoint:** founder specifically checks that no payment or verification step ever appears to succeed before it actually has.

## Phase 5: Schedule

Highest interaction density screen, migrate last, once the primitives have proven stable on lower risk screens.

**Checkpoint:** founder tests the full range of schedule interactions (block, unblock, range select, recurring chips, undo toasts) for regressions.

## Phase 6: Icon system migration

Evaluate `expo-symbols` (or the React Navigation SF Symbol / Material Symbol components) for compatibility with the current Expo SDK and a dev build. Test the SF Symbols and Material Symbols weight and style pairing side by side at 14, 16, 18, 24, and tab bar sizes before committing to one. Swap `VarsIcon`'s internal rendering behind its existing name based API; call sites should not need to change.

**Checkpoint:** founder visual QA using the checklist already written in `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` section 6.

## Phase 7: Lock it all in

Once every phase above has passed founder review:

- Update the full visual system table in `docs/VARS_PROJECT_CONTEXT.md` to reflect the final shipped system, not just the two rows touched in Phase 0.
- Change the status line at the top of `docs/MOBILE_VISUAL_SYSTEM_OVERHAUL.md` from "research deliverable and reference implementation" to "implemented."
- Confirm every decision that started as an open question in the original brief (appearance control model, elevation ladder, loading scope, border treatment, icon pairing) has an explicit, dated, founder approved line in the project context document. Nothing should still read as a recommendation once this phase closes.

---

## Working rules for the whole effort

- Stop at every checkpoint above and wait for founder review before continuing to the next phase.
- One phase per commit or PR where practical, so review stays tractable.
- Never introduce an optimistic or fake success state on payment, KYC, dispute, bank verification, or account deletion surfaces, at any phase.
- Do not touch navigation structure, business logic, or the locked V1/V2 feature scope at any point in this rollout.
- If anything surfaces a new conflict with a decision in `docs/VARS_PROJECT_CONTEXT.md` beyond the two explicit overrides listed in Section 0, flag it and wait for a founder decision. Do not resolve it unilaterally and do not mark anything "approved" or "locked" without the founder actually having said so.
