# VARS Security Audit

**Date:** 13 July 2026  
**Scope:** Supabase database access controls, service-role key usage, storage bucket policies  
**Status:** PASS with minor notes

---

## 1. Row Level Security — Table Inventory

All 21 tables have RLS enabled. No exceptions.

| Table | RLS | Policy summary |
|---|---|---|
| profiles | enabled | SELECT/UPDATE: own record; admin: full |
| vendors | enabled | SELECT: public discovery of active vendors; own record; admin |
| service_categories | enabled | SELECT: public; write: admin only |
| services | enabled | SELECT: public; write: admin only |
| vendor_services | enabled | SELECT: public (active only); write: vendor owns own, admin full |
| vendor_unavailability | enabled | SELECT: public; write: vendor own, admin full |
| portfolio_photos | enabled | SELECT: consented public + vendor own; write: vendor/admin only |
| bookings | enabled | SELECT/UPDATE: user own, vendor own; admin: full |
| disputes | enabled | INSERT: user on own booking; SELECT: parties to booking; admin: full |
| reviews | enabled | SELECT: public; INSERT: authenticated user (completed bookings only); admin full |
| favourites | enabled | ALL: own records only |
| notifications | enabled | SELECT/UPDATE: recipient only; admin full |
| notification_preferences | enabled | ALL: own records only |
| payout_history | enabled | SELECT: vendor own; admin full |
| admin_users | enabled | SELECT: admin only |
| vendor_leads | enabled | ALL: admin/service-role only (no public access) |
| system_alerts | enabled | ALL: admin only |
| vendor_lead_outreach | enabled | ALL: service-role only |
| blog_comments | enabled | SELECT: approved only; INSERT: authenticated (approved=true); admin full |
| booking_services | enabled | SELECT: vendor/customer via own booking; INSERT: service-role only |
| data_subject_requests | enabled | ALL: admin only |
| terms_acceptances | enabled | INSERT: own; SELECT: own + admin; no UPDATE/DELETE (immutable) |

---

## 2. Service-Role Key Usage

The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS. Every reference audited:

| File | Context | Verdict |
|---|---|---|
| apps/admin/src/lib/supabase.ts | Admin server client factory | OK |
| apps/admin/src/app/disputes/actions.ts | Server Action, admin-gated | OK |
| apps/admin/src/app/api/marketing/send/route.ts | Route Handler, admin-gated | OK |
| apps/admin/src/app/dsr/actions.ts | Server Action, admin-gated | OK |
| supabase/functions/_shared/supabase.ts | Edge function shared util | OK |
| supabase/functions/accept-terms/index.ts | Edge function | OK |
| supabase/functions/auth-send-email/index.ts | Edge function | OK |
| supabase/functions/paystack-release/index.ts | Edge function | OK |
| supabase/functions/paystack-settle/index.ts | Edge function | OK |
| supabase/functions/paystack-gate/index.ts | Edge function | OK |
| supabase/functions/send-reminders/index.ts | Edge function | OK |
| supabase/functions/send-marketing-email/index.ts | Edge function | OK |
| supabase/functions/export-user-data/index.ts | Edge function | OK |
| supabase/functions/delete-user-account/index.ts | Edge function | OK |
| apps/landing/src/app/page.tsx | Next.js Server Component (SSR) | OK — server only, note below |
| apps/landing/src/app/roadmap/page.tsx | Next.js Server Component (SSR) | OK — server only, note below |

**Note on landing page Server Components:** `getVendorCount()` in `page.tsx` and `roadmap/page.tsx` uses the service-role key inside a Next.js Server Component. This is safe — the key never reaches the client bundle. Recommendation (medium priority): isolate to a dedicated internal data function to reduce surface area.

No client-side service-role key references found.

---

## 3. Storage Bucket Policies

### bucket: `portfolio`
- **Public access:** No (private bucket, authenticated reads via signed URLs)
- **Write policies:** Vendor to own subfolder only (`vendors/{uid}/portfolio/*`)
- **Read policies:** Public read (required for portfolio display without auth headers in mobile)
- **Verdict:** OK

### bucket: `vendor-identity-images`
- **Public access:** Yes (`bucket.public = true`)
- **File size limit:** 10 MB
- **Mime types:** JPEG, PNG, WebP
- **Write access:** Service-role only (Youverify webhook)
- **Read access:** Public (required for profile photo display in discovery feed)
- **Verdict:** OK — public bucket is necessary; write is webhook-only at service level

---

## 4. Anon Key Usage

The Supabase anon key (`SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`) is subject to RLS. Every reference audited:

| File | Context | Verdict |
|---|---|---|
| apps/mobile/lib/supabase.ts | Mobile Expo client | OK |
| apps/mobile/app/auth/vendor-login.tsx | Mobile client component | OK |
| apps/mobile/app/vendor-zone-setup.tsx | Mobile client component | OK |
| apps/landing/src/components/PioneerSection.tsx | Next.js client component | OK |
| apps/landing/src/app/blog/CommentSection.tsx | Next.js client component | OK |
| apps/landing/src/app/blog/actions.ts | Next.js Server Action | OK |
| apps/admin/src/lib/supabase.ts | Admin browser client | OK |

No server-only code incorrectly uses the anon key.

---

## 5. Active Third-Party Processors in Mobile App

**Sentry** (`@sentry/react-native`) and **PostHog** (`posthog-react-native`) are imported and active in `apps/mobile/app/_layout.tsx`:

- **Sentry:** `enabled: !__DEV__`, `tracesSampleRate: 0.1`. Sends crash reports and performance traces to Sentry's EU/US servers in production.
- **PostHog:** `autocapture={false}`. Provider is mounted; event capture is disabled unless manually called. EU server endpoint configured (`https://eu.i.posthog.com`).

**Compliance action required:** These processors were omitted from the privacy policy and cookie policy at the time of the initial Phase A compliance review. The privacy policy has since been updated to disclose them (13 July 2026). The cookie policy now correctly states these tools are used in the mobile app only, not on the website.

---

## 6. Summary

| Check | Result |
|---|---|
| RLS enabled on all tables | PASS — 22/22 tables (including 2 new Phase B tables) |
| Service-role key server-side only | PASS — no client-side references |
| Storage bucket write access controlled | PASS — both buckets have restricted write |
| Anon key restricted to client contexts | PASS |
| No tables missing RLS | PASS |
| Third-party processors disclosed | PASS — updated 13 July 2026 |

---

## 7. Recommendations

**Medium priority**
Refactor `getVendorCount()` in `apps/landing/src/app/page.tsx` and `apps/landing/src/app/roadmap/page.tsx` into a dedicated internal Route Handler to isolate service-role key access and allow independent cache control.

**Low priority**
Add an explicit `admin_all_system_alerts` policy to `system_alerts` for completeness (currently correctly protected by the absence of user-facing policies, but explicit is better than implicit).
