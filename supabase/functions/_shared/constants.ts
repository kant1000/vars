// Mirror of packages/shared/src/constants.ts — keep in sync manually

/** VARS commission on every completed booking (20%) */
export const VARS_COMMISSION_PERCENT = 20;

/** Pioneer programme: first N completed bookings get 100% (no platform cut) */
export const PIONEER_BOOKINGS_THRESHOLD = 3;

/** Taxonomy V2: L1 category values */
export const CATEGORY_L1 = {
  HAIR:   'hair',
  BARBER: 'barber',
  FACE:   'face',
  NAILS:  'nails',
} as const;

/** L2 subcategories grouped by L1 */
export const CATEGORY_L2_MAP: Record<string, string[]> = {
  hair:   ['braids', 'weaves', 'locs', 'natural', 'relaxed'],
  barber: ['cuts', 'shaves', 'beard', 'colour'],
  face:   ['makeup', 'skincare', 'lashes', 'brows'],
  nails:  ['manicure', 'pedicure', 'nail_art'],
};

/** Service constraints */
export const MIN_SERVICE_PRICE_KOBO = 1_000_000;
export const MAX_VENDOR_SERVICES    = 10;
export const SERVICE_NAME_MAX_CHARS = 20;
export const SERVICE_DESC_MAX_CHARS = 60;

export const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  ON_WAY: 'on_way',
  ARRIVED: 'arrived',
  SERVICE_RENDERED: 'service_rendered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  DISPUTED: 'disputed',
  RESCHEDULED_PENDING: 'rescheduled_pending',
} as const;

/** Radius in km within which no transport surcharge applies. */
export const BASE_RADIUS_KM = 5;

/**
 * Distance-based transport surcharge tiers.
 * feeKobo: surcharge added to Paystack charge (kobo).
 * preBufferSlots: 30-min calendar blocks inserted BEFORE booking start.
 * Match: kmOver > tier.minKmOver && kmOver <= tier.maxKmOver
 */
export const TRANSPORT_FEE_TIERS = [
  { minKmOver: 0,  maxKmOver: 3,        feeKobo:   300_000, preBufferSlots: 1 },
  { minKmOver: 3,  maxKmOver: 6,        feeKobo:   500_000, preBufferSlots: 1 },
  { minKmOver: 6,  maxKmOver: 10,       feeKobo:   750_000, preBufferSlots: 2 },
  { minKmOver: 10, maxKmOver: Infinity, feeKobo: 1_000_000, preBufferSlots: 2 },
] as const;

// ── Booking timing constants ───────────────────────────────────

/** How long (minutes) a vendor has to accept/decline a pending booking before it expires. */
export const BOOKING_RESPONSE_WINDOW_MINUTES = 60; // 1 hour

/** How long (hours) after the scheduled service end before payment auto-releases to the vendor. */
export const AUTO_RELEASE_HOURS = 2;

/** How many minutes before the scheduled appointment the customer/vendor phone numbers are revealed. */
export const PHONE_REVEAL_MINUTES_BEFORE = 15;

/** How many minutes before auto-release the customer is warned, so they can raise a dispute in time. */
export const AUTO_RELEASE_WARNING_MINUTES_BEFORE = 30;

// ── Gate payment constants ─────────────────────────────────────

/** How long (minutes) the customer has to complete payment after a failed
 *  charge-auth or a first-time checkout at gate time. */
export const GATE_PAYMENT_RETRY_WINDOW_MINUTES = 10;

/** Vendor-to-customer distance (km) at which the proximity cron fires the gate
 *  automatically, as if the vendor tapped "On My Way". */
export const GATE_PROXIMITY_KM = 1;

/** How many minutes before scheduled_at the "On My Way" gate window opens. */
export const GATE_WINDOW_MINUTES = 120;

/** How old (minutes) vendor_current_lat/lng may be and still be trusted for the
 *  proximity gate. The vendor app only pings while a booking is on_way, so
 *  coordinates persist after a job ends; without this bound a leftover position
 *  from an earlier job could satisfy the proximity check and charge a customer
 *  before the vendor had set off. Comfortably above the app's 60s ping. */
export const VENDOR_LOCATION_MAX_AGE_MINUTES = 10;

// ── Document version constants ─────────────────────────────────
// Mirror of apps/mobile/constants/terms.ts — keep in sync manually.
// Bump a version string to trigger reacceptance on next cold start.
export const DOCUMENT_VERSIONS = {
  customer_terms:        '2026-07-13',
  privacy_policy:        '2026-07-13',
  vendor_terms:          '2026-07-13',
  vendor_privacy_policy: '2026-07-13',
} as const;
