// ============================================================
// VARS — Shared TypeScript Types
// DB enum mirrors used across mobile + admin.
// Run `yarn db:types` to regenerate database.types.ts from Supabase
// ============================================================

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

export type KycStatus = 'pending' | 'verified' | 'rejected';
export type DisputeStatus = 'open' | 'resolved';
export type DisputeResolution = 'released_to_vendor' | 'refunded_to_user';
export type PayoutStatus = 'pending' | 'success' | 'failed';
export type CategoryL1 = 'hair' | 'barber' | 'face' | 'nails';
export type CategoryL2 =
  | 'braids' | 'weaves' | 'locs' | 'natural' | 'relaxed'
  | 'cuts' | 'shaves' | 'beard' | 'colour'
  | 'makeup' | 'skincare' | 'lashes' | 'brows'
  | 'manicure' | 'pedicure' | 'nail_art';
