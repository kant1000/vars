// ============================================================
// VARS — Customer Care content
// Single source of truth for the Customer Care bubble grid on both
// the customer and vendor sides. Each entry is shown only to the
// audiences it's tagged for. Body copy follows Copy Voice & Tone
// (README.md): forward-momentum framing, no passive blame, no
// deficit labels, no em-dashes.
// ============================================================

export type CustomerCareAudience = 'customer' | 'vendor';

export interface CustomerCareEntry {
  id: string;
  title: string;
  body: string;
  audiences: CustomerCareAudience[];
}

export const CUSTOMER_CARE_CONTENT: CustomerCareEntry[] = [
  // ── Customer ──────────────────────────────────────────────
  {
    id: 'how-booking-works',
    title: 'How booking works',
    body: 'Pick a service, choose a time, and confirm. Your stylist has one hour to accept. No charge until they do.',
    audiences: ['customer'],
  },
  {
    id: 'payment-timing',
    title: "When you're charged",
    body: "Nothing is taken when you book. Your card is charged the moment your stylist sets off to you.",
    audiences: ['customer'],
  },
  {
    id: 'vendor-late-or-no-show',
    title: 'If your stylist is running late',
    body: "Track them live once they're on the way. If something's wrong, raise a dispute from the booking screen and our team steps in.",
    audiences: ['customer'],
  },
  {
    id: 'how-to-cancel-customer',
    title: 'Cancelling a booking',
    body: "Free any time before your stylist sets off. Once they're on the way, use Raise a dispute instead.",
    audiences: ['customer'],
  },
  {
    id: 'live-tracking',
    title: 'Live tracking',
    body: 'Your stylist’s location shares automatically once they tap On My Way, until the service is done.',
    audiences: ['customer'],
  },
  {
    id: 'phone-reveal',
    title: 'Phone numbers',
    body: 'Your number and your stylist’s share automatically 15 minutes before the appointment, so you can coordinate access.',
    audiences: ['customer'],
  },
  {
    id: 'card-verification',
    title: 'The one-time ₦50 charge',
    body: "First bookings need a quick card check: a non-refundable ₦50 confirms your card works. It's a one-time thing per account.",
    audiences: ['customer'],
  },
  {
    id: 'reviews',
    title: 'Leaving a review',
    body: 'Once your service is marked complete, you can rate your stylist and leave a review from the booking screen.',
    audiences: ['customer'],
  },

  // ── Vendor ────────────────────────────────────────────────
  {
    id: 'getting-started-kyc',
    title: 'Getting started and KYC',
    body: 'Complete your profile, add at least one service, and pass identity verification through Youverify. VARS never stores your raw ID, only the verification result.',
    audiences: ['vendor'],
  },
  {
    id: 'going-online',
    title: 'Going online',
    body: "Toggle online from your Jobs tab once your KYC is verified, you have a service listed, and notifications are on. You'll start receiving bookings right away.",
    audiences: ['vendor'],
  },
  {
    id: 'accepting-bookings',
    title: 'Accepting bookings',
    body: 'You have one hour to accept a request. No response and it expires automatically, no penalty either way.',
    audiences: ['vendor'],
  },
  {
    id: 'auto-accept-zones',
    title: 'Auto-accept zones',
    body: 'Set a zone where matching bookings confirm instantly, no manual review. You get a 5-minute grace window to cancel penalty-free if you need to.',
    audiences: ['vendor'],
  },
  {
    id: 'earnings-and-payout',
    title: "Earnings and when you're paid",
    body: 'You keep 80% of every booking, paid out once the service is confirmed complete: either the customer confirms, or 2 hours pass automatically. Pioneers keep 100% on their first 3 bookings.',
    audiences: ['vendor'],
  },
  {
    id: 'pioneer-programme',
    title: 'The Pioneer Programme',
    body: 'The first 50 verified stylists keep 100% of their first 3 bookings, permanently locked in. After that, the standard 80/20 split applies.',
    audiences: ['vendor'],
  },
  {
    id: 'cancellations-and-penalties',
    title: 'Cancelling a booking',
    body: 'Cancelling an auto-accepted booking within its grace window is penalty-free. Outside that, cancellations are tracked on your record.',
    audiences: ['vendor'],
  },
  {
    id: 'schedule-and-blocking',
    title: 'Your schedule',
    body: "Block off slots you're not available for in 30-minute blocks. Anything you don't block stays open for bookings.",
    audiences: ['vendor'],
  },
  {
    id: 'transport-buffers',
    title: 'Transport buffers',
    body: 'Each booking includes buffer time around it so back-to-back jobs account for your travel, not just the service itself.',
    audiences: ['vendor'],
  },
  {
    id: 'location-handling',
    title: 'How VARS uses your location',
    body: "Your zone centre sets what's nearby for discovery. Once you're online, your live location updates in real time so customers can track you during a job.",
    audiences: ['vendor'],
  },

  // ── Both ──────────────────────────────────────────────────
  {
    id: 'disputes',
    title: 'Raising a dispute',
    body: 'Raise one from the booking screen any time before the 2-hour auto-release window closes. A VARS admin reviews it, usually within 24 hours, and a refund follows if it’s warranted.',
    audiences: ['customer', 'vendor'],
  },
  {
    id: 'vendor-verification',
    title: 'How stylists are verified',
    body: 'Every stylist passes identity and biometric liveness verification through Youverify before they can go live. Their profile photo is the same face that passed verification, by design.',
    audiences: ['customer', 'vendor'],
  },
  {
    id: 'transport-surcharge',
    title: 'Transport surcharge',
    body: 'Bookings more than 5km from a stylist’s zone centre add a ₦3,000 to ₦10,000 surcharge, calculated automatically at booking. No hidden charges beyond that.',
    audiences: ['customer', 'vendor'],
  },
];
