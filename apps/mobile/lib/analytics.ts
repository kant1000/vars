import { usePostHog } from 'posthog-react-native';

export const EVENTS = {
  VENDOR_VIEWED:     'vendor_viewed',
  BOOKING_STARTED:   'booking_started',
  SLOT_SELECTED:     'slot_selected',
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  BOOKING_CANCELLED: 'booking_cancelled',
  VENDOR_TAB_OPENED: 'vendor_tab_opened',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
export { usePostHog };
