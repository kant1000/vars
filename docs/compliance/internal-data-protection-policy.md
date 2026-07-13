# Internal Data Protection Policy

**Version:** 1.0
**Last updated:** 13 July 2026
**Status:** Draft, pending lawyer review
**Owner:** DPO (once appointed); interim: Seyi Ibitoye, Founder
**Classification:** Internal, Confidential

---

## 1. Purpose

This policy governs how everyone working on or with VARS handles personal data. It applies to all processing activities described in the VARS Record of Processing Activities (ROPA) and supports compliance with the Nigeria Data Protection Act 2023 (NDPA), the General Application and Implementation Directive 2025 (GAID), and any other applicable data protection laws.

This is an internal document. It is not published to customers or vendors.

## 2. Scope

This policy applies to:

- The founder (Seyi Ibitoye)
- The Data Protection Officer (DPO), once appointed
- Any developers, designers, or contractors with access to VARS systems containing personal data
- Any third party granted temporary access to VARS infrastructure (e.g. for debugging, auditing, or integration support)

It covers all personal data processed by VARS, whether stored in Supabase, transiting through processors (Paystack, Youverify, Resend, 360dialog, Expo), or cached on local devices during development and testing.

## 3. Roles and Responsibilities

**Founder (Data Controller)**
Seyi Ibitoye is the data controller. Responsibilities: overall accountability for data protection compliance, appointing and resourcing the DPO, approving new processors, authorising data retention changes, and signing off on breach notifications to the NDPC.

**Data Protection Officer (DPO)**
To be appointed (Nigeria-resident, fractional or outsourced). Responsibilities: monitoring compliance with this policy, advising on DPIAs and processing changes, managing data subject requests, maintaining the ROPA, conducting annual training, filing reports with the NDPC, and leading breach response (see `breach-response-runbook.md`).

Until the DPO is appointed, the founder assumes all DPO responsibilities.

**Developers and Contractors**
Anyone writing code, running queries, or accessing VARS backend systems. Responsibilities: follow this policy, report suspected breaches immediately, never extract personal data outside approved systems, follow access control rules, and complete annual data protection training.

## 4. Acceptable Use Rules

**You must not:**
- Download, copy, or export customer or vendor personal data (names, phone numbers, emails, access details, location data) to personal devices, spreadsheets, personal email, or messaging apps
- Use customer or vendor contact details for any purpose outside the platform (no calling vendors from your personal phone using numbers from Supabase, no emailing customers outside the notification system)
- Share Supabase dashboard credentials, Paystack dashboard credentials, admin panel login details, or Supabase service role keys with anyone not explicitly authorised
- Store personal data in tools or services not listed in the ROPA (no customer data in Google Sheets, Notion, Slack, WhatsApp groups, or personal cloud storage)
- Query the production database for purposes unrelated to an active development task, support ticket, or approved operational process
- Take screenshots of customer/vendor records unless required for an active support case or bug report, and delete them immediately after use
- Disable, weaken, or bypass Row Level Security (RLS) policies in production

**You must:**
- Use the Supabase admin panel or the VARS admin dashboard for all data access, not direct SQL queries on production unless debugging requires it
- Anonymise or pseudonymise data when creating test datasets; never copy production PII into development or staging environments
- Report any suspected data breach, unauthorised access, or accidental data exposure to the DPO (or founder) immediately, regardless of severity. See Section 8.

## 5. Access Control

Access to systems containing personal data follows the principle of least privilege: each person gets the minimum access needed for their role and nothing more.

**Supabase Dashboard (Database, Auth, Storage, Edge Functions)**
Access: Founder, DPO, authorised developers. Service role key: restricted to edge functions running in Supabase infrastructure. Never stored in client-side code, never committed to version control, never shared via messaging apps. Rotated if any team member with access leaves.

**Paystack Dashboard (Payments, Subaccounts, Settlements)**
Access: Founder only. Contains customer payment data, authorisation codes, and vendor bank details. No developer needs direct Paystack dashboard access for routine work.

**VARS Admin Panel (vars-admin.vercel.app)**
Access: Founder, DPO, authorised ops staff. Admin accounts created via `admin_users` table. Each admin has individual credentials; no shared accounts. Sessions are cookie-based with Supabase Auth.

**Vercel Dashboard (Landing page, Admin deployments)**
Access: Founder, authorised developers. Environment variables containing secrets (service role keys, API keys) are set in Vercel and never logged or exposed in build output.

**Youverify Dashboard**
Access: Founder only. Contains vendor biometric and identity verification data.

**Resend Dashboard (Email delivery)**
Access: Founder, authorised developers managing outreach delivery.

**360dialog / WhatsApp Business**
Access: Founder only. Contains WhatsApp message logs and delivery status.

**Access reviews:** The founder (or DPO once appointed) reviews all system access quarterly. When anyone's role changes or their engagement ends, their access is revoked within 24 hours.

## 6. Device and Workspace Security

Anyone with access to VARS systems must:

- Use full-disk encryption on all devices (FileVault on Mac, BitLocker on Windows, LUKS on Linux)
- Enable screen lock with a maximum 5-minute idle timeout
- Use a strong, unique password or biometric authentication on all devices
- Keep operating systems and browsers up to date
- Never access Supabase, Paystack, Youverify, or the admin panel from public or shared WiFi networks without a VPN
- Never leave devices unattended while logged into any VARS system
- Use a password manager for all VARS-related credentials; no passwords stored in plain text, browser autofill, or messaging apps

## 7. Data Subject Requests (DSRs)

Under the NDPA, data subjects (customers and vendors) have the right to access, rectify, erase, restrict, port, and object to processing of their personal data. VARS must respond within 30 days.

**Intake channels:**
- Email to the DPO (or hello@bookwithvars.com until a DPO email is established)
- In-app request (to be implemented, Phase B)
- Through the NDPC complaint process

**Process:**
1. Log the request in the DSR register (date received, data subject identity, type of request, status)
2. Verify the requester's identity (match to account email or phone; if in doubt, request confirmation from the account email on file)
3. Assess the request type and scope. Consult the ROPA to identify all processing activities involving the data subject's data.
4. Fulfil or decline within 30 days. If declining (e.g. legal obligation to retain KYC data for 5 years), provide a written explanation citing the specific legal basis.
5. If the request involves data held by a processor (Paystack authorisation codes, Youverify KYC records), contact the processor and coordinate deletion or export.
6. Record the outcome and any data deleted or provided.

**Erasure specifics (right to be forgotten):**
- Customer account deletion: remove profile, anonymise reviews to "VARS Customer", delete phone number and email, retain booking records in anonymised form for 7 years (financial records) per the data retention schedule.
- Vendor account deletion: anonymise profile, retain KYC records for 5 years (AML requirement), retain financial records for 7 years, delete portfolio photos.
- Vendor lead deletion: delete the `vendor_leads` row and all associated `vendor_lead_outreach` records.

## 8. Breach Identification and Escalation

A personal data breach is any event where personal data is accessed, disclosed, altered, lost, or destroyed without authorisation.

**Examples specific to VARS:**
- Supabase RLS misconfiguration exposing customer records to other users
- Paystack webhook logging customer payment details to an unprotected endpoint
- A developer downloading vendor phone numbers to a personal device
- Unauthorised access to the admin panel
- Youverify webhook payload logged with biometric data in plain text
- Customer access details (building, floor, flat, gate code) exposed outside the booking flow

**What to do:**
1. Report immediately to the DPO (or founder). Do not wait to assess severity. Do not attempt to fix silently.
2. The DPO initiates the process in `breach-response-runbook.md`, which includes a 72-hour NDPC notification window for qualifying breaches.
3. Preserve evidence. Do not delete logs, modify records, or alter configurations until the DPO authorises it.

## 9. Retention and Deletion

All personal data has a defined retention period. See `data-retention-schedule.md` for the complete schedule.

Key rules:
- Do not retain data beyond its stated period
- Deletion means irreversible removal, not soft-delete or archival (unless the schedule specifies anonymisation)
- The DPO is responsible for scheduling and verifying deletion runs
- Automated deletion jobs (e.g. unconverted lead cleanup at 24 months) must be implemented and monitored; see the retention schedule for specifics

## 10. Processor and Vendor Management

VARS uses third-party processors to deliver its service (see the ROPA for the full list). Rules:

- No new processor or service that handles personal data may be introduced without written approval from the DPO (or founder)
- Every processor must have a Data Processing Agreement (DPA) in place before personal data is shared with them. The DPA must meet GAID requirements: defined purpose, security obligations, breach notification, sub-processor controls, data subject rights support, return/deletion on termination.
- The DPO reviews each processor annually for continued compliance and necessity
- If a processor is discontinued, confirm data deletion or return within 30 days

**Current processors requiring DPAs:**
Supabase, Paystack, Youverify, Resend, 360dialog, Expo (push notifications), Google (OAuth), Facebook/Meta (OAuth), Apple (OAuth), Vercel.

## 11. Training and Awareness

- All individuals covered by this policy must complete data protection training before being granted access to VARS systems
- Annual refresher training is mandatory
- Training covers: this policy, the NDPA basics, breach identification and reporting, acceptable use, and DSR handling
- The DPO maintains a training register recording who was trained and when

## 12. Consequences of Non-Compliance

Breaching this policy may result in:

- Immediate revocation of system access
- Termination of contract or engagement
- Disciplinary action (for employees, once VARS has employees)
- Reporting to the NDPC if the breach constitutes a regulatory violation
- Civil or criminal liability under the NDPA (fines up to 2% of gross revenue or ₦10 million, and potential personal liability for individuals involved in deliberate violations)

## 13. Review Cycle

This policy is reviewed:

- Annually by the DPO
- Whenever a new processing activity, data type, or processor is added
- After any data breach or near-miss incident
- When regulatory requirements change (NDPA amendments, new NDPC guidance)

The DPO records each review in the policy version history, noting what changed and why.

---

**Version History**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 13 July 2026 | Seyi Ibitoye | Initial draft |
