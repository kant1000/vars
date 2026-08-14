# App Store & Play Store Submission Tracker

> Source of truth for all app store registration, submission, and launch activity.
> Update this file each time a status changes. Do not record locked product decisions here, those live in `docs/VARS_PROJECT_CONTEXT.md`.

---

## Current Status (Updated: 3 August 2026)

| Platform | Status | Target |
|---|---|---|
| D-U-N-S | COMPLETE | Done |
| Apple Developer Account | Payment charged 12 Aug 2026. Apple Support (Roshitha, case/enrollment ref B278PWKRGN) confirmed via email the same day that membership status is "Active." developer.apple.com/account portal still shows "Varsapp Limited (Pending)" and prompts to complete the purchase, a known Apple-side backend sync bug. Do NOT repurchase. Follow-up sent on the same thread requesting manual sync. | Awaiting Apple-side sync |
| Google Play Console | COMPLETE | Done |
| App Store listing | Not started | Early Aug (was: late Aug) |
| Play Store listing | IN PROGRESS | Early-mid Aug (was: early Sep) |
| NDPC registration | **COMPLETE** — Certificate issued, Registration ID NDPC/DCP/13824 | Done |
| Privacy policy (live URL) | Exists at /privacy | NDPA audit complete, DPO appointed |

---

## Timeline (Revised 14 August 2026)

Original targets were based on the Android build being a major unknown; Claude Code resolved that in a single session on 25 July. NDPC registration, the last open compliance dependency, completed 3 August. Since then: Apple Developer Support confirmed the account is Active (12 Aug), but the developer.apple.com portal hasn't synced to reflect it, so iOS submission remains blocked with no confirmed date. Separately, the business timeline has been clarified: September 2026 is vendor conversion (onboarding the pipeline), with 1 October 2026 as the real customer go-live date (Both Sides Open) — both stores need to be live before then. Dates below are indicative targets, not commitments.

| Milestone | Original | Revised |
|---|---|---|
| Android done | Early Aug | DONE, 25 Jul |
| NDPC registration | TBC | DONE, 3 Aug |
| iOS build ready | Mid Aug | Blocked — awaiting Apple portal sync, no ETA |
| Compliance + assets done | Mid Aug | Early Aug |
| App Store submission | Late Aug | Blocked — awaiting Apple portal sync; needs to resolve ahead of the 1 Oct customer go-live |
| App Store live | End of Aug | Target: before 1 Oct 2026 (Both Sides Open) — blocked on Apple portal sync |
| Play Store submission | Early Sep | September 2026 — AAB + screenshots not yet uploaded |
| Play Store live | Mid Sep | Target: before 1 Oct 2026 (Both Sides Open) |
| Customer marketing live | Aug (roadmap) | 1 October 2026 (Both Sides Open) |

The single remaining external dependency is the Apple developer portal syncing to the Active status Apple Support already confirmed by email — no ETA from Apple on when that resolves. Once it does, the iOS EAS cloud build takes hours, no local Xcode required.

---

## D-U-N-S Registration

| Field | Detail |
|---|---|
| Status | COMPLETE |
| D-U-N-S Number | 352294670 |
| Tracking ID | 10620797 |
| Case Number | 10683294 |
| Submitted | 20 July 2026 |
| Provider | Dun & Bradstreet SAME Ltd (Dubai) |
| Contact | Puja P, dxbgird@dnbsame.com |

---

## Apple App Store

| Field | Detail |
|---|---|
| Status | Payment charged 12 Aug 2026. Apple Support (Roshitha, case/enrollment ref B278PWKRGN) confirmed via email the same day that membership status is "Active." developer.apple.com/account portal still shows "Varsapp Limited (Pending)" and prompts to complete the purchase — a known Apple-side backend sync bug. Do NOT repurchase. |
| Account type | Organisation |
| D-U-N-S used | 352294670 |
| $99 fee | Charged 12 Aug 2026 on the founder's side. Not yet reflected in the portal, but Apple Support has confirmed by email that the account is Active — do not repurchase |
| SDK requirement | Xcode 26 / iOS 26 SDK (EAS cloud build, no local Xcode needed) |
| Review timeline | 3 to 7 days first submission |
| Target submission | Before 1 Oct 2026 customer go-live — blocked on Apple portal sync, no ETA |
| Target live | Before 1 Oct 2026 (Both Sides Open) — blocked on Apple portal sync, no ETA |

**Next step:** Apple Support already confirmed Active status (case B278PWKRGN) via email 12 Aug; a follow-up was sent on the same thread requesting manual account sync. Do NOT repurchase or re-enroll while waiting. Once the portal reflects Active, run `eas build --platform ios --profile production` from repo root, no Mac or local Xcode required. Complete Apple Privacy label in App Store Connect once account is fully active.

---

## Google Play Console

