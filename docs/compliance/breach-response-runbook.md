# VARS Data Breach Response Runbook

**Version:** 1.0
**Last updated:** 13 July 2026
**Status:** Approved by founder, pending DPO sign-off
**Owner:** DPO (once appointed); Founder acts as interim owner until DPO is in place
**Legal basis:** NDPA 2023 Section 40; GAID 2025

---

## 1. What Counts as a Breach

A personal data breach is any security incident that leads to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data. Examples relevant to VARS:

**High severity**
- Unauthorised access to the Supabase database (e.g. leaked service-role key)
- Exposure of KYC biometric images (vendor face photos)
- Exposure of customer access details (building, floor, flat, gate code)
- Paystack authorization codes leaked or accessed by unauthorised party
- Bulk export or scraping of customer/vendor personal data

**Medium severity**
- Single vendor or customer account compromised (credential stuffing, session hijack)
- Vendor able to see another vendor's data due to RLS misconfiguration
- Push notification sent to wrong recipient containing personal details
- Admin credentials compromised

**Low severity**
- Accidental email sent to wrong vendor lead (single record, non-sensitive)
- System logs temporarily containing PII that should have been redacted
- Failed brute-force attempt (no data accessed)

**Not a breach (but log anyway)**
- Unsuccessful attack attempts with no data access
- Planned downtime or data migration
- User voluntarily sharing their own data

---

## 2. Response Team

| Role | Person | Responsibility |
|---|---|---|
| Incident Lead | DPO (or Founder until DPO appointed) | Owns the response; makes classification and notification decisions; interfaces with NDPC |
| Technical Lead | Founder / lead developer | Investigates root cause; contains the breach; implements fixes |
| Legal Counsel | Engaged lawyer | Advises on notification obligations; drafts NDPC submission if needed |
| Comms Lead | Founder | Drafts data subject notifications; handles any press/public queries |

For a small team, the Founder may fill multiple roles. The key constraint is: the **72-hour clock starts when any team member becomes aware** of a breach, not when it's formally classified.

---

## 3. The 72-Hour Timeline

```
HOUR 0          Breach detected or reported
                |
                v
HOUR 0-2        CONTAIN: Stop the bleeding (see Step 1 below)
                |
                v
HOUR 2-6        ASSESS: Classify severity, identify affected data/subjects (Step 2)
                |
                v
HOUR 6-12       DECIDE: Does this require NDPC notification? (Step 3 decision tree)
                |
                v
HOUR 12-48      PREPARE: Draft NDPC notification and data subject notice if required (Step 4)
                |
                v
HOUR 48-72      SUBMIT: File with NDPC; notify affected data subjects (Step 5)
                |
                v
HOUR 72+        REMEDIATE: Root cause fix, post-incident review, update this runbook (Step 6)
```

**The 72-hour deadline is from awareness to NDPC notification, not from awareness to resolution.** You can (and should) notify before the investigation is complete. The NDPA allows phased reporting.

---

## 4. Step-by-Step Response

### Step 1: Contain (Hour 0-2)

Immediate actions depending on breach type:

| Scenario | Containment action |
|---|---|
| Leaked Supabase service-role key | Rotate key immediately in Supabase dashboard; update all edge function secrets; revoke old key |
| Leaked Paystack secret key | Rotate in Paystack dashboard; update Supabase secrets; check recent transaction logs for anomalies |
| Compromised admin account | Disable the admin user row; invalidate all sessions; rotate Supabase anon/service-role keys if admin had access |
| RLS misconfiguration exposing data | Deploy a hotfix RLS policy; if severe, temporarily disable the affected endpoint |
| Compromised vendor/customer account | Force password reset; revoke all sessions for that user; check for unauthorised data access in Supabase logs |
| KYC images exposed | Revoke public access to vendor-identity-images bucket; verify bucket policy is private; rotate any leaked URLs |
| Bulk data exfiltration | Identify the access vector; revoke the credential/token used; check Supabase audit logs for scope |

