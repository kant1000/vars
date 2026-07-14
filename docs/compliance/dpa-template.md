# VARS Data Processing Agreement (Template)

**Version:** 1.1
**Last updated:** 14 July 2026
**Status:** Draft prepared by founder - pending lawyer review before execution with any processor
**Purpose:** This template is intended for execution with each of VARS's data processors. Partially pre-filled Annex A schedules for the primary processors (Supabase, Paystack, Youverify) are included below.

---

## Background

This Data Processing Agreement ("DPA") is entered into between:

**VARS** ("the Controller"), a company registered in Nigeria, and

**[PROCESSOR NAME]** ("the Processor"), [registered address/jurisdiction],

together "the Parties."

This DPA supplements the Parties' existing commercial agreement (the underlying terms of service/subscription agreement governing use of the Processor's platform) and governs the Processor's handling of personal data on the Controller's behalf, in accordance with the Nigeria Data Protection Act 2023 ("NDPA") and the General Application and Implementation Directive 2025 ("GAID").

---

## 1. Definitions

- **"Personal Data"** means any information relating to an identified or identifiable natural person, as defined under NDPA.
- **"Sensitive Personal Data"** means personal data revealing biometric data, health data, financial data, or other categories designated as sensitive under NDPA, including the biometric identity-verification images processed via Youverify.
- **"Processing"** has the meaning given in the NDPA.
- **"Data Subject"** means the individual to whom personal data relates (VARS customers, vendors, and leads).
- **"Sub-processor"** means any third party engaged by the Processor to process personal data on the Processor's behalf.

## 2. Subject Matter and Duration

This DPA applies for as long as the Processor processes personal data on the Controller's behalf under the underlying commercial agreement, and survives termination for as long as the Processor retains any Controller personal data.

## 3. Nature and Purpose of Processing

The nature, purpose, categories of data subjects, and categories of personal data are set out in **Annex A** (completed per processor). In summary, VARS engages the following processors:

| Processor | Purpose | Data categories | ROPA reference |
|---|---|---|---|
| Supabase | Database, authentication, file storage, and edge function hosting | All categories processed by VARS (see full ROPA) | PA-01 through PA-17 |
| Paystack | Payment processing: card authorisation, gate-time charges, subaccount settlement | Payment tokens, transaction references, amounts, vendor bank/subaccount details | PA-05 |
| Youverify | Vendor identity verification (KYC) | Government ID data, biometric liveness face image, verification status | PA-03 |
| Resend | Transactional email delivery | Sender/recipient email addresses, email body (may contain name, booking reference) | PA-07 |
| 360dialog | WhatsApp OTP and notification delivery | Phone number (E.164), message content | PA-08 |
| Expo | Push notification routing (intermediary) | Device push token, notification content (title, body) | PA-09 |
| Google (FCM) | Android push notification delivery | Device push token, notification content | PA-09 |
| Apple (APNs) | iOS push notification delivery | Device push token, notification content | PA-09 |
| Vercel | Hosting of landing site and admin dashboard | Visitor IP address, request path, user-agent, request headers | PA-10 |
| Sentry | Mobile crash telemetry | Device context (OS, version, model), app version, stack traces, unhandled exception data | PA-18 |
| PostHog | Product analytics | Session identifiers, screen/event names, app version, device type | PA-18 |

## 4. Processor Obligations

The Processor shall:

1. **Process personal data only on documented instructions** from the Controller, including with regard to transfers of personal data to a third country, unless required to do otherwise by applicable law (in which case the Processor shall inform the Controller of that legal requirement before processing, unless prohibited from doing so).

2. **Ensure confidentiality** - ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.

3. **Implement appropriate technical and organisational security measures**, including but not limited to: encryption of personal data at rest and in transit; the ability to ensure ongoing confidentiality, integrity, availability, and resilience of processing systems; the ability to restore availability and access to personal data in a timely manner in the event of an incident; and a process for regularly testing and evaluating the effectiveness of these measures.

4. **Respect the conditions for engaging sub-processors** - not engage another processor without prior specific or general written authorisation of the Controller. Where general authorisation is given, the Processor shall inform the Controller of any intended changes concerning the addition or replacement of sub-processors, giving the Controller the opportunity to object. The Processor shall impose the same data protection obligations on any sub-processor as set out in this DPA.

5. **Assist the Controller with data subject rights** - insofar as possible, assist the Controller by appropriate technical and organisational measures for the fulfilment of the Controller's obligation to respond to requests for exercising data subject rights under NDPA (access, rectification, erasure, restriction, portability, objection).

6. **Assist the Controller with compliance** - assist the Controller in ensuring compliance with obligations relating to the security of processing, breach notification, and DPIAs, taking into account the nature of processing and information available to the Processor.