| Field | Detail |
|---|---|
| Status | COMPLETE, awaiting AAB upload + screenshots |
| Account type | Organisation |
| D-U-N-S used | 352294670 |
| Package name | com.vars.app (permanent, cannot change after first AAB upload) |
| API level | Android 16 (API 36), DONE via expo-build-properties plugin |
| App format | AAB (Android App Bundle) |
| App content declarations | 10/10 complete, "You're all caught up" confirmed |
| Data Safety form | COMPLETE |
| Review timeline | 5 to 7 days first submission |
| Target submission | First week of August 2026 |
| Target live | Aug 10 to 17 2026 |

**Next step:** Upload screenshots + AAB. Run `eas build --platform android --profile production` from repo root, download AAB from EAS dashboard, upload under Test and release.

---

## Company Details (Verified from CAC)

| Field | Detail |
|---|---|
| Legal name | VARSAPP LIMITED |
| CAC Registration No. | 9562403 |
| TIN | 2622404342718 |
| Date of registration | 20 May 2026 |
| Legal structure | Private Company Limited by Shares |
| Registered address | 119 LSDPC Estate, Phase III, Ogba, Lagos State, Nigeria |
| Employees | 3 |
| Authorized capital | ₦1,000,000 |
| Bank | Premium Trust Bank, Victoria Island |
| Sole shareholder | Ibitoye Oluwaseyi (100% direct) |
| Director | Ibitoye Oluwaseyi Emmanuel |
| Director phone | +2349021561493 |
| Registration body | Corporate Affairs Commission (CAC), Nigeria |
| CAC status | ACTIVE |

---

## NDPC Registration (New)

| Field | Detail |
|---|---|
| Status | COMPLETE |
| Registration ID | NDPC/DCP/13824 |
| Registered entity | VARSAPP LIMITED |
| Classification | Data Controller/Processor of Major Importance, Section 44, Nigeria Data Protection Act 2023 |
| Certificate issued | 3 August 2026 |
| Certificate location | Google Drive, compliance/government |
| Verification | Certificate content checked against known registration certificate format (registration ID, entity name matching CAC-registered "VARSAPP LIMITED", statutory citation, authorized signature, dated 3 Aug 2026). No independent NDPC public registry lookup was performed, that would need a manual check against NDPC's own portal or a call to the DPO/lawyer of record if further assurance is needed. |

### What "Major Importance" classification means

Being registered as a data controller/processor **of major importance** (not the lower "general" tier) puts VARS under the stricter NDPA obligations. This is expected given VARS's scale of processing (biometric KYC data, continuous location tracking, marketplace scale). Implications:

- **Mandatory DPO** — already satisfied, DPO appointed per `internal-data-protection-policy.docx`.
- **DPIA obligation** — already satisfied, `dpia.docx` covers KYC biometrics, location tracking, cross-border transfer, and profiling.
- **ROPA maintenance** — already satisfied, `ropa.docx` exists and must be kept current as processing activities change.
- **Annual compliance audit filing with NDPC** — new ongoing obligation. Major-importance controllers must file periodic compliance audit reports (typically annual). No filing scheduled yet, flag to DPO/lawyer for a filing calendar.
- **72-hour breach notification to NDPC** — already covered procedurally in `breach-response-runbook.docx`, now formally binding since registration is complete.
- **Cross-border transfer scrutiny** — major-importance status means NDPC may scrutinise the Supabase/Youverify/Paystack cross-border transfers more closely. DPAs with each processor should be finalised (currently `dpa-template.docx` is still in draft/lawyer-review).
- **Registration renewal** — NDPC registrations are not one-time; confirm renewal cadence with the lawyer (annual renewal is typical under comparable regimes).

### Net effect on submission timeline

This removes the last outstanding legal/compliance blocker referenced in the "Legal & Compliance" table below. Both app stores' privacy questionnaires (Apple Privacy label, Google Data Safety) can now truthfully state VARS is a registered data controller in its operating jurisdiction, which is a plus for review credibility though not a strict App Review requirement.

---

## Technical Blockers (Must clear before submission)

