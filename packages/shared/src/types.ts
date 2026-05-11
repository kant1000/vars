// ============================================================
// VARS — Shared TypeScript Types
// These mirror the DB schema and are used across mobile + admin
// Run `yarn db:types` to regenerate database.types.ts from Supabase
// ============================================================

export type KycStatus = 'pending' | 'verified' | 'rejected';

export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'on_way'
  | 'arrived'
  | 'service_rendered'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'disputed'
  | 'rescheduled_pending';

export type DisputeStatus = 'open' | 'resolved';
export type DisputeResolution = 'released_to_vendor' | 'refunded_to_user';
export type PayoutStatus = 'pending' | 'success' | 'failed';
export type CategorySlug = 'barbing' | 'hair_styling' | 'makeovers';
export type RecipientType = 'user' | 'vendor';

// ---- Coordinates ----
export interface LatLng {
  latitude: number;
  longitude: number;
}

// ---- Vendor badge display logic ----
export interface VendorBadges {
  varsChoice: boolean;
  topRated: boolean;
  verifiedByVars: boolean;
  newOnVars: boolean;    // true when total_reviews === 0
}

// ---- Cancellation fee result ----
export interface CancellationFeeResult {
  feePercent: number;
  varsSharePercent: number;
  vendorSharePercent: number;
  refundPercent: number;
  feeAmountKobo: number;
  refundAmountKobo: number;
  varsAmountKobo: number;
  vendorAmountKobo: number;
}

// ---- Vendor card (home feed) ----
export interface VendorCard {
  id: string;
  username: string;
  fullName: string;
  profilePhotoUrl: string | null;
  distanceKm: number;
  avgRating: number;
  totalReviews: number;
  badges: VendorBadges;
  priceRangeKobo: { min: number; max: number };
  isOnline: boolean;
  isFavourited?: boolean;
}

// ---- Booking summary ----
export interface BookingSummary {
  id: string;
  vendorName: string;
  vendorPhotoUrl: string | null;
  serviceName: string;
  scheduledAt: string;   // ISO timestamp
  priceKobo: number;
  durationBlocks: number;
  status: BookingStatus;
  userLocationAddress: string | null;
}

// ---- Notification payload ----
export interface NotificationPayload {
  recipientId: string;
  recipientType: RecipientType;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  bookingId?: string;
}

// ---- Paystack split settlement ----
export interface SettlementSplit {
  vendorAmountKobo: number;
  varsCommissionKobo: number;
  paystackRecipientCode: string;
}