7. **Notify the Controller of any personal data breach without undue delay and in any event within 24 hours of the Processor becoming aware of the breach**, to allow the Controller to assess and notify the Nigeria Data Protection Commission ("NDPC") within the Controller's 72-hour statutory deadline under NDPA. The notification shall describe the nature of the breach, the categories and approximate number of data subjects and records concerned, the likely consequences, and the measures taken or proposed by the Processor. The Controller's breach notification contact is: hello@bookwithvars.com.

8. **Delete or return all personal data** to the Controller after the end of the provision of services, at the Controller's choice, and delete existing copies unless applicable law requires storage of the personal data (e.g. retained financial/audit records).

9. **Make available to the Controller all information necessary to demonstrate compliance** with this DPA, and allow for and contribute to audits, including inspections, conducted by the Controller or an auditor mandated by the Controller (which may include a licensed Data Protection Compliance Organisation engaged as part of VARS's statutory audit obligations).

## 5. Cross-Border Data Transfer

Where the Processor processes personal data outside Nigeria, or engages sub-processors located outside Nigeria, the Processor shall:

1. Disclose the location(s) where personal data will be processed or stored.
2. Confirm the transfer mechanism relied upon (e.g. Standard Contractual Clauses recognised by the NDPC, an adequacy determination, or another lawful derogation under NDPA Sections 41–43).
3. Provide reasonable assistance to the Controller in completing a Transfer Impact Assessment where required.
4. Notify the Controller of any change in the location of processing that would affect the lawful basis for transfer.

**[To be completed per processor in Annex A: confirmed data residency/location, and the transfer mechanism relied upon.]**

## 6. Sensitive Personal Data

Where the Processor processes sensitive personal data (defined in Clause 1), the Processor shall additionally:

1. Confirm the specific lawful basis and consent mechanism used to collect the data on the Controller's behalf (or confirm that consent is captured by the Controller prior to the data reaching the Processor).
2. Apply enhanced security measures appropriate to sensitive data, including but not limited to encryption, strict access controls, and audit logging of all access to sensitive records.
3. Not retain sensitive personal data for longer than the period instructed by the Controller (see the Controller's data retention schedule - biometric data: 5 years post-relationship, aligned to the Money Laundering (Prevention and Prohibition) Act 2022), and confirm the Processor's own retention/deletion practice for this data.
4. Disclose any certifications relevant to the processing of sensitive data (e.g. ISO 27001, ISO 27018, SOC 2 Type II) and confirm their current validity.

**Processors handling sensitive personal data under this template:** Youverify (biometric/government ID data); Supabase (hosts the biometric images in private storage); Sentry (must confirm that no biometric data or PII is exposed via crash reports or stack traces).

## 7. Liability and Indemnity

Each Party shall be liable for and shall indemnify the other Party against any claims, damages, fines, or penalties arising from its own breach of this DPA or applicable data protection law. Where the Parties' underlying commercial agreement limits the Processor's liability, such cap shall not apply to breaches of this DPA that result in NDPC enforcement action or third-party claims against the Controller arising directly from the Processor's non-compliance.

## 8. Term and Termination

This DPA remains in effect for the duration of the underlying commercial agreement and survives termination to the extent necessary to give effect to the Processor's data return/deletion obligations under Clause 4.8.

## 9. Governing Law

This DPA is governed by the laws of the Federal Republic of Nigeria, without prejudice to any mandatory data protection obligations applicable to the Processor in its own jurisdiction.

---

## Annex A: Processor-Specific Schedules

### A.1 Supabase

| Field | Detail |
|---|---|
| Processor name | Supabase, Inc. |
| Registered address / jurisdiction | San Francisco, CA, USA |
| Data processed on Controller's behalf | All categories in the VARS ROPA: customer and vendor profiles, bookings, payments, reviews, notifications, KYC metadata, vendor location data, DSRs, consent records (`terms_acceptances`), and biometric images (private storage bucket) |
| Purpose of processing | Database hosting, authentication, file storage, and serverless edge function execution for the VARS platform |
| Categories of data subjects | VARS customers, vendors, and vendor leads |
| Location(s) of processing/storage | eu-central-1 (Frankfurt, Germany) - primary data residency EU |
| Sub-processors engaged | Supabase discloses current sub-processors at supabase.com/privacy (includes AWS, Cloudflare). Confirm currency at contract execution. |
| Cross-border transfer mechanism relied upon | [To confirm with legal counsel - candidates: NDPC-recognised SCCs; consent-based derogation under NDPA s.41; or Supabase's own Data Processing Addendum if accepted as compliant] |
| Security certifications held | SOC 2 Type II; ISO 27001 (confirm current scope and validity at execution) |
| Data retention period applied by Processor | Data retained in the Controller's project until the Controller deletes it or terminates the project; backups per plan tier (confirm at execution) |
| Breach notification contact / process | Via Supabase dashboard security contacts or their DPA breach notification process |
| Audit rights confirmed | Subject to Supabase's standard enterprise DPA terms |

### A.2 Paystack

| Field | Detail |
|---|---|
| Processor name | Paystack Payments Limited |
| Registered address / jurisdiction | Lagos, Nigeria (primary); note: Stripe, Inc. (parent company) San Francisco, CA, USA |
| Data processed on Controller's behalf | Payment authorisation tokens, transaction references, amounts, vendor bank account details, subaccount settlement records |
| Purpose of processing | Card authorisation, payment splitting via subaccount model, and settlement of vendor earnings |
| Categories of data subjects | VARS customers (payment/card data); VARS vendors (bank account and subaccount details) |
| Location(s) of processing/storage | Nigeria (Paystack operations). Confirm whether card authorisation data transits Stripe's US/EU infrastructure and on what legal basis. |
| Sub-processors engaged | Stripe, Inc. (parent infrastructure); card networks (Visa, Mastercard, Verve) |
| Cross-border transfer mechanism relied upon | [To confirm - Paystack is Nigerian-incorporated; establish whether Stripe's involvement creates a cross-border transfer requiring a mechanism under NDPA s.41–43] |
| Security certifications held | PCI-DSS Level 1 (confirm current validity at execution) |
| Data retention period applied by Processor | Paystack retains transaction records per its CBN regulatory obligations; confirm specific schedule at execution |
| Breach notification contact / process | Via Paystack merchant dashboard or their DPA/enterprise process |
| Audit rights confirmed | Subject to Paystack's standard merchant terms |

### A.3 Youverify

| Field | Detail |
|---|---|
| Processor name | Youverify Incorporated |
| Registered address / jurisdiction | Lagos, Nigeria |
| Data processed on Controller's behalf | Government-issued ID data, biometric liveness face image, NIN/BVN validation result, verification decision and status |
| Purpose of processing | Vendor identity verification (KYC) during onboarding |
| Categories of data subjects | VARS vendors only |
| Location(s) of processing/storage | [To confirm with Youverify - establish whether biometric data is processed and stored within Nigeria or crosses to a third-country infrastructure] |
| Sub-processors engaged | [To confirm - may include a cloud infrastructure provider; disclose at execution] |
| Cross-border transfer mechanism relied upon | [To confirm - if all processing stays within Nigeria, no cross-border mechanism required; confirm explicitly] |
| Security certifications held | [Request ISO 27001 or equivalent at contract execution; required given biometric sensitivity] |
| Data retention period applied by Processor | [To confirm at execution - VARS's instruction is 5 years post-relationship under MLPPA 2022; Youverify must confirm its own retention practice and agree to delete on instruction] |
| Breach notification contact / process | [To confirm at contract execution] |
| Audit rights confirmed | Audit rights (Clause 4.9) are a priority for this processor given the biometric risk profile - to negotiate |

---

## Notes for Legal Review

1. **Supabase and Paystack likely have their own standard/model DPAs** available for customers to countersign. Recommend checking whether their standard terms can be adopted (with any Nigeria-specific amendments) rather than requiring them to sign VARS's own template, which may not be commercially practical for a company of VARS's size relative to these providers.
2. **Youverify, being a smaller and more specialised KYC provider**, may be more willing to execute a bespoke DPA or amend VARS's template directly, particularly given the sensitivity of the biometric data involved. Audit rights (Clause 4.9) should be non-negotiable.
3. **The cross-border transfer mechanism (Clause 5) is the most legally uncertain part of this document** - the NDPC had not published approved Standard Contractual Clause templates as of July 2026. Recommend counsel advise on the safest available interim position (e.g. consent-based derogation with full risk disclosure in the privacy policy, pending SCC publication). Monitor NDPC guidance actively.
4. **Liability clause (§7):** This template does not set specific liability caps or indemnity amounts. Recommend counsel align this with VARS's broader commercial risk tolerance and any existing liability provisions in the underlying agreements with each processor.
5. **Embedded SDK processors (Sentry, PostHog, Expo, Google FCM, Apple APNs):** These providers do not negotiate bespoke DPAs at VARS's current scale. Each publishes its own Data Processing Agreement or Privacy Policy that functions as the contractual basis for SDK users. The Controller's obligation is to: (a) confirm that each provider's published DPA covers the categories of data transmitted; (b) ensure no PII beyond what is documented in §3 is passed to these SDKs; and (c) keep them disclosed in the VARS Privacy Policy. Sentry's DPA and transfer mechanism should be confirmed before public go-live given the Medium residual risk identified in the DPIA.
