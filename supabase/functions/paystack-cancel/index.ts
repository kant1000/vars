// ============================================================
// VARS — paystack-cancel
// Called when user taps "Cancel" on live experience screen.
// Applies cancellation fee per spec §5 policy table,
// refunds the appropriate amount, and notifies both parties.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient, calculateCancellationFee } from '../_shared/paystack.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_cancelTier1,
  msg_cancelTier2,
  msg_cancelNonRefundable,
  msg_vendor_userCancelledWithFee,
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

    // Fetch booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id,
        service_price_kobo, transport_fee_kobo, service_name, scheduled_at,
        paystack_reference, created_at
      `)
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    // Only pending or accepted bookings can be cancelled by user
    if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED].includes(booking.status)) {
      return errorResponse(`Cannot cancel booking with status: ${booking.status}`);
    }

    const cancelledAt = new Date();
    // Cancellation fee applies to the full amount charged to customer (service + transport)
    const totalKobo = booking.service_price_kobo + ((booking as any).transport_fee_kobo ?? 0);
    const { feePercent, varsAmountKobo, vendorAmountKobo, refundAmountKobo } =
      calculateCancellationFee({
        servicePriceKobo: totalKobo,
        bookingCreatedAt: new Date(booking.created_at),
        scheduledAt: new Date(booking.scheduled_at),
        cancelledAt,
      });

    // 1. Update booking status to cancelled
    await supabase
      .from('bookings')
      .update({
        status: BOOKING_STATUS.CANCELLED,
        cancelled_by: 'user',
        cancellation_reason: reason ?? 'User cancelled',
        cancellation_fee_percent: feePercent,
        cancellation_vars_amount_kobo: varsAmountKobo,
        cancellation_vendor_amount_kobo: vendorAmountKobo,
        cancellation_refund_amount_kobo: refundAmountKobo,
      })
      .eq('id', booking_id);

    // Release transport buffer blocks tied to this booking
    await supabase
      .from('vendor_calendar')
      .delete()
      .eq('transport_buffer_source_booking_id', booking_id);

    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    // 2. Process Paystack refund (partial or none depending on tier)
    if (refundAmountKobo > 0 && booking.paystack_reference) {
      try {
        await paystack.refundTransaction({
          transaction: booking.paystack_reference,
          amount: refundAmountKobo,
          merchant_note: `VARS booking ${booking_id} cancelled — ${feePercent}% fee applied`,
        });
      } catch (err) {
        console.error(`Refund failed for booking ${booking_id}:`, err);
        // Don't throw — booking is cancelled, refund ops team handles manually
      }
    }

    // 3. Transfer vendor's cancellation share (if any)
    if (vendorAmountKobo > 0 && booking.status === BOOKING_STATUS.ACCEPTED) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('paystack_recipient_code, full_name, push_token')
        .eq('id', booking.vendor_id)
        .single();

      if (vendor?.paystack_recipient_code) {
        try {
          await paystack.initiateTransfer({
            source: 'balance',
            amount: vendorAmountKobo,
            recipient: vendor.paystack_recipient_code,
            reason: `VARS booking ${booking_id} cancelled — vendor cancellation share`,
          });

          // Notify vendor of their share
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', booking.user_id)
            .single();

          const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
          const vendorMsg = msg_vendor_userCancelledWithFee(clientFirstName, formatNaira(vendorAmountKobo));
          await sendNotification({
            recipientId: booking.vendor_id,
            recipientType: 'vendor',
            type: 'user_cancelled_with_fee',
            title: vendorMsg.title,
            body: vendorMsg.body,
            bookingId: booking_id,
            pushToken: vendor.push_token ?? null,
            data: { bookingId: booking_id, amountKobo: vendorAmountKobo },
          });
        } catch (err) {
          console.error(`Vendor cancellation share transfer failed:`, err);
        }
      }
    }

    // 4. Notify user with appropriate VARS brand voice message
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', user.id)
      .single();

    let userMsg: { title: string; body: string };
    let notificationType: string;

    if (feePercent === 100) {
      userMsg = msg_cancelNonRefundable();
      notificationType = 'cancel_non_refundable';
    } else if (feePercent === 15) {
      userMsg = msg_cancelTier1(formatNaira(refundAmountKobo));
      notificationType = 'cancel_0_15';
    } else {
      userMsg = msg_cancelTier2(formatNaira(refundAmountKobo));
      notificationType = 'cancel_15_60';
    }

    await sendNotification({
      recipientId: user.id,
      recipientType: 'user',
      type: notificationType,
      title: userMsg.title,
      body: userMsg.body,
      bookingId: booking_id,
      pushToken: userProfile?.push_token ?? null,
      data: {
        bookingId: booking_id,
        feePercent,
        refundAmountKobo,
      },
    });

    console.log(
      `Booking ${booking_id} cancelled — ` +
      `fee: ${feePercent}%, refund: ₦${formatNaira(refundAmountKobo)}, ` +
      `vendor share: ₦${formatNaira(vendorAmountKobo)}, VARS: ₦${formatNaira(varsAmountKobo)}`
    );

    return jsonResponse({
      success: true,
      booking_id,
      status: 'cancelled',
      fee_percent: feePercent,
      refund_amount_kobo: refundAmountKobo,
    });
  } catch (err) {
    console.error('paystack-cancel error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
