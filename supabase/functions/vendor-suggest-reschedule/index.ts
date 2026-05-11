// ============================================================
// VARS — vendor-suggest-reschedule
// Vendor proposes a new start time for a pending booking.
// Sets status → rescheduled_pending, stores suggested_scheduled_at,
// and notifies the customer via push + in-app.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_reschedule_suggested_customer,
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

    const { booking_id, suggested_at } = await req.json();
    if (!booking_id || !suggested_at) return errorResponse('Missing booking_id or suggested_at');

    const supabase = createAdminClient();

    // Fetch booking — must belong to this vendor and be in pending state
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id, vendor_id, service_name, scheduled_at')
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return errorResponse(`Can only suggest reschedule for pending bookings (current: ${booking.status})`);
    }

    // Update status and store the suggested slot; customer has 1 hour to respond
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.RESCHEDULED_PENDING,
        suggested_scheduled_at: suggested_at,
        reschedule_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id);

    if (updateError) throw updateError;

    // Fetch profiles for notification
    const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
      supabase.from('vendors').select('full_name').eq('id', user.id).single(),
      supabase.from('profiles').select('full_name, push_token').eq('id', booking.user_id).single(),
    ]);

    const msg = msg_reschedule_suggested_customer(
      vendorProfile?.full_name ?? 'Your vendor',
      formatDate(suggested_at),
      formatTime(suggested_at),
    );

    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'reschedule_suggested',
      title: msg.title,
      body: msg.body,
      bookingId: booking_id,
      pushToken: userProfile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(`Booking ${booking_id}: vendor ${user.id} suggested reschedule to ${suggested_at}`);

    return jsonResponse({ success: true, booking_id, status: 'rescheduled_pending' });
  } catch (err) {
    console.error('vendor-suggest-reschedule error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
