# VARS Record of Processing Activities (ROPA)

**Version:** 1.0
**Last updated:** 13 July 2026
**Status:** Approved by founder, pending DPO sign-off
**Owner:** DPO (once appointed)
**Legal basis:** NDPA 2023; GAID 2025 Article 44

---

## Controller Details

| Field | Detail |
|---|---|
| Controller name | VARS (trading name; CAC-registered entity) |
| Address | Lagos, Nigeria |
| Contact | hello@bookwithvars.com |
| Website | bookwithvars.com |
| DPO | To be appointed (Nigeria-resident, fractional) |
| DPO contact | TBD |

---

## Processing Activities

### PA-01: Customer Account Registration

| Field | Detail |
|---|---|
| Activity | Customer creates an account via the mobile app |
| Data subjects | Customers (Lagos residents, adults 18+) |
| Data categories | Name, email, phone number |
| Sensitive data? | No |
| Lawful basis | Contract (NDPA s.25) |
| Purpose | Create and manage customer account; enable booking |
| Source of data | Data subject (direct collection via app) |
| Recipients/processors | Supabase (storage + auth), Google (OAuth provider), Facebook (OAuth provider) |
| Cross-border transfer? | Yes: Supabase infrastructure (US/EU), Google (US), Facebook (US) |
| Transfer safeguard | DPA with each processor; consent-based derogation pending NDPC SCC approval |
| Retention | Life of account + 6 months |
| Security measures | Supabase Auth (bcrypt hashing), RLS, HTTPS/TLS in transit, encrypted at rest |

### PA-02: Vendor Account Registration and Onboarding

| Field | Detail |
|---|---|
| Activity | Vendor creates account, completes profile, adds services |
| Data subjects | Vendors (beauty professionals in Lagos) |
| Data categories | Name, email, phone number, bio, service offerings, pricing, category selections |
| Sensitive data? | No |
| Lawful basis | Contract |
| Purpose | Create vendor account; enable service listing and booking acceptance |
| Source of data | Data subject (direct); vendor_leads table (pre-fill from lead registration) |
| Recipients/processors | Supabase |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | Life of account + 6 months |
| Security measures | Supabase Auth (email OTP), RLS, TLS, encryption at rest |

### PA-03: Vendor KYC / Identity Verification

| Field | Detail |
|---|---|
| Activity | Vendor completes identity verification via Youverify hosted session |
| Data subjects | Vendors |
| Data categories | Government-issued ID document, liveness face image (biometric), legal name, KYC status, rejection reason |
| Sensitive data? | **Yes: biometric data (face image for unique identification)** |
| Lawful basis | Explicit consent (NDPA s.30(1)(a)) + legal obligation (AML record-keeping) |
| Purpose | Verify vendor identity before platform activation; trust and safety |
| Source of data | Data subject (via Youverify hosted session); Youverify (webhook payload with verification result and face image) |
| Recipients/processors | Youverify (processor, conducts verification), Supabase (stores result + face images in vendor-identity-images bucket) |
| Cross-border transfer? | Yes: Youverify infrastructure (confirm data residency); Supabase infrastructure |
| Transfer safeguard | DPA with Youverify; DPA with Supabase |
| Retention | 5 years after end of vendor relationship (Money Laundering Act 2022 s.16) |
| Security measures | HMAC-SHA256 webhook authentication; images stored in private Supabase bucket; RLS blocks client-side writes to identity columns; profile_image_locked = true prevents vendor modification |
| DPIA required? | **Yes** (biometric sensitive data) |

### PA-04: Booking Creation and Management

