// ============================================================
// VARS — Shared Constants
// ============================================================

/** VARS commission on every completed booking (20%) */
export const VARS_COMMISSION_PERCENT = 20;

/** Pioneer programme: first N completed bookings get 100% (no platform cut) */
export const PIONEER_BOOKINGS_THRESHOLD = 3;

/** Radius in km within which no transport surcharge applies. */
export const BASE_RADIUS_KM = 5;

/**
 * Distance-based transport surcharge tiers.
 * feeKobo: surcharge added to Paystack charge (kobo).
 * preBufferSlots: 30-min calendar blocks inserted BEFORE booking start.
 * Match: kmOver > tier.minKmOver && kmOver <= tier.maxKmOver
 * Mirror of supabase/functions/_shared/constants.ts — keep in sync manually.
 */
export const TRANSPORT_FEE_TIERS = [
  { minKmOver: 0,  maxKmOver: 3,        feeKobo:   300_000, preBufferSlots: 1 },
  { minKmOver: 3,  maxKmOver: 6,        feeKobo:   500_000, preBufferSlots: 1 },
  { minKmOver: 6,  maxKmOver: 10,       feeKobo:   750_000, preBufferSlots: 2 },
  { minKmOver: 10, maxKmOver: Infinity, feeKobo: 1_000_000, preBufferSlots: 2 },
] as const;

/** Duration of each scheduling block in minutes */
export const BLOCK_DURATION_MINUTES = 30;

/** Vendor response window for accepting bookings (minutes) */
export const BOOKING_RESPONSE_WINDOW_MINUTES = 60; // 1 hour

/** Auto-release fires this many hours after "Service Rendered" */
export const AUTO_RELEASE_HOURS = 2;

/** Phone numbers revealed this many minutes before appointment */
export const PHONE_REVEAL_MINUTES_BEFORE = 15;

/** 90-minute auto-release warning (30 min before release) */
export const AUTO_RELEASE_WARNING_MINUTES_BEFORE = 30;


/** Taxonomy V2: L1 category values (maps to category_l1_enum in DB) */
export const CATEGORY_L1 = {
  HAIR:   'hair',
  BARBER: 'barber',
  FACE:   'face',
  NAILS:  'nails',
} as const;

/** Display labels for L1 categories */
export const CATEGORY_L1_LABELS: Record<string, string> = {
  hair:   'Hair',
  barber: 'Barber',
  face:   'Face',
  nails:  'Nails',
};

/** L2 subcategories grouped by L1 */
export const CATEGORY_L2_MAP: Record<string, string[]> = {
  hair:   ['braids', 'weaves', 'locs', 'natural', 'relaxed'],
  barber: ['cuts', 'shaves', 'beard', 'colour'],
  face:   ['makeup', 'skincare', 'lashes', 'brows'],
  nails:  ['manicure', 'pedicure', 'nail_art'],
};

/** Display labels for L2 subcategories */
export const CATEGORY_L2_LABELS: Record<string, string> = {
  braids: 'Braids', weaves: 'Weaves', locs: 'Locs', natural: 'Natural', relaxed: 'Relaxed',
  cuts: 'Cuts', shaves: 'Shaves', beard: 'Beard', colour: 'Colour',
  makeup: 'Makeup', skincare: 'Skincare', lashes: 'Lashes', brows: 'Brows',
  manicure: 'Manicure', pedicure: 'Pedicure', nail_art: 'Nail Art',
};

/** Service constraints */
export const MIN_SERVICE_PRICE_KOBO = 1_000_000;  // ₦10,000
export const MAX_VENDOR_SERVICES    = 10;
export const SERVICE_NAME_MAX_CHARS = 20;
export const SERVICE_DESC_MAX_CHARS = 60;

/** Booking status values (mirrors DB enum) */
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

