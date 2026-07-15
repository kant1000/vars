// ============================================================
// VARS — paystack-release
// Called when vendor declines a booking OR when the 1-hour
// response window expires (via cron job).
//
// In the gate model, no money is charged until the vendor taps
// "On My Way". Pending/accepted bookings that expire or are
// declined require NO Paystack call — nothing to refund.
//
// Also handles the admin path: dispute resolved in user's favour,
// which DOES issue a full refund (money moved at gate).
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_vendorDeclines,
  msg_vendor_bookingExpired,
  msg_vendor_gatePaymentExpired,
  msg_gatePaymentExpired,
  msg_disputeResolved_userRefunded,
  formatNaira,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();

    const authHeader = req.headers.get('Authorization');
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    const isAdminCall = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    if (!authHeader && !isCronCall) {
      return errorResponse('Missing authorization', 401);
    }

    // --------------------------------------------------------
    // ADMIN MODE: dispute resolved in user's favour — refund customer
    // This booking has been charged (gate fired before dispute), so
    // a real Paystack refund is required.
    // --------------------------------------------------------
    if (isAdminCall) {
      const { booking_id } = await req.json();
      if (!booking_id) return errorResponse('Missing booking_id');

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, user_id, vendor_id, paystack_reference, service_price_kobo, transport_fee_kobo')
        .eq('id', booking_id)
        .single();

      if (!booking) return errorResponse('Booking not found', 404);

      await supabase
        .from('bookings')
        .update({
          status: BOOKING_STATUS.CANCELLED,
          cancelled_by: 'admin',
          cancellation_reason: 'Dispute resolved — user refunded',
        })
        .eq('id', booking_id);

      // Full refund from VARS main account.
      // NOTE: if booking is already settled (vendor's subaccount share moved to their
      // bank), Paystack only refunds the VARS portion. Recovering the vendor's share
      // requires manual reconciliation. Ops must check payout_history before issuing.
      if (booking.paystack_reference) {
        try {
          const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
          await paystack.refundTransaction({
            transaction: booking.paystack_reference,
            merchant_note: `Dispute ${booking_id} resolved in user favour — full refund`,
          });
        } catch (err) {
          console.error(`Dispute refund failed for booking ${booking_id}:`, err);
        }
      }

      const { data: profile } = await supabase
        .from('profiles').select('push_token').eq('id', booking.user_id).single();
      const totalKobo = (booking.service_price_kobo ?? 0) + ((booking as unknown as Record<string, number>).transport_fee_kobo ?? 0);
      const msg = msg_disputeResolved_userRefunded(formatNaira(totalKobo));
      await sendNotification({
        recipientId: booking.user_id,
        recipientType: 'user',
        type: 'dispute_resolved_user',
        title: msg.title,
        body: msg.body,
        bookingId: booking_id,
        pushToken: profile?.push_token ?? null,
        data: { bookingId: booking_id },
      });

      // Clear settlement_on_hold if no other open/under-review disputes remain
      // for this vendor. Mirrors the same check in paystack-settle admin path.
      const { data: vendorBookingRows } = await supabase
        .from('bookings')
        .select('id')
        .eq('vendor_id', booking.vendor_id);
      const vendorBookingIds = (vendorBookingRows ?? []).map((b: { id: string }) => b.id);

      const { count: remainingOpen } = await supabase
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .in('booking_id', vendorBookingIds)
        .in('status', ['open', 'under_review']);

      if (remainingOpen === 0) {
        await supabase
          .from('vendors')
          .update({ settlement_on_hold: false })
          .eq('id', booking.vendor_id);
        console.log(`Vendor ${booking.vendor_id}: settlement_on_hold cleared — no remaining open disputes`);
      }

      console.log(`Dispute resolved (user): booking ${booking_id} refunded`);
      return jsonResponse({ success: true, booking_id, status: 'refunded' });
    }

    // --------------------------------------------------------
    // CRON MODE: two sweeps —
    //   (1) pending bookings past the 1-hour vendor-response window (pre-gate, no refund)
    //   (2) gate-fired accepted bookings where the customer's payment window has expired
    //       (gate fired but charge never succeeded — no Paystack call needed)
    // --------------------------------------------------------
    if (isCronCall) {
      const now = new Date().toISOString();
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

      // ── Sweep 1: pending timeout (vendor didn't respond) ────
      // UPDATE...RETURNING is atomic — concurrent cron runs can't both claim the same row.
      const { data: expiredPending } = await supabase
        .from('bookings')
        .update({
          status: BOOKING_STATUS.EXPIRED,
          cancelled_by: 'system',
          cancellation_reason: 'Vendor did not respond',
        })
        .eq('status', BOOKING_STATUS.PENDING)
        .lt('created_at', oneHourAgo)
        .select('id, user_id, vendor_id');

      let expiredCount = 0;
      for (const booking of expiredPending ?? []) {
        await notifyExpired(supabase, booking);
        expiredCount++;
      }

      // ── Sweep 2: gate-fired bookings where payment window expired ──
      const { data: expiredGate } = await supabase
        .from('bookings')
        .update({
          status: BOOKING_STATUS.CANCELLED,
          cancelled_by: 'system',
          cancellation_reason: 'Gate payment window expired — charge never completed',
        })
        .eq('status', BOOKING_STATUS.ACCEPTED)
        .eq('gate_fired', true)
        .is('gate_charged_at', null)
        .lt('gate_retry_expires_at', now)
        .select('id, user_id, vendor_id');

      let gateExpiredCount = 0;
      for (const booking of expiredGate ?? []) {
        await notifyGateExpired(supabase, booking);
        gateExpiredCount++;
      }

      return jsonResponse({ expired: expiredCount, gate_expired: gateExpiredCount });
    }

    // --------------------------------------------------------
    // VENDOR DECLINE MODE: vendor taps "Decline"
    // No Paystack call — gate has never fired on pending bookings.
    // --------------------------------------------------------
    const authClient = createAuthClient(authHeader!);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, vendor_id, user_id')
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);
    if (booking.status !== BOOKING_STATUS.PENDING) {
      return errorResponse(`Cannot decline booking with status: ${booking.status}`);
    }

    await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.EXPIRED,
        cancelled_by: 'system',
        cancellation_reason: 'Vendor declined',
      })
      .eq('id', booking_id);

    await notifyExpired(supabase, booking, 'decline');
    return jsonResponse({ success: true, booking_id, status: 'expired' });
  } catch (err) {
    console.error('paystack-release error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ============================================================
// Gate-payment expiry: send notifications after the atomic UPDATE
// already cancelled the booking. No Paystack refund — no money moved.
// ============================================================
async function notifyGateExpired(
  supabase: ReturnType<typeof createAdminClient>,
  booking: { id: string; user_id: string; vendor_id: string }
) {
  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('push_token, full_name').eq('id', booking.user_id).single(),
    supabase.from('vendors').select('push_token').eq('id', booking.vendor_id).single(),
  ]);

  // Customer notification
  const userMsg = msg_gatePaymentExpired();
  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: 'gate_payment_expired',
    title: userMsg.title,
    body: userMsg.body,
    bookingId: booking.id,
    pushToken: profile?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  // Vendor notification
  const clientFirstName = (profile?.full_name ?? 'Your client').split(' ')[0];
  const vendorMsg = msg_vendor_gatePaymentExpired(clientFirstName);
  await sendNotification({
    recipientId: booking.vendor_id,
    recipientType: 'vendor',
    type: 'vendor_gate_payment_expired',
    title: vendorMsg.title,
    body: vendorMsg.body,
    bookingId: booking.id,
    pushToken: vendor?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  console.log(`Gate-expiry: booking ${booking.id} cancelled (customer payment window closed)`);
}

// ============================================================
// Notify parties after a pending booking has timed out (cron) or
// been declined (vendor tap). DB update is done by the caller.
// ============================================================
async function notifyExpired(
  supabase: ReturnType<typeof createAdminClient>,
  booking: { id: string; user_id: string; vendor_id: string },
  reason: 'decline' | 'timeout' = 'timeout'
) {
  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('push_token').eq('id', booking.user_id).single(),
    supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
  ]);

  const userMsg = msg_vendorDeclines(vendor?.full_name ?? 'Your vendor');
  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: 'vendor_declines',
    title: userMsg.title,
    body: userMsg.body,
    bookingId: booking.id,
    pushToken: profile?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  if (reason === 'timeout' && vendor) {
    const vendorMsg = msg_vendor_bookingExpired();
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'booking_expired',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking.id,
      pushToken: vendor.push_token ?? null,
      data: { bookingId: booking.id },
    });
  }
}
