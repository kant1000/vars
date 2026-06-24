// ============================================================
// VARS — vendor-cancel-booking
// Called when vendor taps "Cancel" on an accepted booking.
//
// Binary model based on gate state:
//
// Pre-gate (gate_fired = false):
//   Free cancel. No Paystack call. Transport buffers released.
//   Vendor cancellation count still tracked for rolling 30-day window.
//
// Post-gate (gate_fired = true):
//   Full refund to customer from VARS main balance.
//   Vendor account restricted (is_restricted = true) — owes VARS
//   the amount refunded. All vendor app functionality blocked until
//   restriction is lifted by admin after confirming repayment.
//   Vendor is taken offline immediately.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_vendor_selfCancelled,
  msg_cancelFree,
  msg_bookingCancelledFullRefund,
  msg_vendor_restricted,
  formatDate,
  formatTime,
  formatNaira,
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

    const { booking_id, reason } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id, gate_fired, gate_charged_at,
        service_price_kobo, transport_fee_kobo, service_name, scheduled_at,
        paystack_reference
      `)
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED].includes(booking.status)) {
      return errorResponse(`Cannot cancel booking with status: ${booking.status}`);
    }

    const serviceDate = formatDate(booking.scheduled_at);
    const serviceTime = formatTime(booking.scheduled_at);
    const totalKobo: number = (booking.service_price_kobo ?? 0) + ((booking as unknown as Record<string, number>).transport_fee_kobo ?? 0);

    // Release transport buffer blocks
    await supabase
      .from('vendor_calendar')
      .delete()
      .eq('transport_buffer_source_booking_id', booking_id);

    // Rolling 30-day cancellation count (tracked on both paths)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCancellations } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', user.id)
      .eq('cancelled_by', 'vendor')
      .gte('updated_at', thirtyDaysAgo);
    const cancelCount = recentCancellations ?? 0;

    // Fetch names for notifications
    const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
      supabase.from('vendors').select('full_name, push_token').eq('id', user.id).single(),
      supabase.from('profiles').select('full_name, push_token').eq('id', booking.user_id).single(),
    ]);
    const clientFirstName = (userProfile?.full_name ?? 'Client').split(' ')[0];

    // ── POST-GATE PATH ──────────────────────────────────────────
    if (booking.gate_fired) {
      await supabase
        .from('bookings')
        .update({
          status: BOOKING_STATUS.CANCELLED,
          cancelled_by: 'vendor',
          cancellation_reason: reason ?? 'Vendor cancelled after gate',
        })
        .eq('id', booking_id);

      // Full refund to customer
      if (booking.paystack_reference) {
        try {
          const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
          await paystack.refundTransaction({
            transaction: booking.paystack_reference,
            merchant_note: `Booking ${booking_id} cancelled by vendor post-gate — full refund`,
          });
          console.log(`Post-gate refund issued: booking=${booking_id} amount=₦${formatNaira(totalKobo)}`);
        } catch (err) {
          console.error(`Post-gate refund failed for booking ${booking_id}:`, err);
        }
      }

      // Restrict vendor — owes VARS the refunded amount
      await supabase
        .from('vendors')
        .update({
          is_restricted: true,
          is_online: false,
          restriction_amount_owed_kobo: totalKobo,
          restriction_reason: `Cancelled booking ${booking_id} after travel began. Customer was refunded ₦${formatNaira(totalKobo)}.`,
          restriction_repayment_claimed_at: null,
        })
        .eq('id', user.id);

      if (cancelCount >= 3) {
        await supabase.from('vendors').update({ cancellation_flagged: true }).eq('id', user.id);
      }

      // Notify customer — full refund
      const userMsg = msg_bookingCancelledFullRefund(serviceDate, serviceTime);
      await sendNotification({
        recipientId: booking.user_id,
        recipientType: 'user',
        type: 'vendor_cancelled_post_gate',
        title: userMsg.title,
        body: userMsg.body,
        bookingId: booking_id,
        pushToken: userProfile?.push_token ?? null,
        data: { bookingId: booking_id, screen: '/vendor-feed' },
      });

      // Notify vendor — account restricted
      const restrictMsg = msg_vendor_restricted(formatNaira(totalKobo));
      await sendNotification({
        recipientId: user.id,
        recipientType: 'vendor',
        type: 'account_restricted',
        title: restrictMsg.title,
        body: restrictMsg.body,
        bookingId: booking_id,
        pushToken: vendorProfile?.push_token ?? null,
        data: { bookingId: booking_id, amountKobo: totalKobo },
      });

      console.log(
        `Booking ${booking_id} cancelled by vendor post-gate — ` +
        `full refund ₦${formatNaira(totalKobo)}, vendor ${user.id} restricted`
      );

      return jsonResponse({
        success: true,
        booking_id,
        status: 'cancelled',
        gate_fired: true,
        vendor_restricted: true,
        cancellation_count_30d: cancelCount,
      });
    }

    // ── PRE-GATE PATH ───────────────────────────────────────────
    await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.CANCELLED,
        cancelled_by: 'vendor',
        cancellation_reason: reason ?? 'Vendor cancelled',
      })
      .eq('id', booking_id);

    if (cancelCount >= 3) {
      await supabase.from('vendors').update({ cancellation_flagged: true }).eq('id', user.id);
      console.log(`Vendor ${user.id} flagged: ${cancelCount} cancellations in 30 days`);
    }

    // Notify customer — free cancel, no charge
    const userMsg = msg_cancelFree();
    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'vendor_cancelled_free',
      title: userMsg.title,
      body: userMsg.body,
      bookingId: booking_id,
      pushToken: userProfile?.push_token ?? null,
      data: { bookingId: booking_id, screen: '/vendor-feed' },
    });

    // Notify vendor — confirmation
    const vendorMsg = msg_vendor_selfCancelled(clientFirstName, booking.service_name ?? 'service');
    await sendNotification({
      recipientId: user.id,
      recipientType: 'vendor',
      type: 'vendor_self_cancelled',
      title: vendorMsg.title,
      body: vendorMsg.body,
      bookingId: booking_id,
      pushToken: vendorProfile?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(
      `Booking ${booking_id} cancelled by vendor pre-gate (no charge) — ` +
      `30-day cancel count: ${cancelCount}${cancelCount >= 3 ? ' [FLAGGED]' : ''}`
    );

    return jsonResponse({
      success: true,
      booking_id,
      status: 'cancelled',
      gate_fired: false,
      vendor_restricted: false,
      cancellation_count_30d: cancelCount,
    });
  } catch (err) {
    console.error('vendor-cancel-booking error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
