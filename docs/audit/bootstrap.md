# Bootstrap And Environment Validation

Date: 2026-05-25

## Commands Run

- `git status --short --branch`: branch `main...origin/main`; untracked `apps/mobile/assets/images/vars-logo-email.png`.
- `corepack yarn audit:access`: failed in normal sandbox because the script invokes `yarn` directly and global Yarn was not found.
- `corepack yarn audit:access:network`: failed in sandbox network, passed with approved network access.
- `corepack yarn install --frozen-lockfile`: failed in sandbox with `AggregateError [EACCES]`; passed with approved network/filesystem access.
- `corepack yarn workspace @vars/admin build`: passed.
- `corepack yarn workspace @vars/landing build`: passed.
- `corepack yarn workspace @vars/mobile run tsc --noEmit`: passed.
- `corepack yarn workspace @vars/mobile lint`: failed with `EPERM: operation not permitted, scandir 'C:\Users\Oluwaseyi'` from `eslint-plugin-import`.
- `corepack yarn workspace @vars/mobile run expo export --platform android --output-dir dist-audit-android`: failed in sandbox because `hermesc.exe` was permission denied; passed with approved execution.
- `supabase --version`: `2.84.2`, with newer CLI available.
- `supabase status`: failed; Docker engine unavailable and OAuth env vars unset.
- `docker --version`: failed; Docker not on PATH.
- `deno --version`: failed; Deno not installed locally.
- `corepack yarn workspace @vars/admin lint` and landing lint: fail interactively because Next.js prompts to create ESLint config.

## Issues

### P0: Local Supabase Cannot Start Or Reset

Severity: Critical

Repro:

```powershell
supabase status
docker --version
```

Observed:

- Docker is not installed/on PATH.
- Supabase cannot inspect containers.
- `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` are unset.

Root cause: local DB/runtime dependencies are not documented as enforced prerequisites and the stack is not reproducible from the current machine.

Fix: document Docker Desktop setup, required OAuth placeholders, `supabase start`, `supabase db reset`, and `supabase functions serve` in a single bootstrap script. CI should run migrations in a clean Postgres/Supabase container.

### P0: Migrations Are Likely Not Replayable

Severity: Critical

Evidence: `supabase/migrations/20240101000014_reschedule_pending.sql` runs `ALTER TYPE booking_status ADD VALUE`, but the type created in the initial schema is `booking_status_enum`. Migration 018 fixes the value later, but a fresh reset would stop at migration 014.

Fix: replace migration 014 with the correct type or add a compatibility type before it. Validate with `supabase db reset` in CI.

### P1: Required Financial/KYC Env Is Missing

Severity: High

Observed from access audit:

- Missing root `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Missing `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_VARS_RECIPIENT_CODE`.
- Missing `YOUVERIFY_API_KEY`, `YOUVERIFY_BASE_URL`.
- Missing root `GOOGLE_MAPS_API_KEY`.

Fix: provide `.env.example` parity per app and a non-secret validation command that fails only when a flow is being exercised.

### P1: Node Version Is Outside Declared Practical Baseline

Severity: High

Observed: Node `v24.14.1`; package says only `>=18.0.0`. Expo SDK 52 and Next 14 are typically validated against current LTS, not Node 24.

Fix: pin `.nvmrc`/`.node-version` to a supported LTS and enforce in CI.

### P1: Linting Is Not Reproducible

Severity: High

Repro:

```powershell
corepack yarn workspace @vars/mobile lint
corepack yarn workspace @vars/admin lint
corepack yarn workspace @vars/landing lint
```

Observed:

- Mobile lint crashes on Windows resolver traversal.
- Admin/landing lint invokes an interactive Next.js setup prompt.

Fix: add committed ESLint configs for all apps, configure import resolver paths for Expo aliases, and make lint non-interactive in CI.

### P2: Supabase CLI Drift

Severity: Medium

Observed: local Supabase CLI `2.84.2`; CLI reports `2.101.0` available.

Fix: pin CLI version in docs/CI or install through a reproducible toolchain.

## Reproducibility Verdict

Not acceptable for a new engineer. Web builds and mobile TypeScript pass, but local Supabase, migrations, Deno function validation, linting, and financial/KYC flows are not reproducible end-to-end.

