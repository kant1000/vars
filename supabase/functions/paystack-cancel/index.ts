// ============================================================
// VARS — paystack-cancel
// Called when a customer taps "Cancel" on their booking.
//
// Binary model:
//   Pre-gate  (gate_fired = false) → cancel is free, no Paystack call.
//   Post-gate (gate_fired = true)  → customer locked out; booking proceeds
//                                     normally (vendor gets paid). If vendor
//                                     later cancels post-gate, THAT triggers
//                                     a full refund + vendor restriction.
//
// Customers cannot cancel once the gate has fired (money already charged).
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_cancelFree,
  msg_vendor_customerCancelledFree,
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

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id, vendor_id, gate_fired, scheduled_at')
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED].includes(booking.status)) {
      return errorResponse(`Cannot cancel booking with status: ${booking.status}`);
    }

    // Post-gate: customer cannot cancel — booking proceeds
    if (booking.gate_fired) {
      return errorResponse(
        'Your vendor is already on their way — the booking cannot be cancelled at this stage.',
        409
      );
    }

    // Pre-gate: free cancellation — no Paystack call
    await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.CANCELLED,
        cancelled_by: 'user',
        cancellation_reason: reason ?? 'Customer cancelled',
      })
      .eq('id', booking_id);

    // Release transport buffers (if vendor had already been accepted)
    await supabase
      .from('vendor_calendar')
      .delete()
      .eq('transport_buffer_source_booking_id', booking_id);

    // Notify customer
    const { data: profile } = await supabase
      .from('profiles').select('push_token, full_name').eq('id', user.id).single();
    await sendNotification({
      recipientId: user.id,
      recipientType: 'user',
      type: 'booking_cancelled_free',
      title: msg_cancelFree().title,
      body: msg_cancelFree().body,
      bookingId: booking_id,
      pushToken: profile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    // Notify vendor
    const { data: vendor } = await supabase
      .from('vendors').select('push_token').eq('id', booking.vendor_id).single();
    const clientFirstName = (profile?.full_name ?? 'Customer').split(' ')[0];
    const vendorMsg = msg_vendor_customerCancelledFree(clientFirstName);
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'customer_cancelled_free',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking_id,
      pushToken: vendor?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(`Booking ${booking_id} cancelled by customer (pre-gate, no charge)`);
    return jsonResponse({ success: true, booking_id, status: 'cancelled' });
  } catch (err) {
    console.error('paystack-cancel error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
