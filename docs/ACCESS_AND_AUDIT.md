# VARS Access and Audit Playbook

This file defines the durable access model for auditing, cleaning up, and verifying the VARS monorepo.

## Principle

Keep credentials outside git. Store only examples, required variable names, verification commands, and operating procedures in the repository.

## Local Access

Required:

- Read/write access to the repository root.
- Node.js 18 or newer.
- Yarn.
- Supabase CLI.
- Git credentials with access to `https://github.com/kant1000/vars.git`.

Useful:

- Expo CLI/EAS CLI for native mobile checks.
- Access to a mobile simulator or Expo Go device.

## GitHub Access

Minimum:

- Fetch/read access to the repository.
- Ability to compare local branches with `origin`.

For cleanup delivery:

- Ability to create branches with the `codex/` prefix.
- Ability to push branches.
- Ability to create pull requests.

Verification commands:

```powershell
git remote -v
git fetch origin
git branch -vv
git status --short --branch
git ls-remote --heads origin
```

## Supabase Access

Minimum local audit:

- Local Supabase CLI installed.
- Migrations and functions present under `supabase/`.

For end-to-end testing:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never commit real Supabase keys. Use `.env.local` or Supabase secrets.

Verification commands:

```powershell
supabase --version
supabase status
supabase db reset
supabase functions serve
```

Live infrastructure verification (Supabase SQL Editor or MCP):

```sql
-- Confirm all cron jobs and URL integrity
SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- FAIL if any net.http_post job contains a wrong project ID
SELECT jobname, command
FROM cron.job
WHERE command NOT LIKE '%ojxlfbmetoyggetdfwro%'
  AND command LIKE '%net.http_post%';

-- Confirm migrations applied to live DB
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

## Payment and External Service Access

For payment, settlement, and dispute verification:

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_VARS_RECIPIENT_CODE`

For vendor KYC:

- `YOUVERIFY_API_KEY`
- `YOUVERIFY_BASE_URL`

For maps and location flows:

- `GOOGLE_MAPS_API_KEY`

Use test-mode credentials for audits unless production behavior is explicitly being verified.

## App Environment Files

Root:

- `.env.local` for server and local tooling values.
- `.env.example` for committed variable names only.

Mobile:

- `apps/mobile/.env` or Expo environment handling for `EXPO_PUBLIC_*` values.
- `apps/mobile/.env.example` for committed variable names only.

Admin:

- `apps/admin/.env.local` for Next.js values.

Landing:

- Add an app-specific env file only if the landing app needs runtime config.

## Baseline Audit Order

Run these checks before broad cleanup:

```powershell
yarn audit:access
yarn install --immutable
yarn workspace @vars/admin build
yarn workspace @vars/landing build
yarn workspace @vars/mobile lint
```

Then inspect:

- unresolved git conflicts
- TypeScript errors
- lint errors
- broken imports
- duplicated dependencies
- drift between migrations, shared types, and app queries
- Edge Function environment assumptions
- admin/mobile auth flow consistency
- booking, payment, cancellation, reschedule, and dispute flows

## Permanent Access Checklist

Use this as the durable setup list for future sessions:

- GitHub read access confirmed with `git ls-remote --heads origin`.
- GitHub write access confirmed only when branch push is required.
- Package manager can install dependencies.
- Admin app can build.
- Landing app can build.
- Mobile app can lint and start.
- Supabase CLI can run local database checks.
- Supabase secrets are configured outside git.
- Paystack test credentials are available outside git.
- Youverify test credentials are available outside git.
- Google Maps key is available outside git.
- Production credentials are used only for explicit production verification.
