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
