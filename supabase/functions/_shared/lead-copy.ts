// ============================================================
// VARS — Lead onboarding copy
// All vendor-facing messaging for the pre-onboarding sequence.
// Edit here to change what leads receive without touching logic.
// ============================================================

export type ServiceType = 'hair_styling' | 'barbing' | 'makeovers' | 'other';

// Launch month used in all outreach copy — set LAUNCH_MONTH in Supabase secrets to change
// without a redeploy (e.g. "September" if the date slips).
const LAUNCH_MONTH = Deno.env.get('LAUNCH_MONTH') ?? 'August';

const SERVICE_LABEL: Record<ServiceType, string> = {
  hair_styling: 'hair styling',
  barbing:      'barbering',
  makeovers:    'makeovers',
  other:        'beauty services',
};

// One-line hook per category, used in email subject + body opener
const SERVICE_HOOK: Record<ServiceType, string> = {
  hair_styling: `VARS launches to customers in Lagos this ${LAUNCH_MONTH} — the first platform where clients book hair stylists directly to their home.`,
  barbing:      `VARS launches to customers in Lagos this ${LAUNCH_MONTH} — bringing barbers directly to clients who book and pay online.`,
  makeovers:    `VARS launches in Lagos this ${LAUNCH_MONTH} — where makeup artists come to clients who book and pay upfront.`,
  other:        `VARS launches in Lagos this ${LAUNCH_MONTH} — connecting home service beauty professionals with clients who book and pay online.`,
};

export function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function serviceLabel(serviceType: string): string {
  return SERVICE_LABEL[serviceType as ServiceType] ?? 'beauty services';
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
    ? `You've secured a Pioneer spot. Your first 3 bookings on VARS are 0% commission — you keep 100% of what you earn to start. After that, you keep 80% of every booking.`
    : `You keep 80% of every booking. On a ₦20,000 service, that's ₦16,000 straight to you.`;

  const urgencyLine = isPioneer && spotsRemaining <= 10 && spotsRemaining > 0
    ? `\nOnly ${spotsRemaining} Pioneer spot${spotsRemaining === 1 ? '' : 's'} left — yours is confirmed.`
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

You keep your existing clients. When VARS opens in ${LAUNCH_MONTH}, customers will start booking — they pay upfront online, you show up and do the work. Set up now to be live from day one.

Verification (KYC) takes 2–3 minutes. It works the same way banks verify identity. Once you're verified, your profile goes live and you start showing up in customer searches.

Complete your profile here:
https://vars.app/activate

Questions? Reply to this email — we read every one.

— The VARS Team`,
  };
}

/**
 * Day 7+ — sent to COLD leads who haven't completed their profile.
 * Addresses the three main objections: KYC safety, real earnings, customer disputes.
 */
export function reengagementEmail(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): EmailTemplate {
  const firstName = getFirstName(fullName);
  const label     = serviceLabel(serviceType);

  const pioneerLine = isPioneer
    ? `Your Pioneer spot is still reserved. First 3 bookings: 0% commission, you keep 100%.`
    : `You keep 80% per booking — ₦16,000 on a ₦20,000 service.`;

  return {
    subject: `Still thinking, ${firstName}? We open in ${LAUNCH_MONTH} — don't miss it`,
    text: `Hi ${firstName},

You signed up to offer ${label} on VARS but haven't completed your profile yet. We open to customers in ${LAUNCH_MONTH} — vendors who complete setup now will be live from day one. Here are the questions most vendors had before they joined.

"Is the KYC safe?"
VARS uses Youverify — the same identity verification trusted by banks and fintechs across Nigeria. We don't store your ID. Youverify confirms you're a real professional and returns a verified badge to your profile. It takes 2–3 minutes.

"Why do customers care if I'm verified?"
Customers on VARS pay upfront. They only book vendors with a verified badge. Without it, your profile isn't visible to them. Verification is your professional credibility on the platform.

"How much do I actually earn?"
${pioneerLine}

"What if a customer disputes or doesn't pay?"
Payment is held by VARS until you confirm the service is done. You're protected from the moment they book. We have your back on disputes.

Complete your profile in 5 minutes:
https://vars.app/activate

If you have questions before you start, just reply here.

— The VARS Team`,
  };
}

