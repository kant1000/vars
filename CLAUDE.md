# CLAUDE.md

## Karpathy's 4 Foundational Rules

### 1. Think Before Coding
- Never assume. State what you're assuming explicitly.
- Surface all tradeoffs before coding.
- Ask before guessing. Push back when a simpler approach exists.

### 2. Simplicity First
- Write the minimum code that solves the problem.
- No speculative features. No premature abstractions.
- If a senior engineer would call it overcomplicated, simplify it.

### 3. Surgical Changes
- Touch only what you must. Don't "improve" adjacent code.
- Don't refactor what isn't broken.
- Don't change comments or formatting unless required.
- Match existing style exactly.

### 4. Goal-Driven Execution
- Define success criteria before you code.
- Loop and verify until success is confirmed.
- Don't tell me steps to follow. Tell me what done looks like and iterate.

## 8 Extended Rules

### 5. Don't Make the Model Do Non-Language Work
- Never ask me to decide deterministic things: retry policies, message routing, escalation rules.
- These belong in code, not in prompts.
- Keep me on language tasks only.

### 6. Hard Token Budgets, No Exceptions
- Set a maximum token spend per task. I will not stop on my own.
- Long debugging loops spiral to 50,000 tokens with no improvement signal.
- Kill tasks that exceed budget.

### 7. Surface Conflicts, Don't Average Them
- When two parts of the codebase disagree, pick ONE.
- Don't blend them. I will write code that does both, breaking everything.
- Call out the conflict explicitly. Force a choice.

### 8. Read Before You Write
- I must read and understand adjacent code before writing new code.
- Don't just tell me "add a function next to X." Make me read the whole file first.

### 9. Tests Verify Intent, Not Just Behavior
- Tests are not optional. But "tests pass" is not the goal.
- Tests must verify the function returns the RIGHT thing, not just something.
- Shallow tests = false confidence.

### 10. Checkpoint After Every Step
- For multi-step tasks, checkpoint after each step.
- Without checkpoints, one wrong turn loses all progress.
- Verify each step completes correctly before moving to the next.

### 11. Match Conventions, Even If You Disagree
- In a codebase with established patterns, stick to them.
- Don't introduce new patterns, even if better.
- Two patterns are worse than one pattern repeated.

### 12. Fail Visibly, Not Silently
- The most expensive failures look like success.
- Always surface: skipped records, constraint violations, wrong return values, incomplete operations.
- Log and report every edge case. Don't swallow errors.

---

Keep this file under 200 lines total. Add project-specific rules below these 12. Do not exceed 200 lines combined.

## VARS Project-Specific Rules

### Context First
- Before touching product behaviour, copy, payments, KYC, or business logic, read `docs/VARS_PROJECT_CONTEXT.md`.
- Before any multi-file change, read `docs/codex/CLEANUP_ROADMAP.md`.
- If unsure whether something is built, check `README.md` — it is the canonical record.
- Before writing, editing, or transforming any Wide Awake blog post, read `apps/landing/src/app/blog/STYLE.md`.
- **Current roadmap position** is the source of truth for phase, active milestones, and launch dates. Read `apps/landing/src/app/roadmap/data/milestones.ts` before making any product-timeline or phase assumptions.

### Absolute Off-Limits
- Never modify `packages/shared/src/database.types.ts` — auto-generated, touch kills it.
- Never change notification copy strings in `supabase/functions/_shared/notifications.ts` without explicit instruction.
- Never touch Paystack or Youverify business logic unless the task explicitly targets it.
- Never alter migration files that have already been applied.
- Never force-push main.

