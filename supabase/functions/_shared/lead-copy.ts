// ============================================================
// VARS — Lead onboarding copy
// All vendor-facing messaging for the pre-onboarding sequence.
// Edit here to change what leads receive without touching logic.
// ============================================================

export type ServiceType = 'hair_styling' | 'barbing' | 'makeovers' | 'other';

const SERVICE_LABEL: Record<ServiceType, string> = {
  hair_styling: 'hair styling',
  barbing:      'barbering',
  makeovers:    'makeovers',
  other:        'beauty services',
};

// One-line hook per category, used in email subject + body opener
const SERVICE_HOOK: Record<ServiceType, string> = {
  hair_styling: 'Lagos women are booking hair stylists at home every week.',
  barbing:      'Lagos men want barbers who come to them — not the other way around.',
  makeovers:    'Makeup artists on VARS earn from bookings while their clients come to them.',
  other:        'VARS connects home service beauty professionals with Lagos customers who pay upfront.',
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
 * Day 0 — sent immediately when a lead registers.
 * Warm intro, pioneer program, value prop, single CTA.
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
    : `${firstName}, VARS is looking for ${label} professionals`;

  return {
    subject,
    text: `Hi ${firstName},

${hook}

You signed up to offer ${label} on VARS. Here's what that means:

${earningsLine}${urgencyLine}

You keep your existing clients. VARS adds new ones on top — customers who book and pay upfront online, so you show up and do the work.

Verification (KYC) takes 2–3 minutes. It works the same way banks verify identity. Once you're verified, your profile goes live and you start showing up in customer searches.

Complete your profile here:
https://vars.app/activate

Questions? Reply to this email — we read every one.

— The VARS Team`,
  };
}

/**
 * Day 3 — sent if the lead hasn't completed their profile.
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
    subject: `Still thinking, ${firstName}? Here's what other ${label} vendors asked`,
    text: `Hi ${firstName},

You signed up to offer ${label} on VARS but haven't completed your profile. That's okay. Here are the questions most vendors had before they did.

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
 * WhatsApp intro — first contact, 24h after signup.
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

  return `Hi ${firstName}! You signed up to offer ${label} on VARS. ${earningNote} Complete your profile to go live: https://vars.app/activate`;
}

/**
 * WhatsApp reengagement — sent to COLD leads, 7 days after last outreach.
 */
export function whatsappReengagement(
  fullName: string,
  serviceType: string,
  isPioneer: boolean,
): string {
  const firstName = getFirstName(fullName);
  const label     = serviceLabel(serviceType);

  if (isPioneer) {
    return `${firstName}, your Pioneer spot on VARS as a ${label} professional is still reserved. First 3 bookings are 0% commission — that means the full ₦20k on a ₦20k booking. Still thinking? https://vars.app/activate`;
  }
  return `${firstName}, ${label} professionals on VARS keep ₦16k on a ₦20k booking. No middleman, just your skills and your schedule. Still open to it? https://vars.app/activate`;
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
