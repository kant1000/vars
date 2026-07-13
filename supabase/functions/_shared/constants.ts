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

// ── Gate payment constants ─────────────────────────────────────

/** How long (minutes) the customer has to complete payment after a failed
 *  charge-auth or a first-time checkout at gate time. */
export const GATE_PAYMENT_RETRY_WINDOW_MINUTES = 10;

/** Vendor-to-customer distance (km) at which the proximity cron fires the gate
 *  automatically, as if the vendor tapped "On My Way". */
export const GATE_PROXIMITY_KM = 1;

/** How many minutes before scheduled_at the "On My Way" gate window opens. */
export const GATE_WINDOW_MINUTES = 120;

// ── Document version constants ─────────────────────────────────
// Mirror of apps/mobile/constants/terms.ts — keep in sync manually.
// Bump a version string to trigger reacceptance on next cold start.
export const DOCUMENT_VERSIONS = {
  customer_terms:        '2026-07-13',
  privacy_policy:        '2026-07-13',
  vendor_terms:          '2026-07-13',
  vendor_privacy_policy: '2026-07-13',
} as const;