| Blocker | Platform | Status | Notes |
|---|---|---|---|
| Android native build failure | Android | RESOLVED | Was a `npx expo` module-resolution bug in Yarn workspaces (doubled `node_modules` path). Fixed by invoking `yarn workspace @vars/mobile android` from repo root. Verified: BUILD SUCCESSFUL (42m50s), installed and ran on a physical Galaxy A40 |
| iOS Xcode 26 / iOS 26 SDK build | iOS | PENDING APPLE VERIFICATION | No local Xcode needed. Path: `eas build --platform ios` via EAS cloud once Apple Developer account activates. `ios/` folder has never been generated, EAS handles this entirely in the cloud |
| Android API 36 target | Android | RESOLVED | `compileSdkVersion`/`targetSdkVersion` set to 36 via `expo-build-properties` plugin in `apps/mobile/app.config.js`, not a direct `android/build.gradle` edit (that folder is gitignored and regenerated on every prebuild, so direct edits don't persist). Verified: compiles clean |
| Duplicate Expo dependency | Tooling | RESOLVED | Removed duplicate `expo` declaration from root `package.json`. Now declared only in `apps/mobile/package.json` |
| EAS CLI outdated | Tooling | RESOLVED | Upgraded globally: 18.5.0 to 21.2.0 |
| On-device icon rendering QA | Android done, iOS pending | PARTIAL | Material Icons confirmed correct on Galaxy A40. SF Symbols unverifiable until iOS build is live |
| Light/dark theme walkthrough | Android done, iOS pending | PARTIAL | Full pass on Galaxy A40, zero fails. iOS pending |
| Developer portal shows Pending despite support confirming Active | iOS/Account | AWAITING APPLE SYNC | Payment posted, support confirmed active (case/enrollment ID B278PWKRGN), portal not yet reflecting it, follow-up sent same thread, do not pay again |

---

## Store Assets

| Asset | iOS | Android | Status | Notes |
|---|---|---|---|---|
| App icon | 1024x1024px | 512x512px | Not started | VARS scissors mark, source exists |
| Screenshots | 1320x2868px (6.9" iPhone) | 320 to 3840px range | Android ready to capture | Real UI only, mockups flagged by reviewers. Capture on Galaxy A40 |
| Feature graphic | — | 1024x500px | Not started | Android only |
| App name | VARS | VARS | DONE | In store-copy.md |
| Subtitle | Your stylist, at your door. | N/A | DONE | iOS only, 27 chars |
| Short description | N/A | Max 80 chars | DONE | Android only, 78 chars. In store-copy.md |
| Full description | Max 4,000 chars | Max 4,000 chars | DONE | 1,464 chars. In store-copy.md |
| Keywords | Max 100 chars | N/A | DONE | iOS only, 90 chars. In store-copy.md |
| Privacy policy URL | Required | Required | EXISTS | bookwithvars.com/privacy, needs NDPA audit |
| Support URL | Required | Required | DONE | hello@bookwithvars.com |
| App Review notes | Required | Required | DONE | In store-copy.md, insert test credentials before submitting |

---

## Legal & Compliance

| Item | Status | Notes |
|---|---|---|
| Privacy policy | EXISTS, /privacy | Needs NDPA audit before submission |
| NDPC registration | **COMPLETE** | Registration ID NDPC/DCP/13824, certificate dated 3 Aug 2026. See NDPC Registration section above for ongoing obligations (annual audit filing, breach notification, renewal cadence to confirm) |
| Data Safety form (Google) | COMPLETE | Filed 25 Jul 2026 |
| Apple Privacy label | NOT STARTED | Complete in App Store Connect once account activates, must match Google Data Safety |
| Age rating (IARC) | COMPLETE | Filed via Play Console |
| Apple age rating | NOT STARTED | Complete in App Store Connect |
| Account deletion flow | EXISTS, /delete-account | Required by Google, already built |

---

## Locked Decisions

| Decision | Detail |
|---|---|
| Payments | Paystack is REQUIRED for physical services. No IAP on either platform. Both stores mandate external processors for real-world services. Apple Guideline 3.1.3(e) explicitly requires this. Include in App Review notes at submission. |
| Director title | Use "Director" (current CAC-registered status). "Chairman of the Board" advised by lawyer but not yet effected in CAC, do not use until legally confirmed. |
| Account email | Personal email for both App Store and Play Store. Anchors to founder across multiple future projects. |
| Package name | com.vars.app, permanent from first AAB upload. Never change. |
| iOS build method | EAS cloud build only (`eas build --platform ios`). No local Xcode. No `ios/` folder to be committed, EAS generates it during cloud build. |
| Android build invocation | Always `yarn workspace @vars/mobile android` from repo root. Never `npx expo run:android`. Never run from `apps/mobile/` directly. |
| API 36 method | Set via `expo-build-properties` plugin in `apps/mobile/app.config.js`, not in `android/build.gradle` directly, as that folder is gitignored and regenerated |

---

## Submission Checklist

### Before submitting to either store
- [x] Android native build fixed and compiling
- [ ] iOS EAS cloud build, pending Apple Developer verification
- [x] Android targeting API 36
- [x] Android on-device QA pass (icons, dark mode, all screens), Galaxy A40, zero fails
- [ ] iOS on-device QA pass, pending iOS build
- [x] Apple Developer account enrolled, $99 paid, Apple Support confirmed membership Active (case B278PWKRGN); portal sync still pending — see Technical Blockers
- [x] Google Play org account registered
- [x] Privacy policy audited for NDPA compliance
- [x] NDPC registration complete, Registration ID NDPC/DCP/13824
- [ ] Screenshots captured (Android ready to capture, iOS pending build)
- [x] Store descriptions written, docs/store-copy.md
- [x] Data Safety form complete (Google)
- [ ] Apple Privacy label complete
- [ ] Age rating questionnaires complete (both stores)
- [ ] Test credentials inserted into App Review notes (docs/store-copy.md)
- [ ] Feature graphic created (Android, 1024x500px)
- [ ] App icon uploaded (1024x1024px iOS, 512x512px Android)

### Apple App Store specific
- [ ] Apple Developer account verified and $99 paid
- [ ] Apple Privacy label complete
- [ ] Build uploaded via EAS (`eas build --platform ios --profile production`)
- [ ] TestFlight internal testing done
- [ ] App Review notes submitted: see docs/store-copy.md

### Google Play specific
- [x] App created, package name com.vars.app
- [x] All 10 content declarations complete
- [x] Data Safety form complete
- [x] Age rating (IARC) questionnaire complete
- [ ] AAB uploaded (not APK)
- [ ] Screenshots uploaded
- [ ] Feature graphic uploaded
- [ ] App Review notes submitted: see docs/store-copy.md

---

## Key files

| File | Purpose |
|---|---|
| `docs/store-submission-tracker.md` | This file, submission status and decisions |
| `docs/store-copy.md` | All store copy, descriptions, keywords, App Review notes for both stores |
| `docs/VARS_PROJECT_CONTEXT.md` | Locked product decisions, brand identity, go-to-market |
| `apps/mobile/app.config.js` | Package name, bundle ID, SDK targets, source of truth for build config |

---

## Log

| Date | Event |
|---|---|
| 12 Aug 2026 | Apple Developer Support (Roshitha) confirmed via email that enrollment B278PWKRGN is "Membership Status: Active." developer.apple.com/account portal still shows Pending and prompts repurchase, known Apple-side sync issue. Follow-up sent requesting manual account sync, no repurchase made. |
| 12 Aug 2026 | Payment for Apple Developer Program charge posted successfully. |
| 8 Aug 2026 | Apple Developer enrollment status regressed: still "Enrollment Pending" 2+ weeks after the 25 Jul "confirming within 48hrs" note, no activation. $99 fee shows charged on the founder's side but has not posted on Apple's side. Corrects the stale 25 Jul status line in the Current Status table and Apple App Store section above. |
| 3 Aug 2026 | NDPC Certificate of Registration received. Registration ID NDPC/DCP/13824. VARSAPP LIMITED registered as Data Controller/Processor of Major Importance under Section 44, NDPA 2023. Filed under compliance/government in the shared drive. Removes the last open legal/compliance blocker on the tracker. |
| 3 Aug 2026 | NDPA compliance audit complete: fixed ID-document phrasing, retention wording, and DPO status across all app privacy/terms surfaces (web, in-app customer, in-app vendor) and the compliance document set in Google Drive (privacy-policy, customer-terms, vendor-terms, data-retention-schedule, ropa, internal-data-protection-policy, cookie-policy, vendor-sla). DPO appointed (name pending). |
| 25 Jul 2026 | Age rating (IARC) questionnaire completed on Play Console |
| 25 Jul 2026 | NDPC registration contract with lawyer, signing imminent |
| 25 Jul 2026 | Apple Developer account approved, $99 paid, activation expected within 48hrs |
| 25 Jul 2026 | Store copy written for both platforms, docs/store-copy.md |
| 25 Jul 2026 | Google Play app created, package name com.vars.app confirmed from app.config.js |
| 25 Jul 2026 | Google Play app content: all 10 declarations complete, Data Safety filed |
| 25 Jul 2026 | Timeline revised, App Store and Play Store targets moved forward 3 to 4 weeks following successful Android build session |
| 25 Jul 2026 | Mobile build session: fixed Android invocation bug (`npx expo` to `yarn workspace @vars/mobile android`), bumped Android to API 36 via `app.config.js` `expo-build-properties` plugin, removed duplicate root-level `expo` dependency, upgraded EAS CLI 18.5.0 to 21.2.0. BUILD SUCCESSFUL, installed and ran on Galaxy A40. Full on-device QA pass, zero fails |
| 25 Jul 2026 | D-U-N-S number received, 352294670 |
| 25 Jul 2026 | Google Play Console org account verified and complete |
| 25 Jul 2026 | Apple Developer enrolment initiated, awaiting legal authority verification |
| 20 Jul 2026 | D-U-N-S application submitted, Tracking ID 10620797 |
| 20 Jul 2026 | D&B questionnaire completed and returned with CAC certificate attached |
| 20 Jul 2026 | Store submission strategy confirmed: personal email, org accounts on both platforms |
| 3 Jul 2026 | Paystack live keys activated |
