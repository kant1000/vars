// ============================================================
// VARS — vendor-cancel-booking
// Called when vendor taps "Cancel" on an accepted/in-progress booking.
// Per spec §5:
//   "Vendor cancel: full refund, no fee, transport buffers released,
//    calendar reverts, increment vendor_cancellation_count,
//    flag vendor at 3 cancellations in 30-day rolling window."
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_vendor_selfCancelled,
  msg_vendor_cancelledFullRefund,
  formatDate,
  formatTime,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id, reason } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    // Fetch booking — must belong to this vendor
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id,
        service_price_kobo, service_name, scheduled_at,
        paystack_reference
      `)
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    // Vendor can only cancel pending or accepted bookings
    if (!['pending', 'accepted'].includes(booking.status)) {
      return errorResponse(`Cannot cancel booking with status: ${booking.status}`);
    }

    // 1. Mark booking cancelled by vendor
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: 'vendor',
        cancellation_reason: reason ?? 'Vendor cancelled',
        cancellation_fee_percent: 0,
        cancellation_vars_amount_kobo: 0,
        cancellation_vendor_amount_kobo: 0,
        cancellation_refund_amount_kobo: booking.service_price_kobo,
      })
      .eq('id', booking_id);

    // 2. Release transport buffer blocks tied to this booking
    await supabase
      .from('vendor_calendar')
      .delete()
      .eq('transport_buffer_source_booking_id', booking_id);

    // 3. Full refund to user
    if (booking.paystack_reference) {
      try {
        const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
        await paystack.refundTransaction({
          transaction: booking.paystack_reference,
          merchant_note: `VARS booking ${booking_id} cancelled by vendor — full refund`,
        });
      } catch (err) {
        console.error(`Full refund failed for booking ${booking_id}:`, err);
        // Don't throw — booking is cancelled, ops team handles manually
      }
    }

    // 4. Rolling 30-day cancellation count for this vendor
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCancellations } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', user.id)
      .eq('cancelled_by', 'vendor')
      .gte('updated_at', thirtyDaysAgo);

    const cancelCount = (recentCancellations ?? 0) + 1; // +1 for the one we just cancelled

    // Flag vendor if they hit 3 cancellations in 30 days
    if (cancelCount >= 3) {
      await supabase
        .from('vendors')
        .update({ cancellation_flagged: true })
        .eq('id', user.id);

      console.log(`Vendor ${user.id} flagged: ${cancelCount} cancellations in 30 days`);
    }

    // 5. Fetch names for notifications
    const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
      supabase.from('vendors').select('full_name, push_token').eq('id', user.id).single(),
      supabase.from('profiles').select('full_name, push_token').eq('id', booking.user_id).single(),
    ]);

    const serviceDate = formatDate(booking.scheduled_at);
    const serviceTime = formatTime(booking.scheduled_at);
    const clientFirstName = (userProfile?.full_name ?? 'Your client').split(' ')[0];

    // 6. Notify user — full refund, vendor cancelled
    const userMsg = msg_vendor_cancelledFullRefund(serviceDate, serviceTime);
    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'vendor_cancelled',
      title: userMsg.title,
      body: userMsg.body,
      bookingId: booking_id,
      pushToken: userProfile?.push_token ?? null,
      data: { bookingId: booking_id, screen: '/vendor-feed' },
    });

    // 7. Notify vendor — confirmation of their own cancellation
    const vendorMsg = msg_vendor_selfCancelled(clientFirstName, booking.service_name ?? 'service');
    await sendNotification({
      recipientId: user.id,
      recipientType: 'vendor',
      type: 'vendor_self_cancelled',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking_id,
      pushToken: vendorProfile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(
      `Booking ${booking_id} cancelled by vendor ${user.id} — ` +
      `full refund issued, 30-day cancel count: ${cancelCount}${cancelCount >= 3 ? ' [FLAGGED]' : ''}`
    );

    return jsonResponse({
      success: true,
      booking_id,
      status: 'cancelled',
      cancellation_count_30d: cancelCount,
      flagged: cancelCount >= 3,
    });
  } catch (err) {
    console.error('vendor-cancel-booking error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
