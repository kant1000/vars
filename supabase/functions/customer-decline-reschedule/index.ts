// ============================================================
// VARS — customer-decline-reschedule
// Customer rejects the vendor's suggested alternative time.
// Full refund issued, booking cancelled, vendor notified.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_reschedule_declined_vendor,
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

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    // Fetch booking — must belong to this user and be awaiting reschedule response
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id, vendor_id, service_price_kobo, paystack_reference')
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== 'rescheduled_pending') {
      return errorResponse(`Booking is not awaiting a reschedule response (current: ${booking.status})`);
    }

    // Cancel with full refund — customer not at fault
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by: 'user',
        cancellation_reason: 'Customer declined reschedule suggestion',
        cancellation_fee_percent: 0,
        cancellation_vars_amount_kobo: 0,
        cancellation_vendor_amount_kobo: 0,
        cancellation_refund_amount_kobo: booking.service_price_kobo,
        suggested_scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    // Refund to customer
    if (booking.paystack_reference) {
      try {
        const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
        await paystack.refundTransaction({
          transaction: booking.paystack_reference,
          merchant_note: `VARS booking ${booking_id} — customer declined reschedule, full refund`,
        });
      } catch (err) {
        console.error(`Refund failed for booking ${booking_id}:`, err);
        // Don't throw — ops team handles manually
      }
    }

    // Fetch profiles for notification
    const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
      supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    ]);

    const clientFirstName = (userProfile?.full_name ?? 'Customer').split(' ')[0];
    const msg = msg_reschedule_declined_vendor(clientFirstName);

    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'reschedule_declined',
      title: msg.title,
      body: msg.body,
      bookingId: booking_id,
      pushToken: vendorProfile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(`Booking ${booking_id}: customer declined reschedule — full refund issued`);

    return jsonResponse({ success: true, booking_id, status: 'cancelled' });
  } catch (err) {
    console.error('customer-decline-reschedule error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
