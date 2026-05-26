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
        id: 'payments-escrow',
        title: 'Payments in Escrow',
        period: '2026',
        description:
          'Customer pays upfront. Money sits in escrow. Vendor gets paid automatically once the service is done. Powered by Paystack — no manual release, no admin intervention.',
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
          'Tiered cancellation fees — vendor-initiated cancellations are always a full refund',
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
        period: 'Target: June 2026',
        description:
          '{vendorCount} professionals have already registered their interest. The target is 400 by end of June — verified and ready to go live when the app launches.',
        state: 'active',
        isNow: true,
      },
      {
        id: 'app-store-launch',
        title: 'App Store Launch',
        period: 'July 2026',
        description:
          'VARS goes live on iOS App Store and Google Play. The first month is supply-only: the onboarding funnel converts interested vendors into fully verified, active professionals. No customer marketing yet — this month is about making sure the supply is exceptional before demand arrives.',
        state: 'upcoming',
      },
      {
        id: 'both-sides-open',
        title: 'Both Sides Open',
        period: 'August 2026',
        description:
          'Customer-facing marketing activates. For the first time, both sides of the marketplace are live simultaneously: customers book, vendors deliver. VARS is fully open.',
        state: 'upcoming',
      },
      {
        id: 'platform-health',
        title: 'Platform Health Review',
        period: 'Q3 2026',
        description:
          'A structured audit of booking quality, vendor performance, and platform health — before the year-end push. The goal is to know exactly what\'s working before scaling it.',
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
