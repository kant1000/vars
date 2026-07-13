# VARS Data Retention Schedule

**Version:** 1.0
**Last updated:** 13 July 2026
**Status:** Approved by founder, pending lawyer review
**Owner:** DPO (once appointed)

---

## Purpose

This schedule defines how long VARS retains each category of personal data, the lawful basis for processing, and the deletion/anonymisation method. It implements the storage limitation principle under the Nigeria Data Protection Act 2023 (NDPA) Section 24(1)(d) and the GAID 2025 Article 49(3) default (processing must end no later than 6 months after the original purpose is fulfilled, unless a law requires longer).

---

## Customer Data

| # | Data type | Examples | Purpose | Lawful basis | Retention period | Rationale | Deletion method |
|---|---|---|---|---|---|---|---|
| 1 | Account profile | Name, email, phone | Service delivery | Contract | Life of account + 6 months | GAID 6-month default after purpose ends | Anonymise on account deletion request |
| 2 | Auth credentials | Supabase Auth record, sessions | Authentication | Contract | Life of account | Deleted with account | Hard delete |
| 3 | Booking history | Dates, services, amounts, status | Service delivery, disputes, tax records | Contract + legal obligation | 6 years after booking completion | Nigerian tax record retention (CITA) | Anonymise (remove PII, keep aggregate) |
| 4 | Access details | Building, floor, flat, gate code | Service delivery | Contract | 30 days after booking completion | Sensitive location data, no reason to keep longer | Hard delete |
| 5 | Customer GPS location | Lat/lng at booking time | Vendor matching, transport surcharge | Contract | Life of booking record (anonymised at 6-year mark) | Stored on booking row, needed for dispute evidence | Anonymise with booking |
| 6 | Payment tokens | Paystack authorization_code | Process future payments | Contract + consent | Life of account + 30 days | Customer can request removal; triggers re-verification on next booking | Hard delete on account deletion |
| 7 | Reviews | Star rating, comment text | Platform trust, vendor quality | Legitimate interest | Life of platform (anonymised on account deletion) | Reviews remain visible but attributed to "VARS Customer" | Anonymise author |
| 8 | Dispute records | Category, reason, resolution | Legal claims, regulatory | Legal obligation | 6 years after resolution | Statute of limitations | Archive then delete |
| 9 | Push tokens | Expo push token | Notifications | Contract | Life of account | Useless after account closure | Hard delete |
| 10 | Notification log | In-app notification records | Service delivery, audit trail | Legitimate interest | 12 months | Operational, no long-term need | Hard delete |

## Vendor Data

| # | Data type | Examples | Purpose | Lawful basis | Retention period | Rationale | Deletion method |
|---|---|---|---|---|---|---|---|
| 11 | Vendor profile | Name, email, phone, bio | Service delivery | Contract | Life of account + 6 months | GAID default | Anonymise |
| 12 | KYC biometric data | Youverify liveness face image (raw + cropped) | Identity verification | Explicit consent + legal obligation | 5 years after end of vendor relationship | Money Laundering Act 2022 s.16 | Hard delete from storage bucket |
| 13 | KYC status/metadata | kyc_status, rejection_reason | Verification record | Legal obligation | 5 years after end of vendor relationship | Aligns with biometric retention | Hard delete |
| 14 | Bank account details | Account number, bank code (Paystack subaccount) | Payouts | Contract | Life of account + 6 years | Tax/financial records | Hard delete after retention |
| 15 | Vendor GPS location | Live lat/lng while on_way or online | Customer tracking, drift detection | Contract | 24 hours (overwritten each ping) | Already ephemeral (current_lat/lng columns); no historical tracking stored | Overwritten in place |
| 16 | Portfolio photos | Uploaded images | Marketing, customer trust | Consent (photo consent flow) | Life of account or until vendor removes | Vendor controls their own portfolio | Hard delete on removal |
| 17 | Earnings/payout history | payout_history records | Financial records, tax | Contract + legal obligation | 6 years after payout | Tax record retention | Hard delete after retention |
| 18 | Schedule/calendar | vendor_calendar blocks, recurring rules | Service delivery | Contract | Rolling 14-day window (past blocks auto-irrelevant) + 6 months historical | Operational | Hard delete past records |
| 19 | Services | vendor_services listings | Service delivery | Contract | Life of account | Active catalogue | Hard delete on account deletion |

## Lead Data

| # | Data type | Examples | Purpose | Lawful basis | Retention period | Rationale | Deletion method |
|---|---|---|---|---|---|---|---|
| 20 | Vendor leads | Name, email, phone, service_type, pioneer flag | Pre-launch acquisition | Consent (form submission) + legitimate interest | 24 months from last contact if unconverted | No purpose after sustained inactivity | Hard delete |
| 21 | Outreach messages | vendor_lead_outreach records | Nurture/comms audit | Legitimate interest | 24 months from send date | Audit trail for consent/unsubscribe compliance | Hard delete |

## Admin/System Data

| # | Data type | Examples | Purpose | Lawful basis | Retention period | Rationale | Deletion method |
|---|---|---|---|---|---|---|---|
| 22 | Admin user records | admin_users | Platform operation | Legitimate interest | Life of admin role + 6 months | Operational | Hard delete |
| 23 | System alerts | system_alerts, cron health | Monitoring | Legitimate interest | 90 days | Operational diagnostics only | Hard delete |

---

## Implementation Notes

- **"Hard delete"** means removal from primary database tables and storage buckets. Supabase point-in-time recovery backups are retained per Supabase's infrastructure policy; data will age out of backups naturally within Supabase's backup window.
- **"Anonymise"** means replacing PII fields (name, email, phone, location) with null or placeholder values while retaining the record structure for aggregate/financial reporting.
- **Access details (row 4)** require a scheduled cleanup job: a cron that nullifies `access_building`, `access_floor`, `access_flat`, `access_code` on bookings where `completed_at` or `cancelled_at` is older than 30 days.
- **Vendor GPS (row 15)** is already ephemeral by design: `vendor_current_lat` and `vendor_current_lng` are overwritten on each location ping. No historical GPS trail is stored.
- **Unconverted leads (row 20)** require a scheduled cleanup job: delete `vendor_leads` rows where `converted = false` and `last_outreach` (or `created_at` if never contacted) is older than 24 months.

---

## Review Cycle

This schedule must be reviewed annually by the DPO (once appointed) and updated whenever a new data type is introduced or a regulatory change affects retention requirements.
