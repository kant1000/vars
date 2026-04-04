// ============================================================
// VARS — Notification sender
// Sends push (Expo) + logs to in-app inbox simultaneously
// All message copy is from spec §9 VARS brand voice
// ============================================================

import { createAdminClient } from './supabase.ts';

export interface NotificationPayload {
  recipientId: string;
  recipientType: 'user' | 'vendor';
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  bookingId?: string;
  pushToken?: string | null;
}

/**
 * Send a push notification via Expo Push API and log to in-app inbox.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const supabase = createAdminClient();

  // 1. Log to in-app notifications inbox (always)
  await supabase.from('notifications').insert({
    recipient_id: payload.recipientId,
    recipient_type: payload.recipientType,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    booking_id: payload.bookingId ?? null,
    is_read: false,
  });

  // 2. Send push notification via Expo if token exists
  if (payload.pushToken) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: payload.pushToken,
          title: payload.title,
          body: payload.body,
          data: { ...payload.data, bookingId: payload.bookingId },
          sound: 'default',
          priority: 'high',
        }),
      });
    } catch (err) {
      // Push failure must never break business logic
      console.error('Push notification failed:', err);
    }
  }
}

// ============================================================
// VARS BRAND VOICE NOTIFICATION MESSAGES — per spec §9
// ============================================================

export function msg_paymentAuthorized(vendorName: string) {
  return {
    title: 'Booking confirmed',
    body: `You're all set — ${vendorName} has 2 hours to confirm your booking. We'll let you know.`,
  };
}

export function msg_vendorAccepts(vendorName: string, date: string, time: string) {
  return {
    title: 'Booking accepted',
    body: `${vendorName} confirmed your booking. See you on ${date} at ${time}.`,
  };
}

export function msg_vendorDeclines(vendorName: string) {
  return {
    title: 'Vendor unavailable',
    body: `Your vendor couldn't confirm this time. Let's find you another one.`,
  };
}

export function msg_reminder24h(vendorName: string, time: string) {
  return {
    title: 'Tomorrow\'s appointment',
    body: `Tomorrow at ${time}, ${vendorName} is coming to you. Ready?`,
  };
}

export function msg_reminder1h(vendorName: string) {
  return {
    title: 'Coming in an hour',
    body: `${vendorName} is coming in an hour. Your number will be shared with them at the 15-minute mark.`,
  };
}

export function msg_reminder15min(vendorName: string) {
  return {
    title: 'They\'re on their way',
    body: `${vendorName} has your number now. They're on their way.`,
  };
}

export function msg_vendorOnWay(vendorName: string) {
  return {
    title: 'On their way',
    body: `${vendorName} is on their way to you.`,
  };
}

export function msg_vendorArrived(vendorName: string) {
  return {
    title: 'They\'ve arrived',
    body: `${vendorName} has arrived. Time to get fresh.`,
  };
}

export function msg_serviceRendered(vendorName: string) {
  return {
    title: 'Confirm your service',
    body: `${vendorName} says you're done. Confirm to release payment.`,
  };
}

export function msg_autoReleaseWarning(vendorName: string) {
  return {
    title: 'Payment releasing soon',
    body: `We'll release payment to ${vendorName} in 30 minutes. Raise an issue if something went wrong.`,
  };
}

export function msg_paymentReleased(vendorName: string) {
  return {
    title: 'Payment released',
    body: `Payment released. Hope you're feeling fresh — leave ${vendorName} a review.`,
  };
}

export function msg_cancelTier1(amount: string) {
  return {
    title: 'Booking cancelled',
    body: `Booking cancelled. A 15% cancellation fee has been applied. ₦${amount} will be returned to you.`,
  };
}

export function msg_cancelTier2(amount: string) {
  return {
    title: 'Booking cancelled',
    body: `Booking cancelled. A 50% cancellation fee has been applied. ₦${amount} will be returned to you.`,
  };
}

export function msg_cancelNonRefundable() {
  return {
    title: 'Booking cancelled',
    body: `This booking is non-refundable. If something urgent came up, we understand — we hope to see you again soon.`,
  };
}

// Vendor messages
export function msg_vendor_newBooking(clientFirstName: string, service: string, date: string, time: string) {
  return {
    title: 'New booking request',
    body: `New booking from ${clientFirstName}. ${service} on ${date} at ${time}. You have 2 hours to accept.`,
  };
}

export function msg_vendor_reminder30min(clientFirstName: string) {
  return {
    title: 'Don\'t miss this',
    body: `Don't miss this — ${clientFirstName} is waiting for your confirmation. 30 minutes left.`,
  };
}

export function msg_vendor_bookingExpired() {
  return {
    title: 'Booking expired',
    body: `This booking expired. Stay active to keep your bookings coming in.`,
  };
}

export function msg_vendor_reminder24h(time: string, service: string, clientFirstName: string) {
  return {
    title: 'Tomorrow\'s job',
    body: `Tomorrow at ${time} — ${service} for ${clientFirstName}. Make sure you're ready.`,
  };
}

export function msg_vendor_reminder1h(clientFirstName: string) {
  return {
    title: '1 hour to go',
    body: `1 hour to go. ${clientFirstName}'s number will be shared with you at the 15-minute mark.`,
  };
}

export function msg_vendor_reminder15min(clientFirstName: string) {
  return {
    title: 'Head out now',
    body: `${clientFirstName}'s number is now available in your booking. Head out.`,
  };
}

export function msg_vendor_paymentReleased(amount: string) {
  return {
    title: 'Payment released',
    body: `Payment released. ₦${amount} is on its way to your account.`,
  };
}

export function msg_vendor_userCancelledWithFee(clientFirstName: string, amount: string) {
  return {
    title: 'Booking cancelled',
    body: `${clientFirstName} cancelled. Your ₦${amount} share is on its way.`,
  };
}

export function msg_vendor_newReview(clientFirstName: string) {
  return {
    title: 'New review',
    body: `${clientFirstName} left you a review on VARS. Check it out.`,
  };
}

export function msg_vendor_verificationApproved() {
  return {
    title: 'You\'re live on VARS',
    body: `You're live on VARS. Your first booking is closer than you think.`,
  };
}

export function msg_vendor_verificationFailed(reason: string) {
  return {
    title: 'Verification failed',
    body: `We couldn't verify your details. ${reason}. Try again or contact VARS support.`,
  };
}

/** Format kobo to naira string with commas e.g. 350000 → "3,500" */
export function formatNaira(kobo: number): string {
  return (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

/** Format a date for display in notifications */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Format a time for display in notifications */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
