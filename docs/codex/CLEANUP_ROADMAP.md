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

## Immediate Next Steps

- Merge `claude/build-app-from-spec-6QwSN` into `main` once the owner has reviewed the branch.
- Android APK delivery: use EAS Cloud Build (`eas build --platform android --profile preview`) rather than a local Android Studio build — avoids the Windows PATH/JDK friction and produces a shareable `.apk` or `.aab` without needing `adb` or an emulator on the dev machine.
- Activate Paystack, Youverify, and Google Maps credentials once Nigerian business registration completes. Set in Supabase Edge Function secrets and mobile `.env.local`; no code changes needed.
