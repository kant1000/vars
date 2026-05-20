// ============================================================
// VARS — paystack-settle
// Triggered when:
//   (a) User confirms "Service complete" OR
//   (b) Auto-release fires 1 hour after the scheduled booking end time OR
//   (c) Admin resolves a dispute in the vendor's favour
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
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  sendTransactionalEmail,
  msg_paymentReleased,
  msg_vendor_paymentReleased,
  msg_vendor_serviceRenderReminder,
  msg_disputeResolved_vendorPaid,
  msg_autoReleaseWarning,
  email_serviceComplete_customer,
  email_serviceComplete_vendor,
  formatNaira,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');
    // Admin dashboard uses service role key for dispute resolution
    const isAdminCall = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    if (!authHeader && !isCronCall) {
      return errorResponse('Missing authorization', 401);
    }

    // --------------------------------------------------------
    // ADMIN MODE: dispute resolved — pay vendor
    // --------------------------------------------------------
    if (isAdminCall) {
      const { booking_id } = await req.json();
      if (!booking_id) return errorResponse('Missing booking_id');
      await settleBooking(supabase, booking_id, 'admin_dispute');

      // Send dispute-specific notification to vendor (transfer.success webhook
      // sends the generic payment-released push, but vendor also needs the
      // dispute resolution context message in their inbox)
      const { data: booking } = await supabase
        .from('bookings')
        .select('vendor_id, service_price_kobo')
        .eq('id', booking_id)
        .single();
      if (booking) {
        const { data: vendor } = await supabase
          .from('vendors').select('push_token').eq('id', booking.vendor_id).single();
        const vendorShare = Math.round(booking.service_price_kobo * 0.8);
        const msg = msg_disputeResolved_vendorPaid(formatNaira(vendorShare));
        await sendNotification({
          recipientId: booking.vendor_id, recipientType: 'vendor',
          type: 'dispute_resolved_vendor', title: msg.title, body: msg.body,
          bookingId: booking_id, pushToken: vendor?.push_token ?? null,
          data: { bookingId: booking_id },
        });
      }

      return jsonResponse({ success: true, booking_id, status: 'completed' });
    }

    // --------------------------------------------------------
    // CRON MODE: auto-release bookings 1hr after scheduled end
    //            + send one reminder push to vendors still on 'arrived'
    // --------------------------------------------------------
    if (isCronCall) {
      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Settle due bookings
      const { data: dueBookings } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, service_price_kobo, paystack_reference')
        .eq('status', BOOKING_STATUS.SERVICE_RENDERED)
        .lte('auto_release_at', nowIso);

      let settledCount = 0;
      for (const booking of (dueBookings ?? [])) {
        await settleBooking(supabase, booking.id, 'auto_release');
        settledCount++;
      }

      // 2. Remind vendors who are still on 'arrived' past their service end + 15min
      //    Fetch bookings that started at least 45 min ago (30min min service + 15min buffer)
      //    then filter precisely using service_duration_blocks.
      const fortyFiveMinsAgo = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
      const { data: arrivedBookings } = await supabase
        .from('bookings')
        .select('id, vendor_id, scheduled_at, service_duration_blocks, profiles(full_name, push_token), vendors(push_token)')
        .eq('status', BOOKING_STATUS.ARRIVED)
        .lt('scheduled_at', fortyFiveMinsAgo);

      let remindedCount = 0;
      for (const b of (arrivedBookings ?? [])) {
        const scheduledEnd = new Date(
          new Date(b.scheduled_at).getTime() + (b.service_duration_blocks as number) * 30 * 60 * 1000
        );
        const reminderAt = new Date(scheduledEnd.getTime() + 15 * 60 * 1000);
        if (now < reminderAt) continue; // too early

        // Idempotency: only send once per booking
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('booking_id', b.id)
          .eq('type', 'service_rendered_reminder')
          .maybeSingle();
        if (existing) continue;

        const clientFirstName = ((b as any).profiles?.full_name ?? 'your client').split(' ')[0];
        const msg = msg_vendor_serviceRenderReminder(clientFirstName);
        await sendNotification({
          recipientId: b.vendor_id,
          recipientType: 'vendor',
          type: 'service_rendered_reminder',
          title: msg.title,
          body: msg.body,
          bookingId: b.id,
          pushToken: (b as any).vendors?.push_token ?? null,
          data: { bookingId: b.id, screen: '/vendor-tabs' },
        });
        remindedCount++;
      }

      // 3. Warn customers 30 min before auto-release so they can dispute in time
      const warnLo = new Date(now.getTime() + 25 * 60 * 1000).toISOString();
      const warnHi = new Date(now.getTime() + 35 * 60 * 1000).toISOString();
      const { data: warnBookings } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, auto_release_at, profiles:user_id (push_token), vendors:vendor_id (full_name)')
        .eq('status', BOOKING_STATUS.SERVICE_RENDERED)
        .gte('auto_release_at', warnLo)
        .lte('auto_release_at', warnHi);

      let warnedCount = 0;
      for (const b of (warnBookings ?? [])) {
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('booking_id', b.id)
          .eq('type', 'auto_release_warning')
          .maybeSingle();
        if (existing) continue;

        const profile = (b as any).profiles as { push_token: string | null } | null;
        const vendorName = (b as any).vendors?.full_name ?? 'your vendor';
        const msg = msg_autoReleaseWarning(vendorName);
        await sendNotification({
          recipientId: b.user_id,
          recipientType: 'user',
          type: 'auto_release_warning',
          title: msg.title,
          body: msg.body,
          bookingId: b.id,
          pushToken: profile?.push_token ?? null,
          data: { bookingId: b.id },
        });
        warnedCount++;
      }

      console.log(`paystack-settle cron: settled=${settledCount}, reminded=${remindedCount}, warned=${warnedCount}`);
      return jsonResponse({ settled: settledCount, reminded: remindedCount, warned: warnedCount });
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
    if (booking.status !== BOOKING_STATUS.SERVICE_RENDERED) {
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
  trigger: 'user_confirmed' | 'auto_release' | 'admin_dispute'
) {
  // Idempotency: check booking hasn't already been settled
  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, user_id, vendor_id, service_name, service_price_kobo,
      paystack_reference, status
    `)
    .eq('id', bookingId)
    .single();

  if (!booking) throw new Error(`Booking ${bookingId} not found`);
  if (booking.status === BOOKING_STATUS.COMPLETED) {
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
    .select('full_name, email, paystack_recipient_code, push_token, pioneer, pioneer_bookings_completed')
    .eq('id', booking.vendor_id)
    .single();

  if (!vendor?.paystack_recipient_code) {
    console.error(`Vendor ${booking.vendor_id} has no paystack_recipient_code`);
    throw new Error('Vendor payment details not configured');
  }

  // Pioneer commission logic: first 3 completed bookings get 100% (no platform cut)
  const isPioneerBooking =
    vendor.pioneer === true && vendor.pioneer_bookings_completed < 3;

  const settlement = calculateSettlement(booking.service_price_kobo);
  const vendorAmountKobo = isPioneerBooking ? booking.service_price_kobo : settlement.vendorAmountKobo;
  const varsNetKobo = isPioneerBooking ? 0 : settlement.varsNetKobo;

  const transferRef = generateReference('VARS_TRF');

  // Mark booking as completed first (optimistic update)
  await supabase
    .from('bookings')
    .update({
      status: BOOKING_STATUS.COMPLETED,
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
      vars_commission_kobo: varsNetKobo,
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

    if (!isPioneerBooking) {
      console.log(
        `Transfer initiated: ${transfer.transfer_code} — ` +
        `₦${formatNaira(vendorAmountKobo)} to vendor ${booking.vendor_id} | ` +
        `VARS gross: ₦${formatNaira(settlement.varsCommissionKobo)}, ` +
        `Paystack fee: ₦${formatNaira(settlement.paystackFeeKobo)}, ` +
        `stamp duty: ₦${formatNaira(settlement.stampDutyKobo)}, ` +
        `VARS net: ₦${formatNaira(varsNetKobo)}`
      );
    } else {
      console.log(
        `Transfer initiated: ${transfer.transfer_code} — ` +
        `₦${formatNaira(vendorAmountKobo)} to vendor ${booking.vendor_id} (Pioneer waiver — VARS net: ₦0)`
      );
    }
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
    .select('full_name, push_token, email')
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

  // Email: service complete — customer + vendor
  try {
    const customerFirstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

    if (profile?.email) {
      const { subject, body } = email_serviceComplete_customer({
        customerFirstName,
        vendorName: vendor.full_name,
        service: booking.service_name,
        amount: `₦${formatNaira(booking.service_price_kobo)}`,
      });
      await sendTransactionalEmail(profile.email, subject, body);
    }

    if (vendor.email) {
      const { subject, body } = email_serviceComplete_vendor({
        vendorName: vendor.full_name,
        customerFirstName,
        service: booking.service_name,
        amount: `₦${formatNaira(vendorAmountKobo)}`,
      });
      await sendTransactionalEmail(vendor.email, subject, body);
    }
  } catch (err) {
    console.error(`paystack-settle: service-complete email failed for booking ${bookingId} (non-fatal):`, err);
  }
}