**Do not delete evidence.** Preserve logs, screenshots, and timestamps. You'll need them for the NDPC notification and any investigation.

### Step 2: Assess (Hour 2-6)

Answer these questions and record the answers in the breach register:

1. **What data was affected?** (Map to ROPA categories: PA-01 through PA-13)
2. **How many data subjects?** (Approximate count)
3. **What type of breach?** (Confidentiality: unauthorised access/disclosure. Integrity: unauthorised alteration. Availability: loss/destruction.)
4. **Is the data sensitive?** (Biometric KYC images = sensitive. Access details = high commercial sensitivity.)
5. **Is the breach ongoing or contained?**
6. **How was the breach detected?** (Internal monitoring, user report, third-party notification, attacker disclosure)
7. **What is the potential harm?** (Identity theft, financial loss, physical safety risk from exposed access details, reputational damage)

### Step 3: Decide on Notification (Hour 6-12)

**NDPC notification is required if the breach is "likely to result in a risk to the rights and freedoms of data subjects."**

Use this decision tree:

```
Does the breach involve sensitive data (biometrics, KYC)?
  YES --> Notify NDPC + notify affected data subjects
  NO  --> Continue

Does the breach involve financial data (payment tokens, bank details)?
  YES --> Notify NDPC + notify affected data subjects
  NO  --> Continue

Does the breach involve access details (building, floor, flat, gate code)?
  YES --> Notify NDPC + notify affected data subjects (physical safety risk)
  NO  --> Continue

Does the breach affect more than 100 data subjects?
  YES --> Notify NDPC; assess whether to notify data subjects
  NO  --> Continue

Could the breach result in identity theft, financial loss, or physical harm?
  YES --> Notify NDPC + notify affected data subjects
  NO  --> Log in breach register only; no external notification required
```

**When in doubt, notify.** The NDPC penalises under-reporting, not over-reporting.

### Step 4: Prepare Notifications (Hour 12-48)

**NDPC notification must contain (NDPA s.40):**

1. Description of the nature of the breach
2. Categories and approximate number of data subjects affected
3. Categories and approximate number of personal data records affected
4. Name and contact details of the DPO (or Founder as interim)
5. Description of the likely consequences of the breach
6. Description of the measures taken or proposed to address the breach, including mitigation measures

**Data subject notification must contain (clear, plain language):**

1. What happened (in simple terms, no jargon)
2. What data of theirs was affected
3. What VARS has done to contain it
4. What they should do (e.g. change password, monitor bank statements, be alert for suspicious contact)
5. How to reach VARS for questions (DPO contact or hello@bookwithvars.com)
6. Their right to lodge a complaint with the NDPC

**Template location:** See Appendix A below.

### Step 5: Submit and Notify (Hour 48-72)

- Submit NDPC notification via the NDPC portal or the designated email/submission channel (confirm current process with DPO/lawyer)
- Send data subject notifications via the most direct channel available (push notification + email for app users; email for leads)
- If the breach involves Paystack-related data, also notify Paystack per their DPA/incident reporting terms
- If the breach involves Youverify-related data, also notify Youverify

### Step 6: Remediate (Hour 72+)

1. **Root cause analysis:** Document what went wrong, why, and how it was exploited
2. **Fix:** Implement the technical or procedural fix
3. **Verify:** Confirm the fix closes the vulnerability (test it)
4. **Update documentation:** Update this runbook, the ROPA, or security policies if the breach revealed a gap
5. **Post-incident review:** Within 2 weeks, hold a review covering what worked, what didn't, and what changes are needed
6. **NDPC follow-up:** If phased reporting was used, submit the final report to the NDPC once the investigation is complete

---

## 5. Breach Register

Every breach or suspected breach must be logged, regardless of severity or whether NDPC notification was required. This register is subject to DPCO audit.

