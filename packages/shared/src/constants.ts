// ============================================================
// VARS — Shared Constants
// ============================================================

/** VARS commission on every completed booking (20%) */
export const VARS_COMMISSION_PERCENT = 20;

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

/** Distance filter options (km) */
export const DISTANCE_FILTERS = {
  NEARBY: 2,
  CLOSE: 5,
  ANY: null,
} as const;

/** Cancellation policy tiers (per spec §5) */
export const CANCELLATION_POLICY = {
  TIER_1: {
    label: '0–15 mins after booking',
    fee_percent: 15,
    vars_share: 10,
    vendor_share: 5,
    mins_since_booking_max: 15,
  },
  TIER_2: {
    label: '15 mins – 1 hour after booking',
    fee_percent: 50,
    vars_share: 30,
    vendor_share: 20,
    mins_since_booking_max: 60,
  },
  TIER_3: {
    label: 'Within 1 hour of service time',
    fee_percent: 100,
    vars_share: 30,
    vendor_share: 70,
    non_refundable: true,
  },
} as const;

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
export const SERVICE_NAME_MAX_CHARS = 60;
export const SERVICE_DESC_MAX_CHARS = 200;

/** Vendor badge types */
export const VENDOR_BADGES = {
  VARS_CHOICE: 'vars_choice',
  TOP_RATED: 'top_rated',
  VERIFIED_BY_VARS: 'verified_by_vars',
  NEW_ON_VARS: 'new_on_vars',   // shown when total_reviews === 0
} as const;

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

/** Top Rated badge threshold */
export const TOP_RATED_MIN_REVIEWS = 10;
export const TOP_RATED_MIN_RATING = 4.5;

/** Notification type keys (mirrors spec §9) */
export const NOTIFICATION_TYPES = {
  // User notifications
  PAYMENT_AUTHORIZED:         'payment_authorized',
  VENDOR_ACCEPTS:             'vendor_accepts',
  VENDOR_DECLINES:            'vendor_declines',
  REMINDER_24H:               'reminder_24h',
  REMINDER_1H:                'reminder_1h',
  REMINDER_15MIN:             'reminder_15min',
  VENDOR_ON_WAY:              'vendor_on_way',
  VENDOR_ARRIVED:             'vendor_arrived',
  SERVICE_RENDERED:           'service_rendered',
  AUTO_RELEASE_WARNING:       'auto_release_warning',
  PAYMENT_RELEASED:           'payment_released',
  CANCEL_0_15:                'cancel_0_15',
  CANCEL_15_60:               'cancel_15_60',
  CANCEL_NON_REFUNDABLE:      'cancel_non_refundable',
  // Vendor notifications
  NEW_BOOKING_REQUEST:        'new_booking_request',
  BOOKING_REMINDER_30MIN:     'booking_reminder_30min',
  BOOKING_EXPIRED:            'booking_expired',
  VENDOR_REMINDER_24H:        'vendor_reminder_24h',
  VENDOR_REMINDER_1H:         'vendor_reminder_1h',
  VENDOR_REMINDER_15MIN:      'vendor_reminder_15min',
  VENDOR_PAYMENT_RELEASED:    'vendor_payment_released',
  USER_CANCELLED_WITH_FEE:    'user_cancelled_with_fee',
  NEW_REVIEW:                 'new_review',
  VERIFICATION_APPROVED:      'verification_approved',
  VERIFICATION_FAILED:        'verification_failed',
} as const;
