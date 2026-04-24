# VARS Cleanup Roadmap

This roadmap tracks the practical path to make the whole app work as intended.

## Phase 1: Stabilize The Repo

- Resolve the merge conflict in `apps/mobile/package.json`. Done.
- Inspect the `yarn.lock` changes caused by the conflict. Done enough for install/lint/typecheck validation; keep reviewing before commit.
- Decide whether `apps/mobile/dist/` should be ignored or committed. Done: ignore generated export output.
- Decide whether new mobile image assets are source assets or generated artifacts.
- Review the deletion of `CLAUDE.md` and confirm whether it should stay deleted.
- Re-run `corepack yarn audit:access`. Done.

## Phase 2: Dependency And Build Health

- Run workspace install/check with the pinned Yarn version.
- Build `apps/admin`. Passed.
- Build `apps/landing`. Passed.
- Lint `apps/mobile`. Passed with warnings only.
- Fix broken imports, type errors, and package mismatches. Initial TypeScript blockers fixed.
- Confirm all workspace package names and dependency versions are intentional.

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

## Immediate Next Step

Review remaining dirty source changes and decide commit grouping. For Android APK testing, install/configure EAS CLI or Android SDK platform tools, then produce a preview/internal Android build.
