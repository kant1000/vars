// ============================================================
// VARS — paystack-settle
// Triggered when:
//   (a) User confirms "Service complete" OR
//   (b) Auto-release fires 2 hours after the scheduled booking end time OR
//   (c) Admin resolves a dispute in the vendor's favour
//
// Payment architecture (subaccount model):
//   The vendor's share of each booking (80%, or 100% for Pioneer) is already
//   in their Paystack subaccount — the split happened at transaction
//   initialization time. This function marks bookings as COMPLETED and queues
//   settlement. The actual bank transfer (subaccount → vendor's bank) is
//   triggered by VARS ops from the Paystack dashboard (settlement_schedule =
//   manual), gated on zero open disputes for that vendor.
//
// Settlement is gated at the VENDOR level, not per-booking:
//   If a vendor has any open or under-review dispute on any booking,
//   their entire subaccount balance stays unsettled until it resolves.
//   Implemented via the settlement_on_hold flag on the vendors row.
//
// VARS commission: 20% of service price (spec §8)
// Vendor receives: 80% of service price
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  PaystackClient,
  calculateSettlement,
} from '../_shared/paystack.ts';
import { BOOKING_STATUS, PIONEER_BOOKINGS_THRESHOLD } from '../_shared/constants.ts';
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
    // This releases the vendor's entire pending subaccount balance,
    // not just this booking's amount. VARS ops must trigger the
    // subaccount settlement from the Paystack dashboard after this call.
    // --------------------------------------------------------
    if (isAdminCall) {
      const { booking_id } = await req.json();
      if (!booking_id) return errorResponse('Missing booking_id');

      await settleBooking(supabase, booking_id, 'admin_dispute');

      // Fetch vendor to clear settlement_on_hold if no more open disputes remain
      const { data: booking } = await supabase
        .from('bookings')
        .select('vendor_id, service_price_kobo, transport_fee_kobo')
        .eq('id', booking_id)
        .single();

      if (booking) {
        // Check if vendor still has other open/under_review disputes
        const { data: vendorBookingRows } = await supabase
          .from('bookings')
          .select('id')
          .eq('vendor_id', booking.vendor_id);
        const vendorBookingIds = (vendorBookingRows ?? []).map((b: { id: string }) => b.id);

        const { count: totalOpen } = await supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true })
          .in('booking_id', vendorBookingIds)
          .in('status', ['open', 'under_review']);
        if (totalOpen === 0) {
          await supabase
            .from('vendors')
            .update({ settlement_on_hold: false })
            .eq('id', booking.vendor_id);
          console.log(`Vendor ${booking.vendor_id}: settlement_on_hold cleared — no remaining open disputes`);
        } else {
          console.log(`Vendor ${booking.vendor_id}: ${totalOpen} open/under-review dispute(s) remain — settlement_on_hold kept`);
        }

        // Queue ops alert for subaccount settlement
        const { data: vendor } = await supabase
          .from('vendors')
          .select('push_token, paystack_subaccount_code, pioneer, pioneer_bookings_completed')
          .eq('id', booking.vendor_id)
          .single();

        if (vendor?.paystack_subaccount_code) {
          const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
          const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
          const isPioneer =
            vendor?.pioneer === true &&
            (vendor.pioneer_bookings_completed ?? PIONEER_BOOKINGS_THRESHOLD) < PIONEER_BOOKINGS_THRESHOLD;
          const vendorShareKobo = isPioneer ? totalKobo : Math.round(totalKobo * 0.8);
          await paystack.triggerSubaccountSettlement({
            vendor_id: booking.vendor_id,
            subaccount_code: vendor.paystack_subaccount_code,
            booking_ids: [booking_id],
            total_amount_kobo: vendorShareKobo,
          });
        }

        // Dispute-specific notification to vendor
        const vendorForNotif = await supabase
          .from('vendors')
          .select('push_token')
          .eq('id', booking.vendor_id)
          .single();

        const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
        const isPioneerForNotif =
          vendor?.pioneer === true &&
          (vendor.pioneer_bookings_completed ?? PIONEER_BOOKINGS_THRESHOLD) < PIONEER_BOOKINGS_THRESHOLD;
        const vendorShare = isPioneerForNotif ? totalKobo : Math.round(totalKobo * 0.8);
        const msg = msg_disputeResolved_vendorPaid(formatNaira(vendorShare));
        await sendNotification({
          recipientId: booking.vendor_id, recipientType: 'vendor',
          type: 'dispute_resolved_vendor', title: msg.title, body: msg.body,
          bookingId: booking_id, pushToken: vendorForNotif.data?.push_token ?? null,
          data: { bookingId: booking_id },
        });
      }

      return jsonResponse({ success: true, booking_id, status: 'completed' });
    }

    // --------------------------------------------------------
    // CRON MODE: auto-release bookings 2hr after scheduled end
    //            + send reminder push to vendors still on 'arrived'
    //            + warn customers 30 min before auto-release
    //
    // Settlement is gated at the VENDOR level:
    //   Bookings are grouped by vendor. If a vendor has settlement_on_hold
    //   or any open/under-review dispute, all their due bookings are skipped
    //   this cycle. The booking remains SERVICE_RENDERED until the dispute
    //   resolves — at which point the admin resolves via the dispute panel
    //   and triggers pay_vendor, which calls this function's admin path.
    // --------------------------------------------------------
    if (isCronCall) {
      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Find all service_rendered bookings past their auto_release_at time
      const { data: dueBookings } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, service_price_kobo, transport_fee_kobo, paystack_reference')
        .eq('status', BOOKING_STATUS.SERVICE_RENDERED)
        .lte('auto_release_at', nowIso);

      // 2. Group by vendor
      const byVendor = new Map<string, typeof dueBookings>();
      for (const booking of (dueBookings ?? [])) {
        if (!byVendor.has(booking.vendor_id)) byVendor.set(booking.vendor_id, []);
        byVendor.get(booking.vendor_id)!.push(booking);
      }

      let settledCount = 0;
      let heldCount = 0;

      for (const [vendorId, vendorBookings] of byVendor) {
        // Fetch vendor hold + restriction flags and subaccount code
        const { data: vendor } = await supabase
          .from('vendors')
          .select('settlement_on_hold, is_restricted, paystack_subaccount_code')
          .eq('id', vendorId)
          .single();

        if (vendor?.settlement_on_hold) {
          console.log(
            `Vendor ${vendorId}: settlement held (settlement_on_hold=true) — ` +
            `skipping ${vendorBookings!.length} booking(s) this cycle`
          );
          heldCount += vendorBookings!.length;
          continue;
        }

        // Restricted vendors owe VARS money from a post-gate cancellation.
        // Skip settlement until admin confirms their repayment and lifts the restriction.
        if (vendor?.is_restricted) {
          console.log(
            `Vendor ${vendorId}: settlement held (is_restricted=true) — ` +
            `skipping ${vendorBookings!.length} booking(s) this cycle`
          );
          heldCount += vendorBookings!.length;
          continue;
        }

        // Check for any open or under-review disputes on this vendor's bookings
        const bookingIds = vendorBookings!.map((b) => b.id);
        const { count: openDisputeCount } = await supabase
          .from('disputes')
          .select('id', { count: 'exact', head: true })
          .in('booking_id', bookingIds)
          .in('status', ['open', 'under_review']);

        if ((openDisputeCount ?? 0) > 0) {
          console.log(
            `Vendor ${vendorId}: settlement held — ${openDisputeCount} open dispute(s) ` +
            `on due bookings — skipping ${vendorBookings!.length} booking(s) this cycle`
          );
          heldCount += vendorBookings!.length;
          continue;
        }

        // No disputes — settle all due bookings for this vendor
        let vendorTotal = 0;
        for (const booking of vendorBookings!) {
          await settleBooking(supabase, booking.id, 'auto_release');
          const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
          vendorTotal += Math.round(totalKobo * 0.8);
          settledCount++;
        }

        // Queue ops alert for subaccount settlement
        if (vendor?.paystack_subaccount_code) {
          const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
          await paystack.triggerSubaccountSettlement({
            vendor_id: vendorId,
            subaccount_code: vendor.paystack_subaccount_code,
            booking_ids: bookingIds,
            total_amount_kobo: vendorTotal,
          });
        }
      }

      // 3. Remind vendors who are still on 'arrived' past service end + 15min
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
        if (now < reminderAt) continue;

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

      // 4. Warn customers 30 min before auto-release so they can dispute in time
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

      console.log(`paystack-settle cron: settled=${settledCount} held=${heldCount} reminded=${remindedCount} warned=${warnedCount}`);
      return jsonResponse({ settled: settledCount, held: heldCount, reminded: remindedCount, warned: warnedCount });
    }

    // --------------------------------------------------------
    // USER CONFIRMATION MODE: user taps "Confirm service complete"
    // --------------------------------------------------------
    const authClient = createAuthClient(authHeader!);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, user_id, vendor_id, service_price_kobo, transport_fee_kobo')
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== BOOKING_STATUS.SERVICE_RENDERED) {
      return errorResponse(`Cannot confirm booking with status: ${booking.status}`);
    }

    // Consistent with the cron path: don't settle for restricted vendors.
    // Settlement resumes automatically on the next cron run after admin lifts the restriction.
    const { data: vendor } = await supabase
      .from('vendors')
      .select('settlement_on_hold, is_restricted, paystack_subaccount_code')
      .eq('id', booking.vendor_id)
      .single();

    if (vendor?.is_restricted) {
      return errorResponse('Vendor settlement is on hold pending restriction review', 409);
    }

    await settleBooking(supabase, booking_id, 'user_confirmed');

    if (!vendor?.settlement_on_hold && vendor?.paystack_subaccount_code) {
      const { count: openDisputes } = await supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', booking_id)
        .in('status', ['open', 'under_review']);

      if ((openDisputes ?? 0) === 0) {
        const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
        const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
        await paystack.triggerSubaccountSettlement({
          vendor_id: booking.vendor_id,
          subaccount_code: vendor.paystack_subaccount_code,
          booking_ids: [booking_id],
          total_amount_kobo: Math.round(totalKobo * 0.8),
        });
      }
    }

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
      id, user_id, vendor_id, service_name, service_price_kobo, transport_fee_kobo,
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

  // Fetch vendor with pioneer fields
  const { data: vendor } = await supabase
    .from('vendors')
    .select('full_name, email, push_token, pioneer, pioneer_bookings_completed, paystack_subaccount_code')
    .eq('id', booking.vendor_id)
    .single();

  // Pioneer commission logic: first PIONEER_BOOKINGS_THRESHOLD completed bookings get 100%
  const isPioneerBooking =
    vendor?.pioneer === true &&
    (vendor.pioneer_bookings_completed ?? PIONEER_BOOKINGS_THRESHOLD) < PIONEER_BOOKINGS_THRESHOLD;

  const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
  const settlement = calculateSettlement(totalKobo);
  const vendorAmountKobo = isPioneerBooking ? totalKobo : settlement.vendorAmountKobo;
  const varsNetKobo = isPioneerBooking ? 0 : settlement.varsNetKobo;

  // Mark booking as completed
  await supabase
    .from('bookings')
    .update({
      status: BOOKING_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  // Create payout_history record with settlement_queued status.
  // The actual bank transfer (subaccount → vendor's bank) is triggered by
  // VARS ops from the Paystack dashboard after this record is created.
  const { data: payout, error: payoutError } = await supabase
    .from('payout_history')
    .insert({
      booking_id: bookingId,
      vendor_id: booking.vendor_id,
      vendor_amount_kobo: vendorAmountKobo,
      vars_commission_kobo: varsNetKobo,
      status: 'settlement_queued',
    })
    .select('id')
    .single();

  // 23505 = unique_violation: payout already exists (race between cron + user confirm).
  // Treat as idempotent success — money is not double-moved.
  if (payoutError) {
    if ((payoutError as unknown as { code?: string }).code === '23505') {
      console.log(`Payout already exists for booking ${bookingId} (constraint race) — skipping`);
      return;
    }
    throw payoutError;
  }

  // Increment pioneer counter after booking completes.
  // The split was already set at transaction initialization; this counter
  // ensures the next booking at initialization time gets the correct split.
  if (isPioneerBooking) {
    await supabase.rpc('increment_pioneer_bookings_completed', { vendor_id_arg: booking.vendor_id });
    console.log(
      `Pioneer booking ${bookingId}: 100% to vendor subaccount, ` +
      `pioneer_bookings_completed incremented (was ${vendor.pioneer_bookings_completed ?? 0})/${PIONEER_BOOKINGS_THRESHOLD}`
    );
  } else {
    console.log(
      `Settlement queued: booking=${bookingId} payout=${payout?.id} ` +
      `₦${formatNaira(vendorAmountKobo)} to vendor ${booking.vendor_id} subaccount | ` +
      `VARS gross: ₦${formatNaira(settlement.varsCommissionKobo)}, ` +
      `Paystack fee: ₦${formatNaira(settlement.paystackFeeKobo)}, ` +
      `stamp duty: ₦${formatNaira(settlement.stampDutyKobo)}, ` +
      `VARS net: ₦${formatNaira(varsNetKobo)}`
    );
  }

  // Notify user: payment released (booking is done)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, push_token, email')
    .eq('id', booking.user_id)
    .single();

  const userMsg = msg_paymentReleased(vendor?.full_name ?? 'your vendor');
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

  // Notify vendor: their earnings are on the way
  const vendorMsg = msg_vendor_paymentReleased(formatNaira(vendorAmountKobo));
  await sendNotification({
    recipientId: booking.vendor_id,
    recipientType: 'vendor',
    type: 'vendor_payment_released',
    title: vendorMsg.title,
    body: vendorMsg.body,
    bookingId,
    pushToken: vendor?.push_token ?? null,
    data: { bookingId, amountKobo: vendorAmountKobo },
  });

  // Email: service complete — customer + vendor
  try {
    const customerFirstName = (profile?.full_name ?? '').split(' ')[0] || 'there';

    if (profile?.email) {
      const { subject, body } = email_serviceComplete_customer({
        customerFirstName,
        vendorName: vendor?.full_name ?? 'your vendor',
        service: booking.service_name,
        amount: `₦${formatNaira(totalKobo)}`,
      });
      await sendTransactionalEmail(profile.email, subject, body);
    }

    if (vendor?.email) {
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
