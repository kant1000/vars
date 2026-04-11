// ============================================================
// VARS — paystack-settle
// Triggered when:
//   (a) User confirms "Service complete" OR
//   (b) 2-hour auto-release fires after "Service Rendered"
//
// Per spec §8 Step 3:
//   "Paystack Transfer API executes split. Vendor share goes to their
//    registered bank account. VARS commission goes to VARS account.
//    Simultaneous, automatic."
//
// VARS commission: 20% of service price (spec §8)
// Vendor receives: 80% of service price
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  PaystackClient,
  generateReference,
  calculateSettlement,
} from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_paymentReleased,
  msg_vendor_paymentReleased,
  formatNaira,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    if (!authHeader && !isCronCall) {
      return errorResponse('Missing authorization', 401);
    }

    // --------------------------------------------------------
    // CRON MODE: auto-release all bookings past 2hr window
    // --------------------------------------------------------
    if (isCronCall) {
      const now = new Date().toISOString();

      const { data: dueBookings } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, service_price_kobo, paystack_reference')
        .eq('status', 'service_rendered')
        .lte('auto_release_at', now);

      if (!dueBookings || dueBookings.length === 0) {
        return jsonResponse({ settled: 0 });
      }

      let settledCount = 0;
      for (const booking of dueBookings) {
        await settleBooking(supabase, booking.id, 'auto_release');
        settledCount++;
      }

      return jsonResponse({ settled: settledCount });
    }

    // --------------------------------------------------------
    // USER CONFIRMATION MODE: user taps "Confirm service complete"
    // --------------------------------------------------------
    const authClient = createAuthClient(authHeader!);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    // Verify booking belongs to this user and is in correct state
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id')
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== 'service_rendered') {
      return errorResponse(`Cannot confirm booking with status: ${booking.status}`);
    }

    await settleBooking(supabase, booking_id, 'user_confirmed');

    return jsonResponse({ success: true, booking_id, status: 'completed' });
  } catch (err) {
    console.error('paystack-settle error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ============================================================
// CORE SETTLEMENT LOGIC
// ============================================================
async function settleBooking(
  supabase: ReturnType<typeof createAdminClient>,
  bookingId: string,
  trigger: 'user_confirmed' | 'auto_release'
) {
  // Idempotency: check booking hasn't already been settled
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, user_id, vendor_id, service_price_kobo,
      paystack_reference, status
    `)
    .eq('id', bookingId)
    .single();

  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status === 'completed') {
    console.log(`Booking ${bookingId} already completed — skipping`);
    return;
  }

  // Check no payout already initiated for this booking
  const { data: existingPayout } = await supabase
    .from('payout_history')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (existingPayout) {
    console.log(`Payout already exists for booking ${bookingId} — skipping`);
    return;
  }

  // Fetch vendor recipient code + pioneer fields
  const { data: vendor } = await supabase
    .from('vendors')
    .select('full_name, paystack_recipient_code, push_token, pioneer, pioneer_bookings_completed')
    .eq('id', booking.vendor_id)
    .single();

  if (!vendor?.paystack_recipient_code) {
    console.error(`Vendor ${booking.vendor_id} has no paystack_recipient_code`);
    throw new Error('Vendor payment details not configured');
  }

  // Pioneer commission logic: first 3 completed bookings get 100% (no platform cut)
  const isPioneerBooking =
    vendor.pioneer === true && vendor.pioneer_bookings_completed < 3;

  const vendorAmountKobo = isPioneerBooking
    ? booking.service_price_kobo
    : calculateSettlement(booking.service_price_kobo).vendorAmountKobo;
  const varsCommissionKobo = isPioneerBooking
    ? 0
    : calculateSettlement(booking.service_price_kobo).varsCommissionKobo;

  const transferRef = generateReference('VARS_TRF');

  // Mark booking as completed first (optimistic update)
  await supabase
    .from('bookings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  // Create payout_history record (pending → updated by transfer webhook)
  const { data: payout } = await supabase
    .from('payout_history')
    .insert({
      booking_id: bookingId,
      vendor_id: booking.vendor_id,
      vendor_amount_kobo: vendorAmountKobo,
      vars_commission_kobo: varsCommissionKobo,
      paystack_transfer_reference: transferRef,
      status: 'pending',
    })
    .select('id')
    .single();

  // Execute Paystack Transfer API — vendor's 80% to their bank account
  try {
    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
    const transfer = await paystack.initiateTransfer({
      source: 'balance',
      amount: vendorAmountKobo,
      recipient: vendor.paystack_recipient_code,
      reason: `VARS booking ${bookingId} — service payment`,
      reference: transferRef,
    });

    // Update payout with transfer code
    await supabase
      .from('payout_history')
      .update({ paystack_transfer_code: transfer.transfer_code })
      .eq('id', payout?.id);

    // Increment pioneer counter after successful transfer
    if (isPioneerBooking) {
      await supabase
        .from('vendors')
        .update({ pioneer_bookings_completed: vendor.pioneer_bookings_completed + 1 })
        .eq('id', booking.vendor_id);
      console.log(
        `Pioneer booking ${bookingId}: 100% to vendor, ` +
        `pioneer_bookings_completed now ${vendor.pioneer_bookings_completed + 1}/3`
      );
    }

    console.log(
      `Transfer initiated: ${transfer.transfer_code} — ` +
      `₦${formatNaira(vendorAmountKobo)} to vendor ${booking.vendor_id} ` +
      `(VARS commission: ₦${formatNaira(varsCommissionKobo)}${isPioneerBooking ? ' — Pioneer waiver' : ''})`
    );
  } catch (err) {
    // Transfer failed — update payout to failed, alert ops
    await supabase
      .from('payout_history')
      .update({ status: 'failed' })
      .eq('id', payout?.id);
    console.error(`Transfer failed for booking ${bookingId}:`, err);
    throw err;
  }

  // Notify user: payment released
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', booking.user_id)
    .single();

  const userMsg = msg_paymentReleased(vendor.full_name);
  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: 'payment_released',
    title: userMsg.title,
    body: userMsg.body,
    bookingId,
    pushToken: profile?.push_token ?? null,
    data: { bookingId, trigger },
  });
}
