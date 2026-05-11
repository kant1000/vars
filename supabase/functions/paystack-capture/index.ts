// ============================================================
// VARS — paystack-capture
// Called when vendor taps "Accept" on an incoming booking.
// Per spec §8 Step 2: "Vendor accepts → Paystack captures the authorized amount.
// Escrow begins."
// In our Paystack escrow model, funds are already in VARS account.
// "Capture" marks the booking as committed — vendor is now responsible.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { createTransportBuffers } from '../_shared/calendar.ts';
import {
  sendNotification,
  msg_vendorAccepts,
  formatDate,
  formatTime,
} from '../_shared/notifications.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    // Authenticate — must be a vendor
    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    // Fetch booking and verify it belongs to this vendor
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, vendor_id, user_id,
        service_name, service_price_kobo, service_duration_blocks, scheduled_at,
        paystack_reference, created_at
      `)
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return errorResponse(`Cannot accept booking with status: ${booking.status}`);
    }

    // Check the 1-hour response window hasn't expired
    const createdAt = new Date(booking.created_at);
    const oneHourLater = new Date(createdAt.getTime() + 1 * 60 * 60 * 1000);
    if (new Date() > oneHourLater) {
      // Auto-expire: should have been handled by cron, but guard here too
      await supabase
        .from('bookings')
        .update({ status: BOOKING_STATUS.EXPIRED, updated_at: new Date().toISOString() })
        .eq('id', booking_id);
      return errorResponse('Booking response window has expired');
    }

    // Update booking to accepted — escrow is now committed
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.ACCEPTED,
        payment_captured: true,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    if (updateError) throw updateError;

    // Create transport buffer blocks after the booking end time
    await createTransportBuffers(
      supabase,
      user.id,
      booking_id,
      booking.scheduled_at,
      booking.service_duration_blocks
    );

    // Fetch user profile for notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, push_token')
      .eq('id', booking.user_id)
      .single();

    const { data: vendor } = await supabase
      .from('vendors')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // Notify user: vendor accepted
    if (profile) {
      const msg = msg_vendorAccepts(
        vendor?.full_name ?? 'Your vendor',
        formatDate(booking.scheduled_at),
        formatTime(booking.scheduled_at)
      );
      await sendNotification({
        recipientId: booking.user_id,
        recipientType: 'user',
        type: 'vendor_accepts',
        title: msg.title,
        body: msg.body,
        bookingId: booking.id,
        pushToken: profile.push_token,
        data: { bookingId: booking.id },
      });
    }

    console.log(`Booking ${booking_id} accepted by vendor ${user.id}`);

    return jsonResponse({ success: true, booking_id, status: 'accepted' });
  } catch (err) {
    console.error('paystack-capture error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