| Field | Description |
|---|---|
| Incident ID | Sequential (e.g. VARS-BR-001) |
| Date/time detected | When the first team member became aware |
| Date/time contained | When the breach was stopped |
| Detected by | Person or system that identified it |
| Description | What happened |
| Data categories affected | Map to ROPA (e.g. PA-03, PA-05) |
| Data subjects affected | Count and category (customers, vendors, leads) |
| Severity | High / Medium / Low |
| Root cause | Technical or procedural failure |
| Containment actions | What was done immediately |
| NDPC notified? | Yes / No; if yes, date and reference |
| Data subjects notified? | Yes / No; if yes, date and channel |
| Processors notified? | Which processors, date |
| Remediation actions | What was fixed |
| Post-incident review date | When the review was held |
| Lessons / policy changes | What changed as a result |

**Storage:** Maintain as a restricted-access spreadsheet or database table. Only accessible to the Incident Lead (DPO/Founder) and Legal Counsel. Retain for 6 years.

---

## 6. Proactive Monitoring

To detect breaches early, VARS should maintain:

| Measure | Implementation |
|---|---|
| Supabase audit logs | Enable and review Postgres audit logging for sensitive tables (vendors, profiles, bookings) |
| Edge function error monitoring | Monitor for unexpected 401/403/500 patterns that could indicate credential abuse |
| Failed auth monitoring | Track repeated failed login attempts in Supabase Auth logs |
| Secret rotation schedule | Rotate Supabase service-role key, Paystack keys, and Youverify keys every 6 months (or immediately on any team member departure) |
| Access review | Quarterly review of who has access to Supabase dashboard, Paystack dashboard, Vercel, and admin panel |
| Dependency monitoring | Watch for security advisories on key dependencies (Supabase client, Expo, Paystack SDK) |

---

## Appendix A: Notification Templates

### NDPC Notification Template

```
To: Nigeria Data Protection Commission
From: [DPO Name], Data Protection Officer, VARS
Date: [DATE]
Re: Personal Data Breach Notification under NDPA Section 40

1. CONTROLLER DETAILS
   Name: VARS ([CAC registered name])
   Address: [Address]
   DPO: [Name], [Email], [Phone]

2. NATURE OF THE BREACH
   [Description of what occurred, when it was detected, and the type
   of breach (confidentiality/integrity/availability)]

3. DATA SUBJECTS AFFECTED
   Categories: [Customers / Vendors / Leads]
   Approximate number: [N]

4. DATA RECORDS AFFECTED
   Categories: [List from ROPA, e.g. "account profiles, booking
   history, access details"]
   Approximate number of records: [N]

5. LIKELY CONSEQUENCES
   [Description of potential harm: identity theft, financial loss,
   physical safety risk, reputational harm]

6. MEASURES TAKEN
   Containment: [What was done to stop the breach]
   Mitigation: [What was done to reduce harm to data subjects]
   Remediation: [Planned or completed fixes]

7. DATA SUBJECT NOTIFICATION
   [Confirm whether data subjects have been / will be notified,
   and by what channel]

8. ADDITIONAL INFORMATION
   [Any other relevant details; note if this is a phased report
   with further details to follow]
```

### Data Subject Notification Template (Push + Email)

```
Subject: Important security notice from VARS

We're writing to let you know about a security incident that may
have affected your VARS account.

WHAT HAPPENED
[Plain-language description, 1-2 sentences]

WHAT DATA WAS INVOLVED
[Specific data types, e.g. "your name and email address" or
"your booking access details"]

WHAT WE'VE DONE
[Actions taken to contain and fix the issue]

WHAT YOU SHOULD DO
[Specific guidance, e.g. "change your password", "monitor your
bank statements", "be cautious of unexpected messages"]

QUESTIONS?
Contact our Data Protection Officer at [DPO email] or reply to
this message.

You also have the right to lodge a complaint with the Nigeria
Data Protection Commission at ndpc.gov.ng.

VARS
```

---

## Review Cycle

This runbook must be reviewed:
- Annually by the DPO
- After every breach or near-miss incident
- When a new processor or data type is added to the ROPA
