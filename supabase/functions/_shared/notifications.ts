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
      // Auto-inject deep-link screen for all notifications that have a bookingId
      const pushData: Record<string, unknown> = { ...payload.data, bookingId: payload.bookingId };
      if (payload.recipientType === 'user' && payload.bookingId) {
        pushData.screen = `/booking/detail/${payload.bookingId}`;
      }
      if (payload.recipientType === 'vendor' && payload.bookingId) {
        pushData.screen = `/vendor-tabs`;
      }

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
          data: pushData,
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
    body: `You're all set — ${vendorName} has 1 hour to confirm your booking. We'll let you know.`,
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
    body: `New booking from ${clientFirstName}. ${service} on ${date} at ${time}. You have 1 hour to accept.`,
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

// Auto-accept messages
export function msg_autoAccepted(vendorName: string, date: string, time: string) {
  return {
    title: 'Booking confirmed',
    body: `Your booking with ${vendorName} is confirmed for ${date} at ${time}. No waiting — you're all set.`,
  };
}

export function msg_bookingCancelledByVendor(date: string, time: string) {
  return {
    title: 'Booking cancelled',
    body: `Your booking for ${date} at ${time} was cancelled by your vendor. You've been fully refunded.`,
  };
}

export function msg_vendor_autoAccepted(clientFirstName: string, service: string, date: string, time: string) {
  return {
    title: 'Auto-accepted booking',
    body: `Auto-accepted: ${service} for ${clientFirstName} on ${date} at ${time}. You have 5 minutes to cancel if needed.`,
  };
}

export function msg_vendor_serviceRenderReminder(clientFirstName: string) {
  return {
    title: 'Did the service wrap up?',
    body: `Your appointment with ${clientFirstName} should be done. Mark it complete to release your payment.`,
  };
}

export function msg_vendor_cancelledFullRefund(date: string, time: string) {
  return {
    title: 'Booking cancelled',
    body: `Your booking for ${date} at ${time} has been cancelled by your vendor. You've been fully refunded — no charges applied.`,
  };
}

export function msg_vendor_selfCancelled(clientFirstName: string, service: string) {
  return {
    title: 'Booking cancelled',
    body: `You cancelled the ${service} booking for ${clientFirstName}. The client has been fully refunded.`,
  };
}

export function msg_disputeRaised_user() {
  return {
    title: 'Dispute raised',
    body: `Your dispute has been escalated to the VARS team. We'll review the details and respond within 24 hours.`,
  };
}

export function msg_disputeRaised_vendor(clientFirstName: string) {
  return {
    title: 'Dispute raised',
    body: `${clientFirstName} has raised a dispute on this booking. Payment is on hold while the VARS team reviews.`,
  };
}

export function msg_disputeResolved_userRefunded(amount: string) {
  return {
    title: 'Dispute resolved',
    body: `Your dispute has been resolved in your favour. ₦${amount} will be returned to you shortly.`,
  };
}

export function msg_disputeResolved_vendorPaid(amount: string) {
  return {
    title: 'Dispute resolved',
    body: `Your dispute has been resolved in your favour. ₦${amount} is on its way to your account.`,
  };
}

// ── Portfolio consent messages ────────────────────────────────

export function msg_consentRequest(vendorName: string) {
  return {
    title: 'Photo consent request',
    body: `${vendorName} would like to add a photo from your session to their profile. Only you can approve this.`,
  };
}

export function msg_vendor_consentApproved() {
  return {
    title: 'Photo approved',
    body: `Your client approved the photo. It's now live on your profile.`,
  };
}

export function msg_vendor_consentDeclined() {
  return {
    title: 'Photo not approved',
    body: `Your client didn't approve this photo. That's okay — it has been removed.`,
  };
}

export function msg_vendor_consentExpired() {
  return {
    title: 'Photo request expired',
    body: `Your client didn't respond to the photo request within 72 hours. The photo has been removed.`,
  };
}

// ── Reschedule messages ───────────────────────────────────────

export function msg_reschedule_suggested_customer(vendorName: string, day: string, time: string) {
  return {
    title: 'New time suggested',
    body: `${vendorName} has suggested a new time for your booking — ${day} at ${time}. Accept or find another vendor.`,
  };
}

export function msg_reschedule_accepted_vendor(clientFirstName: string, day: string, time: string) {
  return {
    title: 'Reschedule accepted',
    body: `${clientFirstName} accepted your suggested time. Your booking is confirmed for ${day} at ${time}.`,
  };
}

export function msg_reschedule_declined_vendor(clientFirstName: string) {
  return {
    title: 'Reschedule declined',
    body: `${clientFirstName} didn't accept your suggested time. The booking has been cancelled and they've been fully refunded.`,
  };
}

export function msg_reschedule_expired_vendor(clientFirstName: string) {
  return {
    title: 'Reschedule expired',
    body: `Your reschedule suggestion for ${clientFirstName} was not accepted in time. The booking has been cancelled.`,
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