| Field | Detail |
|---|---|
| Activity | Customer books a service with a vendor; booking lifecycle management (accept, on_way, arrived, service_rendered, completed, cancelled, disputed) |
| Data subjects | Customers and vendors |
| Data categories | Booking details (date, time, services, amounts, status), access details (building, floor, flat, gate code), customer GPS location (lat/lng), service summary |
| Sensitive data? | No (access details are sensitive commercially but not "sensitive data" under NDPA) |
| Lawful basis | Contract |
| Purpose | Facilitate and manage the booked service; match vendor to location; calculate transport surcharge |
| Source of data | Customer (booking flow), system (status transitions, timestamps) |
| Recipients/processors | Supabase; vendor (receives access details 15 min before appointment via phone-reveal) |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | 6 years after completion (tax records); access details hard-deleted 30 days after completion |
| Security measures | Access details silently filtered (no @ signs, no 7+ digit sequences); phone/access revealed only at 15-min mark; RLS policies restrict field access |

### PA-05: Payment Processing

| Field | Detail |
|---|---|
| Activity | Card verification (one-time ₦50), gate-time charge, settlement to vendor subaccount |
| Data subjects | Customers (card holders), vendors (payment recipients) |
| Data categories | Paystack authorization_code (token, not raw card data), Paystack reference, transaction amounts, payout history, vendor bank account details (account number, bank code via Paystack subaccount) |
| Sensitive data? | No (tokens, not raw financial data) |
| Lawful basis | Contract |
| Purpose | Process payments for booked services; settle vendor earnings |
| Source of data | Paystack (webhook: charge.success, charge.dispute.create); customer (card via Paystack WebView); vendor (bank details during onboarding) |
| Recipients/processors | Paystack (processor, PCI-DSS Level 1, CBN PSSP licensed) |
| Cross-border transfer? | Paystack processes within Nigeria (confirm); Supabase stores tokens cross-border |
| Transfer safeguard | DPA with Paystack; DPA with Supabase |
| Retention | Authorization_code: life of account + 30 days. Payout history: 6 years. |
| Security measures | No raw card data stored by VARS; tokens encrypted at rest; RLS restricts access; atomic gate-fired guard prevents double-charge |

### PA-06: Live Location Tracking

| Field | Detail |
|---|---|
| Activity | Vendor GPS location tracked while en route to customer and while online (drift detection) |
| Data subjects | Vendors |
| Data categories | vendor_current_lat, vendor_current_lng |
| Sensitive data? | No |
| Lawful basis | Contract (necessary for service delivery and auto-accept zone system) |
| Purpose | Show customer live vendor location while on_way; detect zone drift for auto-accept |
| Source of data | Vendor device GPS (via vendor-update-location edge function) |
| Recipients/processors | Supabase; customer (sees vendor location on map during on_way status) |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | Ephemeral: overwritten on each ping (every 60s while on_way, every 5 min while online). No historical trail stored. |
| Security measures | Only written when vendor has active on_way booking or is online; columns overwritten not appended |

### PA-07: Push Notifications

| Field | Detail |
|---|---|
| Activity | Send push notifications for booking events, reminders, and system alerts |
| Data subjects | Customers and vendors |
| Data categories | Expo push token, notification content (stored in notifications table), device platform |
| Sensitive data? | No |
| Lawful basis | Contract (transactional notifications); consent (marketing, if added) |
| Purpose | Keep users informed of booking status, reminders, disputes, KYC outcomes |
| Source of data | System-generated; Expo SDK (device token) |
| Recipients/processors | Expo (push notification delivery via FCM/APNs), Supabase (notification log storage) |
| Cross-border transfer? | Yes: Expo servers (US); FCM (Google, US); APNs (Apple, US) |
| Transfer safeguard | Standard terms with Expo/Google/Apple (review for GAID compliance) |
| Retention | Push tokens: life of account. Notification log: 12 months. |
| Security measures | Tokens stored server-side; notification content does not include sensitive data (no access details, no payment amounts) |

### PA-08: Vendor Lead Registration and Outreach

