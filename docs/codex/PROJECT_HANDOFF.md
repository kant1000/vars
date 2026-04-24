# VARS Codex Project Handoff

This folder is Codex-owned project context. It is meant to make future Codex sessions productive without relying on chat history.

## Project

VARS is an on-demand beauty and grooming marketplace.

The repo is a Yarn workspace monorepo with:

- `apps/mobile`: Expo / React Native mobile app.
- `apps/admin`: Next.js admin dashboard.
- `apps/landing`: Next.js landing site.
- `packages/shared`: shared TypeScript package.
- `supabase`: database migrations and Edge Functions.
- `docs`: product and implementation context.

Primary existing context:

- `README.md`
- `docs/VARS_PROJECT_CONTEXT.md`
- `docs/ACCESS_AND_AUDIT.md`

## Operating Rules

- Preserve user and tool changes in the dirty worktree.
- Do not revert files unless explicitly asked.
- Do not commit secrets or print secret values.
- Treat `.env`, `.env.local`, `.env.*.local`, and app env files as local-only.
- Prefer small, reviewable cleanup batches.
- Resolve merge conflicts before running broad validation.
- Use the repo's existing Yarn workspace structure.
- Use Corepack if `yarn` is not globally available.

## Access Model

Durable access requirements and checks live in:

- `docs/ACCESS_AND_AUDIT.md`
- `scripts/audit-access.ps1`

Useful commands:

```powershell
corepack yarn audit:access
corepack yarn audit:access:network
```

The network audit confirms GitHub remote read access against:

```text
https://github.com/kant1000/vars.git
```

## Current State

Last updated: 2026-04-24.

- Current branch: `claude/build-app-from-spec-6QwSN`
- Remote: `origin`
- GitHub read access: confirmed through `git ls-remote`
- Node: available
- Corepack: available
- Yarn: pinned in `package.json` as `yarn@1.22.22`
- Supabase CLI: available
- Worktree: **clean** — all audit fixes committed and pushed
- Root `CLAUDE.md`: present and committed
- Payment, KYC, and maps credentials are not activated yet by the owner. Treat related audit gaps as expected external setup, not code failures.
- Android Studio is installed at `C:\Program Files\Android\Android Studio`; its bundled JDK works, but `adb`, `emulator`, and `eas` are not available on PATH yet.

Generated artifacts such as `apps/mobile/dist/`, `apps/mobile/dist-*`, `.next/`, `**/next-env.d.ts`, and `apps/mobile/expo-env.d.ts` are gitignored.

## Build Fixes Applied (2026-04-24)

**Admin build** — was failing at `Collecting page data` because `supabase.ts` instantiated the browser Supabase client at module-import time (`export const supabase = createClient(...)`). With no env vars set at build time, all four data-fetching pages (`/bookings`, `/dashboard`, `/vendors`, `/disputes`) crashed on import. Fixed by converting the export to a lazy `getSupabaseBrowserClient()` function and adding `export const dynamic = 'force-dynamic'` to each of those pages so Next.js renders them at request time only.

**Mobile TypeScript** — two errors:
1. `app/(tabs)/profile.tsx`: `pickAndUploadImage` called with two positional args; function signature takes `{bucket, path, aspect?}`. Fixed.
2. `lib/auth.ts`: `AuthSession.parseRedirectResult` was removed in `expo-auth-session` v6. Replaced with `expo-linking` URL parsing (`Linking.parse`).

**Mobile lint** — no ESLint config existed and `eslint`/`@typescript-eslint` packages were absent from devDependencies. Added `eslint`, `@typescript-eslint/parser`, and `@typescript-eslint/eslint-plugin` to devDependencies; added `eslint.config.js` (flat config format). Now passes: 0 errors, 16 warnings (all `no-unused-vars`, none blocking).

**Android JS export** — passes: 4.9 MB Hermes bytecode bundle, 1546 modules. Delete `apps/mobile/dist-audit-android/` after verification.

**Reschedule flow** — three bugs fixed in the edge functions (see also `supabase/functions/`):
1. `customer-accept-reschedule`: old transport buffer calendar rows were not deleted before creating new ones for the suggested slot. Fixed.
2. `customer-decline-reschedule`: transport buffer rows were not deleted on decline. Fixed.
3. Missing expiry: no function existed to expire `rescheduled_pending` bookings after 1 hour. Created `supabase/functions/reschedule-expire/index.ts` and registered it as an hourly cron in migration `20240101000015`.

## First Commands For Future Sessions

```powershell
git status --short --branch
corepack yarn audit:access
```

If network is needed:

```powershell
corepack yarn audit:access:network
```

Do not start with broad formatting or dependency rewrites. Inspect the conflict and dirty files first.

## Validation Targets

Current validation baseline:

```powershell
corepack yarn install --frozen-lockfile
corepack yarn workspace @vars/admin build
corepack yarn workspace @vars/landing build
corepack yarn workspace @vars/mobile run tsc --noEmit
corepack yarn workspace @vars/mobile lint
corepack yarn workspace @vars/mobile run expo export --platform android --output-dir dist-audit-android
```

Current results (2026-04-24): admin build ✅, landing build ✅, mobile TypeScript ✅ (0 errors), mobile lint ✅ (0 errors / 16 warnings), Android Expo export ✅ (4.9 MB bundle). Delete `apps/mobile/dist-audit-android/` after export checks.

## Credentials

Required names are documented in `docs/ACCESS_AND_AUDIT.md`.

The audit script reports whether env names are present but does not print values. Add real values only to local env files or service dashboards, never to committed docs.