// ── WhatsApp templates (short, conversational) ────────────────────────────────
// Pidgin-forward, reads like a message from a person, not a broadcast.

/**
 * WhatsApp intro — first phone contact, 24h after sign-up (PROSPECT state).
 */
export function whatsappIntro(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): string {
  const firstName    = getFirstName(fullName);
  const label        = serviceLabel(serviceType);
  const earningNote  = isPioneer
    ? 'Your Pioneer spot is confirmed — first 3 bookings are 0% commission.'
    : 'You keep 80% of every booking.';

  return `Hi ${firstName}! VARS opens to customers in ${LAUNCH_MONTH} — set up your ${label} profile now to be ready from day one. ${earningNote} Complete your profile: https://vars.app/activate`;
}

/**
 * WhatsApp reengagement — sent to COLD leads, 7+ days after last phone outreach.
 */
export function whatsappReengagement(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): string {
  const firstName = getFirstName(fullName);
  const label     = serviceLabel(serviceType);

  if (isPioneer) {
    return `${firstName}, VARS opens to ${label} customers in ${LAUNCH_MONTH} and your Pioneer spot is still reserved. First 3 bookings: 0% commission. Set up before we go live: https://vars.app/activate`;
  }
  return `${firstName}, VARS opens to ${label} customers in ${LAUNCH_MONTH}. Vendors who set up now will be first in customer searches. Takes 5 minutes: https://vars.app/activate`;
}

/**
 * WhatsApp go-live — sent when a lead completes KYC and is verified.
 */
export function whatsappGoLive(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): string {
  const firstName   = getFirstName(fullName);
  const label       = serviceLabel(serviceType);
  const pioneerNote = isPioneer
    ? ' Your first 3 bookings are 0% commission — you keep everything.'
    : '';

  return `Congrats ${firstName}! You're verified on VARS as a ${label} professional. Your profile is live.${pioneerNote} Start accepting bookings: https://vars.app/go-live`;
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
    ? `You've secured a Pioneer spot. Your first 3 bookings on VARS are 0% commission — you keep 100% of what you earn to start. After that, you keep 80% of every booking.`
    : `You keep 80% of every booking. On a ₦20,000 service, that's ₦16,000 straight to you.`;

  const urgencyClause = isPioneer && spotsRemaining <= 10 && spotsRemaining > 0
    ? ` Only ${spotsRemaining} Pioneer spot${spotsRemaining === 1 ? '' : 's'} left — yours is confirmed.`
    : '';

  const heading = isPioneer
    ? `Your Pioneer spot on VARS is confirmed, ${firstName}`
    : `${firstName}, get set up before VARS opens in ${LAUNCH_MONTH}`;

  return {
    heading,
    body1: `${hook} You signed up to offer ${label} on VARS. ${earningsLine}${urgencyClause}`,
    body2: `You keep your existing clients. When we open in ${LAUNCH_MONTH}, customers will start booking — they pay upfront online, you show up and do the work. Set up now to be live from day one.`,
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
    : `You keep 80% per booking — ₦16,000 on a ₦20,000 service.`;

  return {
    heading: `Still thinking, ${firstName}? We open in ${LAUNCH_MONTH} — here's what you need to know`,
    body1:   `You signed up to offer ${label} on VARS but haven't completed your profile yet. We open to customers in ${LAUNCH_MONTH} — vendors who complete setup now will be live from day one. KYC uses Youverify — the same verification trusted by banks across Nigeria — and takes 2–3 minutes. Customers only book verified vendors, and payment is held by VARS until you confirm the job is done. ${pioneerLine}`,
    body2:   '',
  };
}

export function goLiveEmailHtmlParts(): HtmlEmailParts {
  return {
    heading: "You're live on VARS.",
    body1:   'Your profile is now visible to customers in your area. Bookings will come straight to you.',
    body2:   'Open the app to check your schedule and get ready for your first booking.',
  };
}
