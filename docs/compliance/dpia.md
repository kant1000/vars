# VARS Data Protection Impact Assessment (DPIA)

**Version:** 1.1
**Last updated:** 14 July 2026
**Status:** Draft prepared by founder - pending lawyer/DPO review and formal sign-off
**Prepared under:** GAID 2025 Article 28, Schedule 4 (DPIA template), Schedule 6 (Data Subjects' Vulnerability Index)

---

## 1. Overview

| Field | Detail |
|---|---|
| Controller | VARS (CAC-registered, Lagos, Nigeria) |
| Assessment prepared by | Founder (Seyi Ibitoye), pending DPO sign-off |
| Date of assessment | 14 July 2026 |
| Processing activities assessed | Vendor KYC/biometric verification (PA-03); live vendor location tracking (PA-06); cross-border data transfer (all PAs, via Supabase infrastructure); marketplace matching/discovery profiling (PA-01, PA-04); clickwrap/consent logging (PA-14); data subject request intake (PA-15); data portability export (PA-16); account erasure (PA-17); crash and analytics telemetry (PA-18) |
| Reference documents | `ropa.md`, `data-retention-schedule.md`, `internal-data-protection-policy.md` |
| Phase B compliance status | Completed 14 July 2026: DSR intake table, clickwrap `terms_acceptances`, data export edge function, account deletion edge function, and cookie banner all shipped and deployed to production |

## 2. Why a DPIA Is Required

Under GAID Article 28, a DPIA is mandatory where processing is likely to result in a high risk to the rights of data subjects. VARS triggers this on four independent grounds:

1. **Sensitive/biometric data** - Youverify KYC liveness face images (PA-03)
2. **Systematic location monitoring** - live vendor GPS tracking during active bookings (PA-06)
3. **Cross-border transfer** - all personal data transits Supabase infrastructure hosted outside Nigeria
4. **Large-scale profiling/new technology** - marketplace matching algorithm surfacing vendors to customers based on location and rating (PA-01, PA-04)

## 3. Description of Processing

### 3.1 Vendor KYC / Biometric Verification (PA-03)

**What happens:** A vendor completes a hosted Youverify identity-verification session during onboarding. Youverify captures a liveness face image and validates it against a government-issued ID. On a clean pass, VARS's webhook extracts the face image, uploads a raw copy and a cropped 400x400 passport-style version to a private Supabase storage bucket, and sets the vendor's profile image, KYC status to verified, and account to active - all in one automated step, with no admin review required.

**Data subjects:** Vendors (beauty professionals applying to join the platform).

**Volume:** Every vendor who onboards (target: 400+ by mid-2026, scaling with the platform).

**Necessity and proportionality:** Identity verification is necessary to establish trust between customers (who invite vendors into their homes) and vendors, and to meet AML-adjacent recordkeeping expectations. The image is not used for any purpose beyond verification and the vendor's own public profile photo (which the vendor cannot alter, preventing catfishing/impersonation).

### 3.2 Live Vendor Location Tracking (PA-06)

**What happens:** While a vendor has an active "on the way" booking, their app pings GPS coordinates to Supabase every 60 seconds, visible to the customer as a live map. While simply online (not en route), location pings every 5 minutes for zone-drift detection (auto-accept eligibility).

**Data subjects:** Vendors.

**Volume:** All active/online vendors, continuously during operating hours.

**Necessity and proportionality:** Live tracking is core to the service (the customer needs to know when their stylist will arrive) and to the auto-accept zone system (which depends on the vendor being physically within their declared zone). Location is overwritten on each ping - no historical trail is stored - which limits the risk surface considerably.

### 3.3 Cross-Border Data Transfer

**What happens:** VARS's Supabase project (database, authentication, storage, edge functions) is hosted on Supabase's infrastructure, which is not physically located in Nigeria. Every category of personal data VARS holds therefore leaves Nigeria as a matter of routine operation. Additional processors with cross-border data flows: Youverify (KYC), Paystack (payment tokens; confirm data residency), Resend (email), Expo/Google/Apple (push notification delivery), 360dialog (WhatsApp OTP), Sentry (crash telemetry - US/EU servers), PostHog (product analytics - EU servers).

**Data subjects:** All customers, vendors, and leads.

**Necessity and proportionality:** No viable Nigeria-only alternative currently exists for VARS's technical stack at this stage of the business. The transfer is necessary for the performance of the contract with each data subject (you cannot run a cloud-based marketplace app without cloud infrastructure).

### 3.4 Marketplace Matching / Discovery Profiling

**What happens:** The customer discovery feed ranks vendors using `is_online DESC, distance_km ASC` from a single `get_nearby_vendors` RPC call, incorporating each vendor's live/last-known location relative to the customer's declared location.

**Data subjects:** Customers and vendors.

**Necessity and proportionality:** This is basic proximity-based sorting, not behavioural profiling or automated decision-making with legal effect. Risk is low but included here for completeness given GAID's broad framing of "new technology."

### 3.5 Clickwrap / Consent Logging (PA-14)

**What happens:** When a user accepts VARS's Terms of Service, Privacy Policy, Vendor Terms, or any other legal document via an in-app prompt, the `accept-terms` edge function records the acceptance in the `terms_acceptances` table. Each record captures: user ID, document type, document version, IP address (extracted from `x-forwarded-for`), and user-agent string. The record is immutable - no UPDATE or DELETE is permitted on the table.

**Data subjects:** All customers and vendors who accept terms via the app.

**Volume:** One record per document acceptance per user. IP address is personal data under NDPA.

**Necessity and proportionality:** Clickwrap logging is required to demonstrate that a binding contract was formed (enforceable acceptance) and to show the NDPC evidence of lawful consent capture. IP logging is the standard mechanism for timestamping digital acceptance and is necessary for enforceability; it is minimal (no geolocation lookup is performed beyond the raw IP).

### 3.6 Data Subject Request Intake (PA-15)

**What happens:** The `data_subject_requests` table records all DSRs submitted to VARS - whether self-service (via the in-app export or deletion flows, which auto-create a DSR record) or manually entered by admin (for requests received by email or phone). Each record captures: requester type, request type, status, user ID, requester email/name, details, a 30-day response deadline, and resolution notes. Admin access only; RLS enforced.

**Data subjects:** Any person submitting a DSR (customers, vendors, or external individuals).

**Necessity and proportionality:** Required to manage the NDPA 30-day response obligation and to demonstrate to the NDPC that requests were tracked and resolved. The record is minimised to what is needed for tracking and audit.

### 3.7 Data Portability Export (PA-16)

**What happens:** A data subject may trigger a self-service export via the app settings. The `export-user-data` edge function assembles all personal data VARS holds about the requesting user - bookings, reviews, notifications, terms acceptances, profile data - and returns it as a JSON file download. A portability DSR record is auto-created. Rate-limited to one export per 24 hours per account.

**Data subjects:** Customers and vendors.

**Necessity and proportionality:** Required under NDPA/GAID to give data subjects access to their data. The 24-hour rate limit prevents abuse (the export assembles significant data across multiple tables). Biometric images are explicitly excluded from the export (legal retention obligation; reason disclosed to the user).

### 3.8 Account Erasure / Deletion (PA-17)

**What happens:** A data subject may request account deletion via the app settings. The `delete-user-account` edge function: nulls all PII fields on the profile and vendor record; hard-deletes notifications and favourites; anonymises review content ("Service completed" placeholder); bans the auth user for 876,000 hours (effectively permanent) rather than hard-deleting the auth record (to preserve referential integrity and financial audit trail). Four pre-deletion guards must all be clear: active bookings, open disputes, `is_restricted`, and pending payouts. An erasure DSR record is auto-created.

**Data subjects:** Customers and vendors.

**Necessity and proportionality:** Required under NDPA/GAID right to erasure. The ban-not-delete approach preserves the audit trail for financial records (required by MLPPA 2022) while making the user's account permanently inaccessible. The guard checks prevent deletion during financially live states.

### 3.9 Crash and Analytics Telemetry (PA-18)

**What happens:** Sentry is integrated into the mobile app for crash reporting. Device context, app version, OS, stack traces, and unhandled exception data are transmitted to Sentry's servers (US/EU) on crash. PostHog is integrated for product analytics; as of this assessment, event capture is initialised but no custom PII context is injected. Neither processor has a completed DPA with VARS.

**Data subjects:** All mobile app users (customers and vendors).

**Necessity and proportionality:** Crash telemetry is operationally necessary for product quality. Analytics is useful for product decisions. Both are standard practice. The risk is that both involve cross-border transfer to third-country processors without confirmed DPAs or transfer mechanisms - flagged as a priority outstanding action.

## 4. Risk Assessment

| Risk | Likelihood | Severity | Overall risk | Mitigations in place | Residual risk |
|---|---|---|---|---|---|
| Unauthorised access to KYC biometric images | Low | High | Medium | Private storage bucket, RLS blocks client writes to identity columns, HMAC-authenticated webhook | Low |
| Biometric image used beyond stated purpose | Low | High | Medium | Single stated purpose (verification + locked profile photo); no secondary use; `profile_image_locked` prevents vendor tampering | Low |
| Live location data misused for stalking/harassment of vendor | Low | High | Medium | No historical trail retained (overwritten in place); only visible to the customer with an active booking with that vendor; access ends when booking completes | Low |
| Data intercepted or accessed unlawfully during cross-border transit | Low | High | Medium | TLS in transit; Supabase encryption at rest; DPAs to be executed with all processors (in progress) | Medium - pending DPA execution and confirmed transfer safeguard |
| Vendor discovery/ranking used to discriminate or disadvantage a class of vendors | Low | Medium | Low | Ranking is purely distance/online-status based, no demographic inputs | Low |
| Data subject unable to exercise rights (access/erasure) | Low | Medium | Low | Self-service data export and account deletion flows deployed to production (Phase B, 14 July 2026); DSR intake table with 30-day deadline tracking in production | Low |
| Vendor identity image extraction fails silently, leaving KYC pass without a profile photo | Medium | Low | Low | Webhook logs a warning and completes KYC pass regardless (non-blocking); admin can set the image manually | Low |
| Clickwrap acceptance log breached, exposing IP addresses | Low | Medium | Low | `terms_acceptances` is admin-read-only via RLS; table is append-only (no UPDATE/DELETE policy); covered by Supabase encryption at rest | Low |
| Data export endpoint abused with a compromised auth token | Low | High | Medium | JWT authentication required; 24-hour rate limit; export is scoped to the authenticated user's own data via RLS - no cross-user access possible | Low |
| Crash telemetry transmits device/session context to third-country processor without DPA | Medium | Medium | Medium | Sentry initialised with no custom PII context injected (minimal data); DPA and transfer mechanism with Sentry not yet confirmed | Medium - outstanding action |

## 5. Consultation

- **Data subjects:** Not directly consulted for this DPIA draft. Vendor consent for biometric processing is captured explicitly during the Youverify KYC flow before any data is collected.
- **DPO:** Pending appointment; this draft is prepared for DPO review and formal sign-off once appointed.
- **Legal counsel:** Pending review as part of the current engagement.

## 6. Safeguards and Measures Adopted

1. Private (non-public) storage bucket for all identity images.
2. Row-Level Security preventing client-side writes to identity/biometric columns; only the service role (used exclusively server-side by the webhook) can write them.
3. HMAC-SHA256 signature verification on the Youverify webhook to prevent spoofed payloads.
4. No historical GPS trail - location columns are overwritten, not appended, eliminating a large retrospective risk surface.
5. Location visibility scoped strictly to the customer with an active booking; access ends when the booking ends.
6. Explicit vendor consent captured before biometric processing begins (Youverify hosted flow).
7. 5-year retention limit on KYC/biometric data post-relationship, aligned to the Money Laundering (Prevention and Prohibition) Act 2022, documented in the data retention schedule.
8. Self-service data export explicitly excludes biometric images, with the legal reason disclosed to the data subject.
9. Clickwrap acceptance recorded immutably in `terms_acceptances` (no UPDATE or DELETE permitted by RLS policy); captures IP address, document type, and document version as evidence of valid digital consent.
10. `data_subject_requests` table tracks all DSRs with a 30-day response deadline; self-service in-app export and deletion flows auto-create DSR records; admin-only access via RLS.
11. Data export rate-limited to one request per 24 hours per account; covers all PII categories (excluding biometric images); auto-creates a portability DSR record on each export.
12. Account deletion bans the auth user permanently rather than hard-deleting (preserves financial audit trail); nulls all PII fields; hard-deletes non-audit-relevant records (notifications, favourites); guarded by four pre-deletion checks (active bookings, disputes, restriction, pending payouts).
13. Data Processing Agreements to be executed with Supabase, Youverify, Paystack, Resend, 360dialog, Sentry, and PostHog (in progress - see accompanying `dpa-template.md`).

## 7. Conclusion and Sign-Off

**Preliminary conclusion:** With the safeguards listed in Section 6 implemented, the residual risk of the assessed processing activities is reduced to a level VARS can proceed with. The primary outstanding actions are: execution of Data Processing Agreements with all cross-border processors, confirmation of an appropriate transfer mechanism (Standard Contractual Clauses or documented consent-based derogation), and DPA/transfer mechanism confirmation specifically for Sentry and PostHog before public go-live.

**This DPIA is a draft.** It requires formal review and sign-off by:
- [ ] The appointed Data Protection Officer
- [ ] Legal counsel

**Outstanding actions before sign-off:**
- [ ] Confirm Youverify's data residency and licensing/compliance status
- [ ] Confirm Paystack's data residency for any data beyond the transaction itself
- [ ] Execute DPAs with Supabase, Youverify, and Paystack (see accompanying `dpa-template.md`)
- [ ] Confirm or execute DPA and transfer mechanism with Sentry and PostHog before public go-live
- [ ] Confirm the cross-border transfer mechanism with legal counsel (SCCs vs. consent-based derogation)
- [ ] Formal DPO appointment and review

## 8. Review Cycle

This DPIA must be reviewed:
- Annually
- Whenever a new high-risk processing activity is introduced
- Whenever a processor, data type, or transfer destination changes materially
