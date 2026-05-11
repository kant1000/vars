// ============================================================
// VARS — phone-reveal (cron, every 5 min)
// Finds accepted bookings whose scheduled_at is within 15 min
// from now, sets phone_revealed = true, and notifies both parties.
// Per spec §8: vendor gets customer number 15 min before appointment.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_reminder15min,
  msg_vendor_reminder15min,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
  if (!isCronCall) return errorResponse('Unauthorized', 401);

  const supabase = createAdminClient();

  const now = new Date();
  const revealCutoff = new Date(now.getTime() + 15 * 60 * 1000); // now + 15 min
  const staleFloor   = new Date(now.getTime() - 60 * 60 * 1000); // don't reveal for bookings >1hr past

  // Find accepted bookings whose reveal window has arrived
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id, scheduled_at,
      profiles:user_id (full_name, push_token, phone_number),
      vendors:vendor_id (full_name, push_token)
    `)
    .in('status', [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY, BOOKING_STATUS.ARRIVED])
    .eq('phone_revealed', false)
    .lte('scheduled_at', revealCutoff.toISOString())
    .gte('scheduled_at', staleFloor.toISOString());

  if (error) {
    console.error('phone-reveal: query failed', error);
    return errorResponse('DB error', 500);
  }

  if (!bookings || bookings.length === 0) {
    return jsonResponse({ revealed: 0 });
  }

  let revealedCount = 0;

  for (const booking of bookings) {
    // Mark phone as revealed
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ phone_revealed: true, phone_reveal_at: now.toISOString() })
      .eq('id', booking.id);

    if (updateErr) {
      console.error(`phone-reveal: failed to update booking ${booking.id}`, updateErr);
      continue;
    }

    const profile = booking.profiles as { full_name: string; push_token: string | null; phone_number: string | null } | null;
    const vendor  = booking.vendors  as { full_name: string; push_token: string | null } | null;

    const vendorName      = vendor?.full_name ?? 'Your vendor';
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];

    // Notify customer: vendor has your number now
    if (profile) {
      const msg = msg_reminder15min(vendorName);
      await sendNotification({
        recipientId:   booking.user_id,
        recipientType: 'user',
        type:          'phone_revealed',
        title:         msg.title,
        body:          msg.body,
        bookingId:     booking.id,
        pushToken:     profile.push_token,
        data:          { bookingId: booking.id },
      });
    }

    // Notify vendor: customer number is now visible in the app
    if (vendor) {
      const msg = msg_vendor_reminder15min(clientFirstName);
      await sendNotification({
        recipientId:   booking.vendor_id,
        recipientType: 'vendor',
        type:          'phone_revealed',
        title:         msg.title,
        body:          msg.body,
        bookingId:     booking.id,
        pushToken:     vendor.push_token,
        data:          { bookingId: booking.id },
      });
    }

    revealedCount++;
    console.log(`phone-reveal: booking ${booking.id} revealed`);
  }

  return jsonResponse({ revealed: revealedCount });
});