| Field | Detail |
|---|---|
| Activity | Prospective vendors register interest via landing page; VARS follows up with email/WhatsApp outreach |
| Data subjects | Prospective vendors (leads) |
| Data categories | Name, email, phone number, service type, pioneer flag, lead state, outreach history, email_unsubscribed flag |
| Sensitive data? | No |
| Lawful basis | Consent (form submission) + legitimate interest (follow-up outreach) |
| Purpose | Vendor acquisition; nurture leads toward app onboarding |
| Source of data | Data subject (landing page form) |
| Recipients/processors | Supabase (storage); Resend (email delivery); Termii (WhatsApp/SMS delivery, once unblocked) |
| Cross-border transfer? | Yes: Supabase, Resend (US) |
| Transfer safeguard | DPA with Resend; DPA with Termii |
| Retention | 24 months from last contact if unconverted; converted leads retained per vendor account retention |
| Security measures | HMAC-signed unsubscribe links; email_unsubscribed flag checked before every send; advisory lock prevents pioneer race condition |

### PA-09: Reviews and Ratings

| Field | Detail |
|---|---|
| Activity | Customer submits a star rating and optional comment after a completed booking |
| Data subjects | Customers (authors), vendors (subjects) |
| Data categories | Star rating (1-5), comment text, customer name (displayed), booking reference |
| Sensitive data? | No |
| Lawful basis | Legitimate interest (platform trust and quality) |
| Purpose | Enable informed vendor selection; vendor quality management |
| Source of data | Customer (via submit-review edge function) |
| Recipients/processors | Supabase; publicly visible to all app users |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | Life of platform; anonymised to "VARS Customer" on account deletion |
| Security measures | One review per booking enforced (409 on duplicate); DB trigger updates vendor avg_rating |

### PA-10: Dispute Resolution

| Field | Detail |
|---|---|
| Activity | Customer raises a dispute; admin reviews and resolves |
| Data subjects | Customers and vendors |
| Data categories | Dispute category, free-text reason, resolution outcome, admin notes |
| Sensitive data? | No |
| Lawful basis | Contract + legal obligation (consumer protection) |
| Purpose | Resolve service complaints; determine refund/settlement |
| Source of data | Customer (dispute-raise); admin (resolution) |
| Recipients/processors | Supabase; admin users (via admin dashboard) |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | 6 years after resolution (statute of limitations) |
| Security measures | Admin-only access via service role; SLA timer enforcement (18h warn, 24h critical) |

### PA-11: Photo Consent Workflow

| Field | Detail |
|---|---|
| Activity | Vendor requests permission to use a booking photo in their portfolio; customer approves or declines |
| Data subjects | Customers (image subjects), vendors (requesting party) |
| Data categories | Consent record (status, expiry), portfolio photo |
| Sensitive data? | No (photos do not identify individuals for biometric purposes in this context) |
| Lawful basis | Consent |
| Purpose | Build vendor portfolio with customer-approved images |
| Source of data | Vendor (photo upload + consent request); customer (approval/decline) |
| Recipients/processors | Supabase (storage); publicly visible in vendor portfolio if approved |
| Cross-border transfer? | Yes: Supabase infrastructure |
| Transfer safeguard | DPA with Supabase |
| Retention | Until vendor removes or account deletion |
| Security measures | 72-hour consent expiry; declined/expired photos not published; customer notified of outcome |

### PA-12: Admin Operations

| Field | Detail |
|---|---|
| Activity | Admin users access dashboard for vendor management, dispute resolution, outreach review, marketing campaigns |
| Data subjects | Admin users; indirectly: customers, vendors, leads |
| Data categories | Admin credentials, session cookies; access to all customer/vendor/lead data via service role |
| Sensitive data? | No (admin credentials are not "sensitive data" under NDPA) |
| Lawful basis | Legitimate interest (platform operation) |
| Purpose | Manage platform operations, resolve disputes, approve outreach, oversee vendor quality |
| Source of data | Admin user (login); system (data access) |
| Recipients/processors | Supabase (service role client); Vercel (admin dashboard hosting) |
| Cross-border transfer? | Yes: Supabase, Vercel |
| Transfer safeguard | DPA with Supabase; DPA with Vercel |
| Retention | Admin records: life of role + 6 months |
| Security measures | Cookie-based auth; admin_users table gating; service-role key server-side only (Next.js Server Actions); middleware redirects unauthenticated requests |

### PA-13: Marketing Email Campaigns

