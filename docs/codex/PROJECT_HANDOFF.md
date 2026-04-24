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

Last updated: 2026-04-24 (SEO update).

- Current branch: `main`
- Default branch: `main` (set as default on GitHub 2026-04-24)
- Remote: `origin`
- GitHub read access: confirmed through `git ls-remote`
- Node: available
- Corepack: available
- Yarn: pinned in `package.json` as `yarn@1.22.22`
- Supabase CLI: available
- Worktree: **clean** — all audit and SEO fixes committed and pushed
- Landing Phase 1 SEO: **complete and live** at bookwithvars.com
- Google Search Console: verified via DNS TXT record; sitemap submitted (https://www.bookwithvars.com/sitemap.xml, 3 pages indexed)
- Vercel production branch is tracking `claude/build-app-from-spec-6QwSN` (force-pushed to match `main`; both branches are identical)
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

**Landing Phase 1 SEO (2026-04-24)** — all files added or updated on `main`:

New files:
- `apps/landing/src/app/sitemap.ts` — `/`, `/privacy`, `/terms` entries
- `apps/landing/src/app/robots.ts` — allow all; sitemap URL set
- `apps/landing/src/app/manifest.ts` — PWA manifest, `#111111` background, `#0A7AFF` theme
- `apps/landing/src/app/opengraph-image.tsx` — 1200×630 edge OG image
- `apps/landing/src/app/privacy/page.tsx` — privacy policy page
- `apps/landing/src/app/terms/page.tsx` — terms of service page

Updated files:
- `apps/landing/src/app/layout.tsx` — added canonical, `lang="en-GB"`, JSON-LD Organization + WebSite schema
- `apps/landing/src/app/page.tsx` — FAQPage JSON-LD, vendor acquisition copy, Pioneer counter deemphasis at zero (opacity 0.45, label changes to "Pioneer programme full")
- `apps/landing/vercel.json` — non-www → www redirect rule added

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

## Infrastructure Notes

### Supabase API Keys — Migrated (2026-04-24)

Supabase has migrated from legacy JWT-based API keys to a new key system. Legacy `service_role` and `anon` JWT keys have been disabled.

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` now uses the `sb_publishable_` prefix
- `SUPABASE_SERVICE_ROLE_KEY` now uses the `sb_secret_` prefix
- Vercel environment variables have been updated to the new key format
- Any code referencing the old JWT key format (`eyJ...`) must use the new keys from Vercel environment variables — no hardcoded keys anywhere in the codebase
- Edge functions in `supabase/functions/` consume `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase secrets (not Vercel) — those secrets will also need updating when credentials are activated in production

### Vercel Production Branch

- The `vars-landing` Vercel project is tracking `claude/build-app-from-spec-6QwSN` as its production branch (Hobby plan limitation — production branch cannot be changed via the UI)
- `main` and `claude/build-app-from-spec-6QwSN` are kept in sync after every push to `main` by running:

```bash
git push origin main:claude/build-app-from-spec-6QwSN
```

- This sync step is required after every push to `main` until the account is upgraded to Vercel Pro
- On Vercel Pro upgrade: change the production branch to `main` permanently in Project Settings → Git, then the sync step can be dropped

## Credentials

Required names are documented in `docs/ACCESS_AND_AUDIT.md`.

The audit script reports whether env names are present but does not print values. Add real values only to local env files or service dashboards, never to committed docs.
