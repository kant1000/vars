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
export type CategoryL1 = 'hair' | 'barber' | 'face' | 'nails';
export type CategoryL2 =
  | 'braids' | 'weaves' | 'locs' | 'natural' | 'relaxed'
  | 'cuts' | 'shaves' | 'beard' | 'colour'
  | 'makeup' | 'skincare' | 'lashes' | 'brows'
  | 'manicure' | 'pedicure' | 'nail_art';
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

// ---- Vendor service (taxonomy V2) ----
export interface VendorService {
  id: string;
  vendorId: string;
  categoryL1: CategoryL1;
  categoryL2: CategoryL2;
  serviceName: string;
  description: string | null;
  priceKobo: number;
  durationBlocks: number;
  isActive: boolean;
  sortOrder: number;
}

// ---- Booking service (join table snapshot) ----
export interface BookingService {
  id: string;
  bookingId: string;
  vendorServiceId: string;
  serviceName: string;
  priceKobo: number;
}

// ---- Booking summary ----
export interface BookingSummary {
  id: string;
  vendorName: string;
  vendorPhotoUrl: string | null;
  serviceName: string;      // compat: single service or service_summary for multi
  serviceSummary: string;   // canonical multi-service display label
  scheduledAt: string;      // ISO timestamp
  priceKobo: number;        // compat mirror of total_amount
  totalAmount: number;      // canonical total (sum of all services + transport)
  durationBlocks: number;
  status: BookingStatus;
  userLocationAddress: string | null;
}

// ---- Notification payload ----
// NOTE: keep in sync with supabase/functions/_shared/notifications.ts — Deno cannot resolve @vars/shared
// The edge-function version adds pushToken (edge-function-only field).
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
