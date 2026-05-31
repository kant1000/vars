// ============================================================
// VARS — vendor-cancel-grace
// Allows a vendor to cancel an auto-accepted booking during
// the 5-minute grace period, penalty-free.
//
// On success:
//   - Booking status → 'cancelled', grace_cancelled = TRUE
//   - Full Paystack refund issued directly via PaystackClient
//   - Sends cancellation notification to user
//   - Removes transport buffer blocks for this booking
//
// POST body: { booking_id }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
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
      paystack_reference,
      service_price_kobo, transport_fee_kobo
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
  if (booking.status !== BOOKING_STATUS.ACCEPTED) {
    return errorResponse(`Booking cannot be cancelled — current status: ${booking.status}`, 409);
  }

  if (booking.grace_cancelled) {
    return errorResponse('Booking already cancelled during grace period', 409);
  }

  // ── Cancel the booking ────────────────────────────────────
  const { error: cancelError } = await supabase
    .from('bookings')
    .update({
      status: BOOKING_STATUS.CANCELLED,
      grace_cancelled: true,
      cancelled_by: 'vendor',
      cancellation_reason: 'Vendor cancelled during auto-accept grace period',
      cancellation_fee_percent: 0,
      cancellation_vendor_amount_kobo: 0,
      cancellation_vars_amount_kobo: 0,
      cancellation_refund_amount_kobo: booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0),
    })
    .eq('id', booking.id);

  if (cancelError) {
    console.error('grace cancel update error:', cancelError);
    return errorResponse('Failed to cancel booking', 500);
  }

  // ── Refund via Paystack directly ──────────────────────────
  // Note: we do NOT call paystack-release because that function
  // only handles 'pending' bookings (vendor decline / expiry).
  // Auto-accepted bookings are 'accepted', so we refund directly.
  if (booking.paystack_reference) {
    try {
      const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
      await paystack.refundTransaction({
        transaction: booking.paystack_reference,
        merchant_note: `Grace period cancel — booking ${booking.id}, full refund`,
      });
      console.log(`Grace cancel: Paystack refund issued for booking ${booking.id}`);
    } catch (err) {
      // Booking is already marked cancelled — log for manual follow-up
      console.error(`Grace cancel: Paystack refund failed for booking ${booking.id}:`, err);
    }
  }

  // ── Remove transport buffer blocks for this booking ───────
  await supabase
    .from('vendor_calendar')
    .delete()
    .eq('transport_buffer_source_booking_id', booking.id);

  // ── Notify user ───────────────────────────────────────────
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
