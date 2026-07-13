# Privacy Policy

**Version:** 1.0
**Last updated:** 13 July 2026
**Status:** Draft, pending lawyer review
**Owner:** DPO (once appointed); interim: Seyi Ibitoye, Founder

---

## 1. Who We Are

VARS is an on-demand beauty and grooming marketplace that connects customers in Lagos with verified barbers, hair stylists, makeup artists, and nail technicians. When we say "VARS", "we", "us", or "our" in this policy, we mean the entity operating the VARS platform.

**Controller:** VARS (CAC-registered entity, Lagos, Nigeria)
**Website:** [bookwithvars.com](https://bookwithvars.com)
**Contact:** hello@bookwithvars.com
**Data Protection Officer:** To be appointed. Contact details will be published here once the DPO is in place. Until then, direct all data protection queries to hello@bookwithvars.com.

This policy explains what personal data we collect, why we collect it, who we share it with, how long we keep it, and what rights you have. It applies to the VARS mobile app (iOS and Android), the website at bookwithvars.com, and any related services.

## 2. What Data We Collect

We collect different data depending on whether you are a customer, a vendor (beauty professional), or a prospective vendor (lead).

### 2.1 Customers

| Data | When we collect it |
|---|---|
| Name, email address | When you create your account |
| Phone number | When you add it to your profile |
| Google or Facebook profile info (name, email) | If you sign in with Google or Facebook |
| Payment card details | When you verify your card (processed by Paystack; we store only a reusable token, never your full card number) |
| Location (GPS coordinates) | When you set your location for vendor discovery and when you place a booking |
| Booking access details (building name, floor, flat number, gate code) | When you confirm a booking |
| Booking history, status, and timestamps | Throughout the booking lifecycle |
| Reviews and ratings you leave | When you submit a review |
| Dispute details (category and description) | If you raise a dispute |
| Push notification token | When you allow notifications on your device |

### 2.2 Vendors (Beauty Professionals)

| Data | When we collect it |
|---|---|
| Name, email address, phone number | When you create your account or register as a lead |
| Bio, service listings (names, descriptions, prices, durations) | When you set up your profile and services |
| Government-issued ID and liveness face image (biometric data) | When you complete identity verification (KYC) via Youverify |
| Profile photo | Extracted from your KYC liveness check; locked to your account |
| Bank account details (account number, bank name) | When you add your bank details for payouts (verified via Paystack) |
| Location (GPS coordinates) | While you are online (every 5 minutes for zone drift detection) and while en route to a customer (every 60 seconds for live tracking) |
| Auto-accept zone settings (centre coordinates, radius) | When you configure your zone |
| Schedule and availability | When you manage your calendar |
| Portfolio photos | When you upload them (with customer consent where applicable) |
| Booking history, earnings, and payout records | Throughout your use of the platform |
| KYC status and rejection reasons | From your identity verification result |
| Cancellation count and restriction status | Tracked automatically based on your booking activity |
| Push notification token | When you allow notifications on your device |

### 2.3 Prospective Vendors (Leads)

| Data | When we collect it |
|---|---|
| Name, email, phone number, service type | When you register interest on bookwithvars.com |
| Pioneer status | Assigned at registration (first 50 verified vendors) |
| Lead state and outreach history | Tracked as we follow up with you |
| Email unsubscribe preference | When you click the unsubscribe link in any email |

### 2.4 Data We Do Not Collect

We do not collect data from children under 18. VARS is not directed at minors, and if we learn that a person under 18 has created an account, we will delete it.

We do not collect browsing behaviour or advertising identifiers. The mobile app uses Sentry for crash reporting and PostHog as an analytics provider; both are configured to minimise data collection (crash reports only; automatic screen capture disabled). See our [Cookie and Tracking Policy](cookie-policy.md) for full details.

## 3. Why We Collect It and Our Legal Basis

Nigerian data protection law (NDPA 2023) requires us to have a lawful basis for every type of processing. Here is how each purpose maps:

| Purpose | Lawful basis |
|---|---|
| Create and manage your account | Performance of contract |
| Process bookings, payments, and refunds | Performance of contract |
| Verify vendor identity (KYC) | Explicit consent (biometric data) + legal obligation (AML record-keeping) |
| Verify vendor bank accounts for payouts | Performance of contract |
| Show nearby vendors to customers (location-based discovery) | Legitimate interest (core platform function) |
| Track vendor location while en route to a customer | Performance of contract (live tracking is part of the booking) |
| Send booking confirmations, reminders, and status updates | Performance of contract |
| Resolve disputes between customers and vendors | Performance of contract + legitimate interest |
| Display reviews and ratings | Legitimate interest (platform trust) |
| Follow up with prospective vendors (lead outreach) | Consent (form submission) + legitimate interest (outreach) |
| Send marketing emails or WhatsApp messages to leads | Legitimate interest with opt-out (unsubscribe available in every message) |
| Prevent fraud and enforce platform rules | Legitimate interest |

Where we rely on consent, you can withdraw it at any time (see Section 7).

## 4. Who We Share Your Data With

We share personal data only with the parties necessary to deliver the service. We never sell your data.

### 4.1 Between Customers and Vendors

When a booking is confirmed, limited information is shared between both parties:

- The customer sees the vendor's name, profile photo, bio, services, ratings, reviews, and average response time
- The vendor sees the customer's first name and service requested
- 15 minutes before the appointment: the vendor receives the customer's phone number and access details. The customer receives the vendor's phone number.
- During live tracking: the customer sees the vendor's real-time location on a map

### 4.2 Third-Party Processors

We use the following service providers to operate the platform. Each processes data on our behalf, under contract, and only for the purposes stated:

| Processor | What they handle | Where data is processed |
|---|---|---|
| **Supabase** | Database hosting, user authentication, file storage, edge function execution | United States / European Union |
| **Paystack** | Payment processing, card verification, vendor bank verification, subaccount settlements | Nigeria (primary); payment network infrastructure may involve other jurisdictions |
| **Youverify** | Vendor identity verification (KYC), including biometric liveness check | Nigeria (confirm with Youverify re: data residency) |
| **Resend** | Email delivery (outreach, marketing, transactional) | United States |
| **360dialog** | WhatsApp message delivery (transactional messages) | European Union / Meta infrastructure |
| **Expo** | Push notification delivery (via Apple APNs and Google FCM) | United States |
| **Google** | OAuth sign-in (customers) | United States |
| **Facebook / Meta** | OAuth sign-in (customers) | United States |
| **Apple** | OAuth sign-in (customers); push notification delivery (APNs) | United States |
| **Vercel** | Website and admin panel hosting | United States / edge network |

### 4.3 Other Disclosures

We may disclose personal data if required by law, court order, or regulatory request from a Nigerian authority (including the NDPC or law enforcement). We will notify you unless prohibited by law.

## 5. Cross-Border Transfers

Some of our processors are based outside Nigeria. When your data is transferred internationally, we protect it through:

- Data Processing Agreements (DPAs) with each processor, containing security, confidentiality, and data protection obligations
- Transfer Impact Assessments where required
- Standard Contractual Clauses (SCCs) or equivalent safeguards as approved by the NDPC

These transfers are necessary to provide the service (for example, Supabase hosts the database infrastructure, and Expo delivers push notifications through Apple and Google's global infrastructure).

## 6. How Long We Keep Your Data

We retain personal data only as long as necessary for the purpose it was collected, or as required by law. Key retention periods:

| Data type | Retention period |
|---|---|
| Customer account data | Life of account + 6 months after deletion |
| Vendor account data | Life of account + 6 months after deletion |
| KYC records (ID documents, face images) | 5 years after end of vendor relationship (AML legal requirement) |
| Booking records and payment history | 6 years (CITA financial records) |
| Payout and settlement records | 6 years |
| Reviews | Life of platform; anonymised to "VARS Customer" if you delete your account |
| Dispute records | 6 years |
| Vendor lead data (unconverted) | 24 months from last contact, then deleted |
| Push notification tokens | Deleted on app uninstall or when you disable notifications |
| Location data (vendor GPS) | Real-time only; overwritten on each update, not stored historically |
| Booking access details | Deleted 30 days after booking completion or cancellation |

For the full schedule, see our internal Data Retention Schedule.

## 7. Your Rights

Under the NDPA, you have the following rights over your personal data:

**Access.** You can request a copy of the personal data we hold about you.

**Rectification.** You can ask us to correct inaccurate data or complete incomplete data.

**Erasure.** You can ask us to delete your data. We will comply unless we have a legal obligation to retain it (for example, KYC records for 5 years, financial records for 7 years). Where we cannot delete, we will anonymise.

**Restriction.** You can ask us to limit how we process your data while a concern is being resolved.

**Portability.** You can request your data in a structured, commonly used, machine-readable format.

**Objection.** You can object to processing based on legitimate interest. We will stop unless we have compelling grounds that override your rights.

**Withdraw consent.** Where processing is based on your consent (such as KYC biometric verification or marketing communications), you can withdraw it at any time. Withdrawal does not affect processing that already took place.

**Complaint.** You have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at [ndpc.gov.ng](https://ndpc.gov.ng).

### How to Exercise Your Rights

Email us at hello@bookwithvars.com with your request. Include enough information for us to verify your identity (the email address or phone number on your account). We will respond within 30 days.

If you want to unsubscribe from marketing emails, click the unsubscribe link at the bottom of any email we send. It takes effect immediately.

## 8. Security

Our security measures include:

- Encryption in transit (TLS/HTTPS for all connections) and at rest (database and storage encryption)
- Row Level Security (RLS) policies ensuring users can only access their own data
- Hashed and salted passwords (bcrypt via Supabase Auth)
- HMAC-authenticated webhooks for payment and KYC callbacks
- Role-based access controls for internal systems (admin panel, Supabase dashboard, Paystack dashboard)
- Service role keys restricted to server-side functions only; never exposed in client-side code
- Content filtering on user inputs (access details, bios, service descriptions) to prevent contact-sharing outside the platform
- Device-level portfolio photo scanning to reject images containing phone numbers or social media handles

If you believe your account has been compromised, contact us immediately at hello@bookwithvars.com.

## 9. Cookies and Tracking

The VARS website uses only strictly necessary cookies. The mobile app uses Sentry (crash reporting) and PostHog (analytics provider) as described in Section 2.4 above. Neither tool is used for advertising, profiling, or selling data. For full details, see our [Cookie and Tracking Policy](cookie-policy.md).

## 10. Changes to This Policy

We may update this policy from time to time. When we make material changes, we will notify you via the app (push notification or in-app notice) or by email before the changes take effect. The "Last updated" date at the top of this page always reflects the most recent version.

Continued use of VARS after a policy update constitutes acceptance of the updated terms. If you do not agree with a change, you may delete your account.

## 11. Contact Us

**General enquiries:** hello@bookwithvars.com
**Data protection enquiries:** hello@bookwithvars.com (DPO contact details will be published here once the DPO is appointed)
**Website:** [bookwithvars.com](https://bookwithvars.com)

**Complaints:** If you are not satisfied with our response to a data protection concern, you have the right to lodge a complaint with the Nigeria Data Protection Commission (NDPC) at [ndpc.gov.ng](https://ndpc.gov.ng).

---

**Version History**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 13 July 2026 | Seyi Ibitoye | Initial draft |
