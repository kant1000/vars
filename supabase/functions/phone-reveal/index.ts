// ============================================================
// VARS — phone-reveal (cron, every 5 min)
// Finds accepted bookings whose scheduled_at is within 15 min
// from now, sets phone_revealed = true, and notifies both parties.
// Per spec §8: vendor gets customer number 15 min before appointment.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS, PHONE_REVEAL_MINUTES_BEFORE } from '../_shared/constants.ts';
import {
  sendNotification,
  sendWhatsAppTemplate,
  msg_reminder15min,
  msg_vendor_reminder15min,
  whatsappPhoneRevealCustomerTemplate,
  whatsappPhoneRevealVendorTemplate,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
  if (!isCronCall) return errorResponse('Unauthorized', 401);

  const supabase = createAdminClient();

  const now = new Date();
  const revealCutoff = new Date(now.getTime() + PHONE_REVEAL_MINUTES_BEFORE * 60 * 1000);
  const staleFloor   = new Date(now.getTime() - 60 * 60 * 1000); // don't reveal for bookings >1hr past

  // Find accepted bookings whose reveal window has arrived
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id, scheduled_at, recipient_name,
      profiles:user_id (full_name, push_token, phone_number),
      vendors:vendor_id (full_name, push_token, phone_number)
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
    const vendor  = booking.vendors  as { full_name: string; push_token: string | null; phone_number: string | null } | null;

    const vendorName = vendor?.full_name ?? 'Your vendor';
    // The vendor is meeting whoever this booking is actually for — if it
    // carries its own recipient, that's who the vendor-facing notification
    // should name, not the account holder who booked and paid. The
    // customer-facing message doesn't need this: they already know who
    // they booked for.
    const clientFirstName = ((booking.recipient_name as string | null) ?? profile?.full_name ?? 'Client').split(' ')[0];

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

    // WhatsApp: notify out-of-band that the number is now visible in-app,
    // independent of push. Fires regardless of push outcome — critical
    // fallback if app is closed. Business-initiated, so Meta-approved HSM
    // templates are required — free-form text here was silently rejected
    // by Meta, and two attempts at embedding the raw number in the
    // template body were also rejected (reads like a spam/scam-callback
    // pattern to Meta's automated review). The template no longer carries
    // the number itself — only the in-app reveal does that.
    if (profile?.phone_number && vendor?.phone_number) {
      await sendWhatsAppTemplate(
        profile.phone_number,
        whatsappPhoneRevealCustomerTemplate({ vendorName }),
      );
      await sendWhatsAppTemplate(
        vendor.phone_number,
        whatsappPhoneRevealVendorTemplate({ customerFirstName: clientFirstName }),
      );
    } else {
      console.warn(`phone-reveal: missing phone number(s) for booking ${booking.id} — WhatsApp skipped`);
    }

    revealedCount++;
    console.log(`phone-reveal: booking ${booking.id} revealed`);
  }

  return jsonResponse({ revealed: revealedCount });
});
