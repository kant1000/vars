// ============================================================
// VARS — customer-accept-reschedule
// Customer accepts the vendor's suggested alternative time.
// Captures payment, updates scheduled_at to the suggested slot,
// creates transport buffers, and notifies the vendor.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { createTransportBuffers } from '../_shared/calendar.ts';
import {
  sendNotification,
  msg_reschedule_accepted_vendor,
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

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    // Fetch booking — must belong to this user and be awaiting reschedule response
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id,
        service_name, service_price_kobo, service_duration_blocks,
        scheduled_at, suggested_scheduled_at, paystack_reference
      `)
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== 'rescheduled_pending') {
      return errorResponse(`Booking is not awaiting a reschedule response (current: ${booking.status})`);
    }
    if (!booking.suggested_scheduled_at) {
      return errorResponse('No suggested time found on this booking');
    }

    // Commit: update scheduled_at to the suggested slot, set accepted
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'accepted',
        payment_captured: true,
        auto_accepted: false,
        accepted_at: new Date().toISOString(),
        scheduled_at: booking.suggested_scheduled_at,
        suggested_scheduled_at: null,
        reschedule_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    if (updateError) throw updateError;

    // Create transport buffer blocks after the new booking end time
    await createTransportBuffers(
      supabase,
      booking.vendor_id,
      booking_id,
      booking.suggested_scheduled_at,
      booking.service_duration_blocks,
    );

    // Fetch profiles for notification
    const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
      supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    ]);

    const clientFirstName = (userProfile?.full_name ?? 'Customer').split(' ')[0];
    const msg = msg_reschedule_accepted_vendor(
      clientFirstName,
      formatDate(booking.suggested_scheduled_at),
      formatTime(booking.suggested_scheduled_at),
    );

    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'reschedule_accepted',
      title: msg.title,
      body: msg.body,
      bookingId: booking_id,
      pushToken: vendorProfile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(`Booking ${booking_id}: customer accepted reschedule → ${booking.suggested_scheduled_at}`);

    return jsonResponse({ success: true, booking_id, status: 'accepted' });
  } catch (err) {
    console.error('customer-accept-reschedule error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
