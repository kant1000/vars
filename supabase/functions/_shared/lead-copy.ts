// ============================================================
// VARS — Lead onboarding copy
// All vendor-facing messaging for the pre-onboarding sequence.
// Edit here to change what leads receive without touching logic.
// ============================================================

export type ServiceType = 'hair_styling' | 'barbing' | 'makeovers' | 'other';

// Launch month used in all outreach copy — set LAUNCH_MONTH in Supabase secrets to change
// without a redeploy. Defaults to 'October', matching "Both Sides Open" (customer
// launch) on the roadmap (apps/landing/src/app/roadmap/data/milestones.ts) — update
// this default if that date ever slips.
const LAUNCH_MONTH = Deno.env.get('LAUNCH_MONTH') ?? 'October';

const SERVICE_LABEL: Record<ServiceType, string> = {
  hair_styling: 'hair styling',
  barbing:      'barbering',
  makeovers:    'makeovers',
  other:        'beauty services',
};

// Occupation-noun form — reads naturally after "a", unlike SERVICE_LABEL
// (e.g. "a hair stylist", not "a hair styling").
const PROFESSION_LABEL: Record<ServiceType, string> = {
  hair_styling: 'hair stylist',
  barbing:      'barber',
  makeovers:    'makeup artist',
  other:        'beauty professional',
};

// One-line hook per category, used in email subject + body opener
const SERVICE_HOOK: Record<ServiceType, string> = {
  hair_styling: `VARS launches to customers in Lagos this ${LAUNCH_MONTH}, the first platform where clients book hair stylists directly to their home.`,
  barbing:      `VARS launches to customers in Lagos this ${LAUNCH_MONTH}, bringing barbers directly to clients who book and pay online.`,
  makeovers:    `VARS launches in Lagos this ${LAUNCH_MONTH}, where makeup artists come to clients who book and pay upfront.`,
  other:        `VARS launches in Lagos this ${LAUNCH_MONTH}, connecting home service beauty professionals with clients who book and pay online.`,
};

export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function serviceLabel(serviceType: string): string {
  return SERVICE_LABEL[serviceType as ServiceType] ?? 'beauty services';
}

function professionLabel(serviceType: string): string {
  return PROFESSION_LABEL[serviceType as ServiceType] ?? 'beauty professional';
}

function serviceHook(serviceType: string): string {
  return SERVICE_HOOK[serviceType as ServiceType] ?? SERVICE_HOOK.other;
}

// ── Email templates ───────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  text: string;
}

/**
 * Day 0 — queued immediately when a lead registers (auto-approved).
 * Warm intro, pioneer programme, value prop, single CTA.
 */
export function welcomeEmail(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
  spotsRemaining: number,
): EmailTemplate {
  const firstName  = getFirstName(fullName);
  const label      = serviceLabel(serviceType);
  const hook       = serviceHook(serviceType);

  const earningsLine = isPioneer
    ? `You've secured a Pioneer spot. Your first 3 bookings on VARS are 0% commission, you keep 100% of what you earn to start. After that, you keep 80% of every booking.`
    : `You keep 80% of every booking. On a ₦20,000 service, that's ₦16,000 straight to you.`;

  const urgencyLine = isPioneer && spotsRemaining <= 10 && spotsRemaining > 0
    ? `\nOnly ${spotsRemaining} Pioneer spot${spotsRemaining === 1 ? '' : 's'} left. Yours is confirmed.`
    : '';

  const subject = isPioneer
    ? `Your Pioneer spot on VARS is confirmed, ${firstName}`
    : `${firstName}, get set up on VARS before we open in ${LAUNCH_MONTH}`;

  return {
    subject,
    text: `Hi ${firstName},

${hook}

You signed up to offer ${label} on VARS. Here's what that means:

${earningsLine}${urgencyLine}

You keep your existing clients. When VARS opens in ${LAUNCH_MONTH}, customers will start booking. They pay upfront online, you show up and do the work. Set up now to be live from day one.

Verification (KYC) takes 2–3 minutes. It works the same way banks verify identity. Once you're verified, your profile goes live and you start showing up in customer searches.

Complete your profile here:
https://bookwithvars.com/activate

Questions? Reply to this email, we read every one.

The VARS Team`,
  };
}

// ── WhatsApp HSM templates (Meta-approved, sent once DELIVERY_LIVE is on) ─────
// `name` and `params` order below must match exactly what's approved in the
// 360dialog/Meta template manager — a mismatch causes 360dialog to reject the
// send outright. Update both together if the approved wording ever changes.
// Body skeletons (submit verbatim when requesting HSM approval):
//   vars_vendor_intro:        "Hi {{1}}! You registered to be a {{3}} on VARS.
//     Customer go live is {{2}}. Set up your profile now to be ready from day
//     one. {{4}} Complete your profile: https://bookwithvars.com/activate"
//     params: [firstName, launchMonth, professionLabel, earningsLine]
//   vars_vendor_reengagement: "{{1}}, VARS opens to customers in {{2}}. Set up
//     your {{3}} profile. {{4}} Complete your profile: https://bookwithvars.com/activate"
//     params: [firstName, launchMonth, serviceLabel, highlightLine]
//   vars_vendor_golive:       "Congrats {{1}}! You're verified on VARS. Your
//     profile is live. Make sure you're online on the app to start accepting
//     bookings." — single variable, no pioneer/earnings mention on this one
//     (dropped deliberately — user's call).
//     params: [firstName]
// `bookwithvars.com` (not vars.app, which isn't a real hosted domain anywhere
// in this repo) — /activate is a new route the user is adding on that domain,
// not live yet as of this edit. Go-live has no link, so no page needed there.

