// Mirror of packages/shared/src/constants.ts — keep in sync manually
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
