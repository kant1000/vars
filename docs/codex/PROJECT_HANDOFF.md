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
- Worktree: dirty
- `apps/mobile/package.json` merge conflict: resolved and staged
- Root `CLAUDE.md`: deleted in the current worktree
- Payment, KYC, and maps credentials are not activated yet by the owner. Treat related audit gaps as expected external setup, not code failures.
- Android Studio is installed at `C:\Program Files\Android\Android Studio`; its bundled JDK works, but `adb`, `emulator`, and `eas` are not available on PATH yet.

Current intentional source/setup changes include:

- `.gitignore`
- `apps/mobile/package.json`
- `apps/mobile/.eslintrc.js`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/lib/auth.ts`
- `supabase/functions/*reschedule*`
- `supabase/migrations/20240101000015_reschedule_expires_at.sql`
- `yarn.lock`
- `AGENTS.md`
- `apps/admin/.gitignore`
- `apps/mobile/assets/images/*`
- `docs/ACCESS_AND_AUDIT.md`
- `docs/codex/*`
- `scripts/audit-access.ps1`

Generated artifacts such as `apps/mobile/dist/`, `apps/mobile/dist-*`, `.next/`, and `apps/mobile/expo-env.d.ts` should stay ignored.

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

Recent results: admin build passed, landing build passed, mobile TypeScript passed, mobile lint passed with warnings only, and Android Expo export passed. Remove `apps/mobile/dist-audit-android` after export checks.

## Credentials

Required names are documented in `docs/ACCESS_AND_AUDIT.md`.

The audit script reports whether env names are present but does not print values. Add real values only to local env files or service dashboards, never to committed docs.
