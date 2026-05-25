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

## Phase 2b: Landing SEO

- Phase 1 SEO implementation. Done — sitemap, robots, manifest, OG image, privacy page, terms page, canonical, JSON-LD schemas, vercel.json redirect.
- Google Search Console setup. Done — DNS TXT verification, sitemap submitted, 3 pages indexed.

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

## Phase 2b+ Work Done (May 2026)

- Pioneer cohort complete. Landing page (`PioneerSection.tsx`) transitioned from pioneer/waitlist acquisition flow to a single static stylist registration form. All pioneer-specific conditions and dead CSS removed. Done — `e7fcc49`.
- **Wide Awake blog** launched at `bookwithvars.com/blog`. New route in `apps/landing/src/app/blog/` with article index, individual article pages (`[slug]/`), reading progress bar, mid-article CTA, comment system, and cross-article related links. Content defined in `articles.ts` — no CMS. 3 live articles. Done.
- Mobile: `react-native` `Image` replaced with `expo-image` across the app for WebP support and automatic caching. Done — `fcc61bf`.
- Landing page shifted from pioneer acquisition framing to Phase 2 general stylist/customer marketing copy. Done — `e85eff3`, `da27c41`.

## Immediate Next Steps

**Current roadmap position** (source of truth: `apps/landing/src/app/roadmap/data/milestones.ts`):

| Milestone | Period | Status |
|---|---|---|
| 400 Vendors in the Pipeline | June 2026 | **Active now** |
| App Store Launch | July 2026 | Upcoming — supply-only, no customer marketing yet |
| Both Sides Open (customer marketing) | August 2026 | Upcoming |

- Build vendor pipeline to 400 — 75 have registered interest. Outreach system is live; delivery activates when `DELIVERY_LIVE=true` is set in Supabase secrets.
- Android APK delivery: use EAS Cloud Build (`eas build --platform android --profile preview`) — avoids Windows PATH/JDK friction, produces a shareable `.apk` without local Android Studio.
- Activate Paystack live credentials. Blocked on Nigerian business registration completion.
- Activate Youverify credentials. Blocked on pricing negotiation with Ayotomide.
- Activate Google Maps API key. Set in mobile `.env.local` and Supabase Edge Function secrets; no code changes needed.
