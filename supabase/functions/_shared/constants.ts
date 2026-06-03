// Mirror of packages/shared/src/constants.ts — keep in sync manually

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