export interface WhatsAppTemplate {
  name:   string;
  params: string[];
}

/** WhatsApp intro — first phone contact, 24h after sign-up (PROSPECT state). */
export function whatsappIntroTemplate(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): WhatsAppTemplate {
  const firstName = getFirstName(fullName);
  const profession = professionLabel(serviceType);
  const earnings   = isPioneer
    ? 'Your Pioneer spot is confirmed. First 3 bookings are 0% commission.'
    : 'You keep 80% of every booking.';

  return {
    name:   'vars_vendor_intro',
    params: [firstName, LAUNCH_MONTH, profession, earnings],
  };
}

/** WhatsApp reengagement — sent to COLD leads, 7+ days after last phone outreach. */
export function whatsappReengagementTemplate(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): WhatsAppTemplate {
  const firstName = getFirstName(fullName);
  const label      = serviceLabel(serviceType);
  const highlight  = isPioneer
    ? 'Your Pioneer spot is still reserved. First 3 bookings: 0% commission.'
    : 'Vendors who set up now will be first in customer searches. Takes 5 minutes.';

  return {
    name:   'vars_vendor_reengagement',
    params: [firstName, LAUNCH_MONTH, label, highlight],
  };
}

/** WhatsApp go-live — sent when a lead completes KYC and is verified.
 *  Also reused directly by vendor-kyc-webhook for the instant, authoritative
 *  "verified" WhatsApp send — the lead-nurture pipeline's own go-live
 *  generation in vendor_lead_tick() was retired as dead code (a lead's
 *  `converted` flag is already true by the time KYC can complete, so it
 *  could never satisfy the tick's VERIFIED transition condition). */
export function whatsappGoLiveTemplate(fullName: string): WhatsAppTemplate {
  const firstName = getFirstName(fullName);

  return {
    name:   'vars_vendor_golive',
    params: [firstName],
  };
}

/** WhatsApp KYC rejected — sent by vendor-kyc-webhook when Youverify fails a vendor.
 *  Body skeleton (submit to Meta verbatim, category Utility):
 *    "Hi {{1}}, we couldn't verify your details on VARS. {{2}} Retry from
 *    the app, it takes 2 minutes to get verified and go live."
 *  params: [firstName, reason] */
export function whatsappKycRejectedTemplate(fullName: string, reason: string): WhatsAppTemplate {
  const firstName = getFirstName(fullName);

  return {
    name:   'vars_vendor_kyc_rejected',
    params: [firstName, reason],
  };
}

// ── HTML email template parts ─────────────────────────────────────────────────
// Structured body copy for the HTML template used by deliver-outreach.
// Keeps copy in one place; deliver-outreach imports these — never raw strings.

export interface HtmlEmailParts {
  heading: string;
  body1:   string;
  body2:   string;
}

export function welcomeEmailHtmlParts(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
  spotsRemaining: number,
): HtmlEmailParts {
  const firstName = getFirstName(fullName);
  const label     = serviceLabel(serviceType);
  const hook      = serviceHook(serviceType);

  const earningsLine = isPioneer
    ? `You've secured a Pioneer spot. Your first 3 bookings on VARS are 0% commission, you keep 100% of what you earn to start. After that, you keep 80% of every booking.`
    : `You keep 80% of every booking. On a ₦20,000 service, that's ₦16,000 straight to you.`;

  const urgencyClause = isPioneer && spotsRemaining <= 10 && spotsRemaining > 0
    ? ` Only ${spotsRemaining} Pioneer spot${spotsRemaining === 1 ? '' : 's'} left. Yours is confirmed.`
    : '';

  const heading = isPioneer
    ? `Your Pioneer spot on VARS is confirmed, ${firstName}`
    : `${firstName}, get set up before VARS opens in ${LAUNCH_MONTH}`;

  return {
    heading,
    body1: `${hook} You signed up to offer ${label} on VARS. ${earningsLine}${urgencyClause}`,
    body2: `You keep your existing clients. When we open in ${LAUNCH_MONTH}, customers will start booking. They pay upfront online, you show up and do the work. Set up now to be live from day one.`,
  };
}

export function reengagementEmailHtmlParts(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): HtmlEmailParts {
  const firstName = getFirstName(fullName);
  const label     = serviceLabel(serviceType);

  const pioneerLine = isPioneer
    ? `Your Pioneer spot is still reserved. First 3 bookings: 0% commission, you keep 100%.`
    : `You keep 80% per booking: ₦16,000 on a ₦20,000 service.`;

  return {
    heading: `Still thinking, ${firstName}? We open in ${LAUNCH_MONTH}, here's what you need to know`,
    body1:   `You signed up to offer ${label} on VARS but haven't completed your profile yet. We open to customers in ${LAUNCH_MONTH}, vendors who complete setup now will be live from day one. KYC uses Youverify, the same verification trusted by banks across Nigeria, and takes 2–3 minutes. Customers only book verified vendors, and payment is held by VARS until you confirm the job is done. ${pioneerLine}`,
    body2:   '',
  };
}