| Field | Detail |
|---|---|
| Activity | Bulk HTML email campaigns sent to vendor lead segments |
| Data subjects | Vendor leads |
| Data categories | Email address, name, service type, pioneer status, lead state |
| Sensitive data? | No |
| Lawful basis | Legitimate interest (vendor acquisition) + consent (original form submission) |
| Purpose | Re-engage leads; promote platform launch |
| Source of data | vendor_leads table (segmented by admin) |
| Recipients/processors | Resend (email delivery, Batch API) |
| Cross-border transfer? | Yes: Resend (US) |
| Transfer safeguard | DPA with Resend |
| Retention | Per lead retention (24 months if unconverted) |
| Security measures | email_unsubscribed checked before every send; HMAC-signed unsubscribe links; two-step admin confirmation before send |

---

## Third-Party Processors Summary

| Processor | Role | Data accessed | Location | Certifications | DPA status |
|---|---|---|---|---|---|
| Supabase | Database, storage, auth, edge functions | All VARS data | US/EU (confirm region) | SOC 2 Type II | **Needed** |
| Paystack | Payment gateway | Card tokens, transaction data, bank details | Nigeria (confirm) | PCI-DSS Level 1, ISO 27001/27701, CBN PSSP | **Needed** |
| Youverify | KYC identity verification | Biometric face image, ID documents, legal name | Nigeria (confirm data residency) | ISO 27001, ISO 27018, SOC 2 Type II (claimed) | **Needed** |
| Resend | Email delivery | Email addresses, names, message content | US | Review | **Needed** |
| Termii | WhatsApp/SMS delivery (blocked, not yet active) | Phone numbers, message content | Nigeria (confirm) | Review | **Needed** |
| Expo | Push notification delivery | Push tokens, notification payloads | US | Standard terms | **Review needed** |
| Google | OAuth (customer auth), Maps API | Email (OAuth), API calls (no PII stored by Google) | US | Standard terms | **Review needed** |
| Facebook/Meta | OAuth (customer auth) | Email (OAuth) | US | Standard terms | **Review needed** |
| Apple | Push delivery (APNs) | Push tokens | US | Standard terms | **Review needed** |
| Vercel | Hosting (landing page, admin dashboard) | No PII stored; serves static/SSR pages | US | SOC 2 Type II | **Review needed** |

---

## Cross-Border Transfer Register

All VARS personal data transits through Supabase infrastructure, which is hosted outside Nigeria. This constitutes a cross-border transfer under NDPA Sections 41-43 and is classified as high-risk under the GAID. The following safeguards are required:

1. **DPA with each processor** containing GAID-compliant clauses (lawful basis, security requirements, data subject rights, breach notification, sub-processor controls).
2. **Transfer Impact Assessment (TIA)** documenting the legal regime in the destination country and any supplementary measures.
3. **NDPC-approved Standard Contractual Clauses (SCCs)** or consent-based derogation (with risk disclosure to data subjects) pending NDPC publication of approved SCC templates.
4. **Privacy policy disclosure** informing data subjects of the cross-border transfer, the destination, and the safeguards.

**Action:** Lawyer to advise on the appropriate transfer mechanism given the current absence of NDPC adequacy decisions and approved SCC templates.

---

## DPIA Triggers Identified

The following processing activities require a Data Protection Impact Assessment under GAID Article 28:

| Trigger | Processing activity |
|---|---|
| Biometric / sensitive data | PA-03 (Vendor KYC) |
| Systematic location monitoring | PA-06 (Live location tracking) |
| Cross-border transfer | All PAs (Supabase infrastructure) |
| New technology / large-scale profiling | PA-01 + PA-04 (marketplace matching, vendor discovery feed) |

**Action:** DPIA to be drafted by lawyer/DPCO with technical input from VARS (this ROPA + data retention schedule serve as input documents).

---

## Review Cycle

This ROPA must be reviewed:
- Every 6 months (DPO semi-annual report)
- Whenever a new processing activity, data type, or processor is added
- Before any new feature that changes how personal data is collected, used, or shared
