export interface TimelineMilestone {
  id: string;
  title: string;
  period: string;
  description: string;
  bulletPoints?: string[];
  state: 'completed' | 'active' | 'upcoming';
  isNow?: boolean;
}

export interface Phase {
  id: string;
  label: string;
  milestones: TimelineMilestone[];
}

export const phases: Phase[] = [
  {
    id: 'supply',
    label: 'Phase 1 — Build the Supply',
    milestones: [
      {
        id: 'core-platform',
        title: 'The Core Platform',
        period: 'Early 2026',
        description:
          'End-to-end booking marketplace: find a vendor, pick a slot, pay securely, track them live. Built and tested before a single vendor was recruited.',
        state: 'completed',
      },
      {
        id: 'payments-subaccount',
        title: 'Secure Payments via Paystack',
        period: '2026',
        description:
          'Customer pays upfront. The stylist\'s share is split directly into their Paystack account at charge time — VARS never holds the full amount. Settlement to their bank is processed once the service is confirmed complete.',
        state: 'completed',
      },
      {
        id: 'identity-verification',
        title: 'Identity Verification for Every Vendor',
        period: '2026',
        description:
          'Every vendor on VARS completes a full identity check before going live. Integrated with Youverify — a clean pass activates them instantly. No verified ID, no profile.',
        state: 'completed',
      },
      {
        id: 'platform-trust',
        title: 'A Platform Built for Trust',
        period: '2026',
        description: 'The features that make both sides feel safe:',
        bulletPoints: [
          'Phone numbers only shared 15 minutes before the appointment',
          'Binary cancel model — free before the stylist sets off, locked post-gate; stylist-initiated cancellations are always a full refund',
          'Dispute system: payment freezes immediately, VARS resolves',
          'Vendor portfolio photos require customer approval before publishing',
        ],
        state: 'completed',
      },
      {
        id: 'pioneers',
        title: 'VARS Pioneers — 50 Vendors, Lagos',
        period: 'May 2026',
        description:
          'The founding cohort. Fifty barbers, hair stylists, and makeup artists recruited personally across Lagos. Pioneers carry a permanent badge and kept 100% of revenue on their first three bookings. The cohort is complete and closed.',
        state: 'completed',
      },
    ],
  },
  {
    id: 'market',
    label: 'Phase 2 — Open the Market',
    milestones: [
      {
        id: 'vendor-pipeline',
        title: '400 Vendors in the Pipeline',
        period: 'June 2026',
        description:
          '{vendorCount} professionals registered their interest ahead of launch. The pipeline is built — onboarding is now active.',
        state: 'completed',
      },
      {
        id: 'app-store-launch',
        title: 'App Store Launch',
        period: 'End of July 2026',
        description:
          'VARS lands on iOS App Store and Google Play. The app is live — but this month is about shipping, not selling. No customer marketing until the supply is ready.',
        state: 'active',
        isNow: true,
      },
      {
        id: 'vendor-onboarding-month',
        title: 'Vendor Onboarding',
        period: 'August 2026',
        description:
          'The app is live. August is dedicated to converting the pipeline into active, verified stylists. Every professional goes through identity verification, bank setup, and portfolio review before customers arrive.',
        state: 'upcoming',
      },
      {
        id: 'both-sides-open',
        title: 'Both Sides Open',
        period: 'End of September 2026',
        description:
          'Customer-facing marketing activates. For the first time, both sides of the marketplace are live simultaneously: customers book, stylists deliver. VARS is fully open.',
        state: 'upcoming',
      },
      {
        id: 'platform-health',
        title: 'Platform Health Review',
        period: 'Q4 2026',
        description:
          'A structured audit of booking quality, stylist performance, and platform health — before the year-end push. The goal is to know exactly what\'s working before scaling it.',
        state: 'upcoming',
      },
      {
        id: 'year-end',
        title: 'Year-End',
        period: 'November — December 2026',
        description: 'Lagos at its best. VARS positioned and ready.',
        state: 'upcoming',
      },
      {
        id: 'thousand-bookings',
        title: '1,000 Completed Bookings',
        period: 'End 2026',
        description:
          'The Year 1 milestone. Not installs. Not sign-ups. Completed sessions — paid out, rated, done. One thousand.',
        state: 'upcoming',
      },
    ],
  },
  {
    id: 'beyond',
    label: 'Beyond',
    milestones: [
      {
        id: 'vars-points',
        title: 'VARS Points',
        period: '2027',
        description:
          'Every booking earns points. Customers earn from what they spend. Vendors earn from what they deliver. More on what they unlock: coming.',
        state: 'upcoming',
      },
    ],
  },
];
