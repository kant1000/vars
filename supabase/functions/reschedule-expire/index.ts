// ============================================================
// VARS — reschedule-expire (cron — runs hourly)
// Finds rescheduled_pending bookings whose reschedule_expires_at
// has passed, cancels them with a full refund, and notifies the vendor.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { PaystackClient } from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_reschedule_expired_vendor,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    if (!isCronCall) return errorResponse('Forbidden', 403);

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: expiredBookings } = await supabase
      .from('bookings')
      .select('id, user_id, vendor_id, service_price_kobo, paystack_reference')
      .eq('status', 'rescheduled_pending')
      .lte('reschedule_expires_at', nowIso);

    let expiredCount = 0;

    for (const booking of (expiredBookings ?? [])) {
      try {
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            cancelled_by: 'system',
            cancellation_reason: 'Reschedule suggestion expired — customer did not respond in time',
            cancellation_fee_percent: 0,
            cancellation_vars_amount_kobo: 0,
            cancellation_vendor_amount_kobo: 0,
            cancellation_refund_amount_kobo: booking.service_price_kobo,
            suggested_scheduled_at: null,
            reschedule_expires_at: null,
            updated_at: nowIso,
          })
          .eq('id', booking.id);

        if (booking.paystack_reference) {
          try {
            const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
            await paystack.refundTransaction({
              transaction: booking.paystack_reference,
              merchant_note: `VARS booking ${booking.id} — reschedule expired, full refund`,
            });
          } catch (err) {
            console.error(`Refund failed for booking ${booking.id}:`, err);
            // Don't throw — ops team handles manually
          }
        }

        const [{ data: vendorProfile }, { data: userProfile }] = await Promise.all([
          supabase.from('vendors').select('full_name, push_token').eq('id', booking.vendor_id).single(),
          supabase.from('profiles').select('full_name').eq('id', booking.user_id).single(),
        ]);

        const clientFirstName = (userProfile?.full_name ?? 'Customer').split(' ')[0];
        const msg = msg_reschedule_expired_vendor(clientFirstName);

        await sendNotification({
          recipientId: booking.vendor_id,
          recipientType: 'vendor',
          type: 'reschedule_expired',
          title: msg.title,
          body: msg.body,
          bookingId: booking.id,
          pushToken: vendorProfile?.push_token ?? null,
          data: { bookingId: booking.id },
        });

        expiredCount++;
      } catch (err) {
        console.error(`Failed to expire reschedule for booking ${booking.id}:`, err);
      }
    }

    console.log(`reschedule-expire: expired=${expiredCount}`);
    return jsonResponse({ expired: expiredCount });
  } catch (err) {
    console.error('reschedule-expire error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