### Copy Voice & Tone
- Before writing any notification or UI copy, re-read the [Copy Voice & Tone](README.md#copy-voice--tone) section.
- Lead with forward momentum, not failure. "Let's try that again" not "Identity check didn't go through". "Confirming..." not "Awaiting vendor". "Outside your zone" not "Paused — outside zone".
- Passive blame and deficit labels (`"Unverified"`, `"couldn't"`, `"didn't"`, `"wasn't"`) are banned from user-facing copy.
- **Never use an em-dash (`—`) in user-facing copy**, in any app. Split into two sentences or use a comma/colon/semicolon instead. Code comments are unaffected. Empty-field placeholders use a word (`"Not set"`), not a bare `—`.

### Mobile Design System
- **Border radius is always `5`.** No exceptions for UI surfaces. Use `BORDER_RADIUS` exported from `apps/mobile/constants/colors.ts` — never a hardcoded number.
- Circular elements (avatars, status dots) are exempt: they use `borderRadius = width / 2` to remain circular.
- When adding any new component or style, set `borderRadius: BORDER_RADIUS` (not `borderRadius: 5` inline — import the constant).
- **Every screen/component change must be light-and-dark and both-platform-icon complete.** Full checklist: `docs/MOBILE_THEME_CHECKLIST.md` — read it before adding a style or icon, don't re-derive the rules from scratch.

### ScissorsLoader Convention
- The only scissors loader is `apps/mobile/components/ScissorsLoader.tsx`. Import from `@/components/ScissorsLoader` — never recreate inline.
- `VB_H` must remain `920`. This gives 112 units of bottom clearance so blade tips never clip at ±32° rotation. The roadmap web `ScissorIcon` uses the same value. Never reduce to 820.
- Sizes: `small` in buttons/inline states, `large` for full-screen loading states, `medium` for mid-weight contexts (e.g. zone map). Color: `light` on dark/filled backgrounds, `dark` on white/surface.

### Brand Color Exceptions — Do Not Audit or Replace
The social auth buttons in `apps/mobile/app/auth/login.tsx` use **mandatory third-party brand colours** that must never be replaced with VARS design tokens:
- **Google**: `backgroundColor: '#ffffff'`, `borderColor: '#dadce0'`, text `'#3c4043'` — required by Google Identity Branding Guidelines.
- **Facebook**: `backgroundColor: '#1877F2'`, text `'#ffffff'` — required by Meta Brand Resources.
The Customer Care "Ask your AI" tiles (`apps/mobile/constants/aiPlatforms.ts`) use each platform's recognisable accent colour for its badge, plus a fixed white monogram — deliberately theme-invariant so each tile stays recognisable regardless of light/dark mode, same rationale as the fixed-warning-banner exception in the theme checklist.
These, plus the ones above, are the **only** hardcoded colour strings permitted in the mobile codebase. All other colours must use `Colors.*` tokens from `constants/colors.ts`.

### Constants and Types
- `BookingStatus` type and `BOOKING_STATUS` constant live in `packages/shared/src/constants.ts` and `types.ts`.
- Mobile and admin import from `@vars/shared`. Edge functions import from `supabase/functions/_shared/constants.ts` (Deno cannot resolve workspace packages — keep the mirror in sync manually).
- Object keys in status config maps (`STATUS_CONFIG`, `STATE_STYLE`) may remain as string literals. Comparisons and query parameters must use `BOOKING_STATUS.X`.

### Monorepo Wiring
- `packages/shared` exports raw TypeScript — no build step. Admin requires `transpilePackages: ['@vars/shared']` in `next.config.js`. Mobile requires the Metro config at `apps/mobile/metro.config.js`.
- Yarn 1 classic workspaces. Use `yarn workspace @vars/<name> <script>` to run per-workspace commands.

### Merge Discipline
- Always `--no-ff` when merging branches. Preserve history.
- Validate with `yarn workspace @vars/admin build`, `yarn workspace @vars/landing build`, and `yarn workspace @vars/mobile lint` before pushing main.
- `git diff main origin/main` must be empty after every push.

### Mobile Device Testing
- Full decision process, exact commands, and the freshness-marker mechanism: `docs/MOBILE_DEVICE_TESTING.md`. Read it before running/building the mobile app — don't re-derive the process from memory.
- One-line summary: phone connected via USB → local debug Gradle build (tried and tested, faster, real device logs); no phone → EAS Cloud Build (`eas build --platform android --profile preview`); phone connected but the installed app already matches HEAD → skip the rebuild, just start Metro (`npx expo start --dev-client`).
- Two Android Gradle bugs are already root-caused and fixed (`expo-haptics` version, Sentry double-autolinking, see `docs/audit/mobile.md` §6) — don't re-diagnose a build failure as either of these without checking first.

### Tools & Environment Available
- **Supabase MCP** is connected to the live project — use it directly instead of asking permission each time: `list_tables`, `execute_sql`, `get_logs`, `get_advisors`, `apply_migration`, `deploy_edge_function`, `list_edge_functions`, `list_migrations`, `generate_typescript_types`, `get_project_url`, `get_publishable_keys`. Still never touch Paystack/Youverify logic or already-applied migrations without explicit instruction (see Absolute Off-Limits above).
- **Vercel MCP** is connected — deployments, project/build logs, runtime errors for the admin/landing apps.
- Gmail, Google Calendar, Google Drive, Clay, and Make MCP connectors are also available but are not part of this project's normal workflow — don't reach for them unless the task actually calls for it.
- Local CLI tools present in this environment: `adb` (Android SDK platform-tools, may need the full path — see `docs/MOBILE_DEVICE_TESTING.md`), `gradlew.bat` (inside `apps/mobile/android/`, gitignored/regenerated), `eas-cli` (globally installed, authenticated).
