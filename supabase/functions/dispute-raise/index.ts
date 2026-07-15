// ============================================================
// VARS — dispute-raise
// Called when user taps "Raise a Dispute" on the live screen.
// Per spec §5:
//   "Disputed: freeze escrow immediately (auto-release must NOT fire),
//    notify both parties, appear in admin with SLA timer."
// Setting status = 'disputed' is what prevents the auto-release
// cron from picking this booking up (cron queries status = 'service_rendered').
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_disputeRaised_user,
  msg_disputeRaised_vendor,
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

    const { booking_id, reason, category } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');
    if (!category) return errorResponse('Dispute category required');

    const VALID_CATEGORIES = ['vendor_no_show', 'vendor_very_late', 'service_not_completed', 'service_quality_poor', 'wrong_service', 'other'];
    if (!VALID_CATEGORIES.includes(category)) {
      return errorResponse(`Invalid dispute category: ${category}`, 400);
    }
    // Reason is required only when category is 'other'
    if (category === 'other' && (!reason || !reason.trim())) {
      return errorResponse('Reason is required when category is "Other"');
    }

    const supabase = createAdminClient();

    // Fetch booking — must belong to this user
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id, vendor_id, service_name, scheduled_at')
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    // Dispute is available once the vendor is en route or beyond.
    // This covers the case where vendor marks on_way then disappears —
    // at that point the customer can't cancel (locked out) so needs dispute as recourse.
    const disputeableStatuses = [BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.SERVICE_RENDERED];
    if (!disputeableStatuses.includes(booking.status)) {
      return errorResponse(`Cannot dispute booking with status: ${booking.status}`);
    }

    // Idempotency: already disputed?
    const { data: existingDispute } = await supabase
      .from('disputes')
      .select('id')
      .eq('booking_id', booking_id)
      .maybeSingle();

    if (existingDispute) {
      return jsonResponse({ success: true, booking_id, dispute_id: existingDispute.id, already_exists: true });
    }

    // 1. Freeze escrow: mark booking as disputed and hold vendor settlement.
    //    status=disputed prevents auto-release (cron only queries 'service_rendered').
    //    settlement_on_hold=true prevents the settle cron from settling any of this
    //    vendor's completed bookings until admin resolves. Cleared by admin resolve path
    //    in paystack-settle (pay vendor) and paystack-release (refund customer) once
    //    no open disputes remain for this vendor.
    await Promise.all([
      supabase
        .from('bookings')
        .update({ status: BOOKING_STATUS.DISPUTED })
        .eq('id', booking_id),
      supabase
        .from('vendors')
        .update({ settlement_on_hold: true })
        .eq('id', booking.vendor_id),
    ]);

    // 2. Create dispute record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        booking_id,
        raised_by: user.id,
        category,
        reason: reason ? reason.trim() : null,
        status: 'open',
        raised_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (disputeError) {
      console.error('dispute-raise: failed to insert dispute', disputeError);
      // Rollback booking to its original status
      await supabase
        .from('bookings')
        .update({ status: booking.status })
        .eq('id', booking_id);
      return errorResponse('Failed to create dispute', 500);
    }

    // 3. Fetch names/tokens for notifications
    const [{ data: userProfile }, { data: vendor }] = await Promise.all([
      supabase.from('profiles').select('full_name, push_token').eq('id', user.id).single(),
      supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
    ]);

    const clientFirstName = (userProfile?.full_name ?? 'Client').split(' ')[0];

    // 4. Notify user — dispute acknowledged, VARS team on it
    const userMsg = msg_disputeRaised_user();
    await sendNotification({
      recipientId: user.id,
      recipientType: 'user',
      type: 'dispute_raised',
      title: userMsg.title,
      body: userMsg.body,
      bookingId: booking_id,
      pushToken: userProfile?.push_token ?? null,
      data: { bookingId: booking_id, disputeId: dispute.id },
    });

    // 5. Notify vendor — dispute raised, payment on hold
    const vendorMsg = msg_disputeRaised_vendor(clientFirstName);
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'dispute_raised',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking_id,
      pushToken: vendor?.push_token ?? null,
      data: { bookingId: booking_id, disputeId: dispute.id },
    });

    console.log(
      `Dispute ${dispute.id} raised by user ${user.id} on booking ${booking_id}: "${reason}"`
    );

    return jsonResponse({
      success: true,
      booking_id,
      dispute_id: dispute.id,
      status: 'disputed',
    });
  } catch (err) {
    console.error('dispute-raise error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
