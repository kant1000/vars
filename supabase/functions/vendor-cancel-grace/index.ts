// ============================================================
// VARS — vendor-cancel-grace
// Allows a vendor to cancel an auto-accepted booking during
// the 5-minute grace period, penalty-free.
//
// On success:
//   - Booking status → 'cancelled'
//   - grace_cancelled = TRUE
//   - Calls paystack-release to refund the user
//   - Sends cancellation notification to user
//
// POST body: { booking_id }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  sendNotification,
  msg_bookingCancelledByVendor,
  formatDate,
  formatTime,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  let body: { booking_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.booking_id) return errorResponse('booking_id is required');

  const supabase = createAdminClient();

  // Fetch booking with relevant fields
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id, status,
      auto_accepted, auto_accept_grace_expires_at,
      grace_cancelled,
      service_name, scheduled_at,
      paystack_reference, paystack_authorization_code,
      service_price_kobo
    `)
    .eq('id', body.booking_id)
    .single();

  if (!booking) return errorResponse('Booking not found', 404);

  // Verify this vendor owns the booking
  if (booking.vendor_id !== user.id) {
    return errorResponse('You are not authorised to cancel this booking', 403);
  }

  // Check it was auto-accepted
  if (!booking.auto_accepted) {
    return errorResponse('This booking was not auto-accepted. Use the standard decline flow.');
  }

  // Check grace period has not expired
  if (!booking.auto_accept_grace_expires_at) {
    return errorResponse('No grace period found for this booking');
  }

  const graceExpiry = new Date(booking.auto_accept_grace_expires_at);
  if (new Date() > graceExpiry) {
    return errorResponse(
      'Grace period has expired. This booking can no longer be cancelled penalty-free.',
      409
    );
  }

  // Check booking is still in accepted state and not already cancelled
  if (booking.status !== 'accepted') {
    return errorResponse(`Booking cannot be cancelled — current status: ${booking.status}`, 409);
  }

  if (booking.grace_cancelled) {
    return errorResponse('Booking already cancelled during grace period', 409);
  }

  // Cancel the booking and mark as grace-cancelled
  const { error: cancelError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      grace_cancelled: true,
      cancelled_by: 'vendor',
      cancellation_reason: 'Vendor cancelled during auto-accept grace period',
      cancellation_fee_percent: 0,
      cancellation_vendor_amount_kobo: 0,
      cancellation_vars_amount_kobo: 0,
      cancellation_refund_amount_kobo: booking.service_price_kobo,
    })
    .eq('id', booking.id);

  if (cancelError) {
    console.error('grace cancel update error:', cancelError);
    return errorResponse('Failed to cancel booking', 500);
  }

  // Release / refund the user via paystack-release internal call
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const releaseRes = await fetch(`${SUPABASE_URL}/functions/v1/paystack-release`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ booking_id: booking.id, reason: 'grace_cancel' }),
  });

  if (!releaseRes.ok) {
    // Log but don't fail — cancellation is already recorded
    const releaseData = await releaseRes.json().catch(() => ({}));
    console.error('Grace cancel: paystack-release failed:', releaseData);
  }

  // Notify user
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', booking.user_id)
    .single();

  if (userProfile) {
    const msg = msg_bookingCancelledByVendor(
      formatDate(booking.scheduled_at),
      formatTime(booking.scheduled_at)
    );
    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'booking_cancelled',
      title: msg.title,
      body: msg.body,
      bookingId: booking.id,
      pushToken: userProfile.push_token,
      data: { bookingId: booking.id },
    });
  }

  console.log(`Grace cancel: booking ${booking.id} cancelled by vendor ${user.id} within grace period.`);

  return jsonResponse({ cancelled: true, booking_id: booking.id });
});
