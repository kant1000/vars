// ============================================================
// VARS — paystack-release
// Called when vendor declines a booking OR when the 2-hour
// response window expires (via cron job).
// Per spec §8: "Vendor decline/timeout → Paystack releases authorization
// silently. No money ever moved. No refund required."
// In practice with Paystack escrow: funds are refunded to user.
// Also handles the cron expiry case for all timed-out pending bookings.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_vendorDeclines,
  msg_vendor_bookingExpired,
  msg_disputeResolved_userRefunded,
  formatNaira,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();

    // Check if this is a cron/system call (no auth header) or vendor decline (with auth)
    const authHeader = req.headers.get('Authorization');
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    // Admin dashboard uses service role key for dispute refund resolution
    const isAdminCall = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    if (!authHeader && !isCronCall) {
      return errorResponse('Missing authorization', 401);
    }

    // --------------------------------------------------------
    // ADMIN MODE: dispute resolved in user's favour — refund customer
    // --------------------------------------------------------
    if (isAdminCall) {
      const { booking_id } = await req.json();
      if (!booking_id) return errorResponse('Missing booking_id');
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, paystack_reference, service_price_kobo')
        .eq('id', booking_id)
        .single();
      if (!booking) return errorResponse('Booking not found', 404);

      // Mark as completed (dispute closed)
      await supabase
        .from('bookings')
        .update({ status: 'completed', cancelled_by: 'admin', cancellation_reason: 'Dispute resolved — user refunded' })
        .eq('id', booking_id);

      // Issue full refund via Paystack
      if (booking.paystack_reference) {
        try {
          const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
          await paystack.refundTransaction({
            transaction: booking.paystack_reference,
            merchant_note: `Dispute ${booking_id} resolved in user favour — full refund`,
          });
        } catch (err) {
          console.error(`Dispute refund failed for booking ${booking_id}:`, err);
        }
      }

      // Notify user with dispute-specific message (not the generic vendor-decline copy)
      const { data: profile } = await supabase
        .from('profiles').select('push_token').eq('id', booking.user_id).single();
      const msg = msg_disputeResolved_userRefunded(formatNaira(booking.service_price_kobo));
      await sendNotification({
        recipientId: booking.user_id, recipientType: 'user',
        type: 'dispute_resolved_user', title: msg.title, body: msg.body,
        bookingId: booking_id, pushToken: profile?.push_token ?? null,
        data: { bookingId: booking_id },
      });

      console.log(`Dispute resolved (user): booking ${booking_id} refunded`);
      return jsonResponse({ success: true, booking_id, status: 'refunded' });
    }

    // --------------------------------------------------------
    // CRON MODE: expire all pending bookings past 1-hour window
    // --------------------------------------------------------
    if (isCronCall) {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

      const { data: expiredBookings } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, paystack_reference, service_price_kobo')
        .eq('status', 'pending')
        .lt('created_at', oneHourAgo);

      if (!expiredBookings || expiredBookings.length === 0) {
        return jsonResponse({ expired: 0 });
      }

      let expiredCount = 0;
      for (const booking of expiredBookings) {
        await expireBooking(supabase, booking, 'timeout');
        expiredCount++;
      }

      return jsonResponse({ expired: expiredCount });
    }

    // --------------------------------------------------------
    // VENDOR DECLINE MODE: vendor taps "Decline"
    // --------------------------------------------------------
    const authClient = createAuthClient(authHeader!);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, vendor_id, user_id, paystack_reference, service_price_kobo')
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== 'pending') {
      return errorResponse(`Cannot decline booking with status: ${booking.status}`);
    }

    await expireBooking(supabase, booking, 'decline');

    return jsonResponse({ success: true, booking_id, status: 'expired' });
  } catch (err) {
    console.error('paystack-release error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ============================================================
// SHARED: expire/release a single booking
// ============================================================
async function expireBooking(
  supabase: ReturnType<typeof createAdminClient>,
  booking: {
    id: string;
    user_id: string;
    vendor_id: string;
    paystack_reference: string | null;
    service_price_kobo: number;
  },
  reason: 'decline' | 'timeout'
) {
  // 1. Mark booking as expired
  await supabase
    .from('bookings')
    .update({
      status: 'expired',
      cancelled_by: 'system',
      cancellation_reason: reason === 'decline' ? 'Vendor declined' : 'Vendor did not respond',
    })
    .eq('id', booking.id);

  // 2. Refund user via Paystack (full refund — vendor never accepted)
  if (booking.paystack_reference) {
    try {
      const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
      await paystack.refundTransaction({
        transaction: booking.paystack_reference,
        merchant_note: `Booking ${booking.id} ${reason} — full refund`,
      });
      console.log(`Refund issued for booking ${booking.id} (${reason})`);
    } catch (err) {
      console.error(`Refund failed for booking ${booking.id}:`, err);
      // Don't throw — booking is already marked expired, refund can be retried manually
    }
  }

  // 3. Fetch push tokens for notifications
  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('push_token').eq('id', booking.user_id).single(),
    supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
  ]);

  // 4. Notify user: "Let's find you another one"
  const userMsg = msg_vendorDeclines(vendor?.full_name ?? 'Your vendor');
  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: 'vendor_declines',
    title: userMsg.title,
    body: userMsg.body,
    bookingId: booking.id,
    pushToken: profile?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  // 5. Notify vendor: booking expired (only for timeout, not manual decline)
  if (reason === 'timeout' && vendor) {
    const vendorMsg = msg_vendor_bookingExpired();
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'booking_expired',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking.id,
      pushToken: vendor.push_token ?? null,
      data: { bookingId: booking.id },
    });
  }
}
