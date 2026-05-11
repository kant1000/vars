// ============================================================
// VARS — Shared Constants
// ============================================================

/** VARS commission on every completed booking (20%) */
export const VARS_COMMISSION_PERCENT = 20;

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

/** V1 service category slugs */
export const CATEGORY_SLUGS = {
  BARBING: 'barbing',
  HAIR_STYLING: 'hair_styling',
  MAKEOVERS: 'makeovers',
} as const;

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
