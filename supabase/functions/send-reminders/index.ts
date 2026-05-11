// ============================================================
// VARS — send-reminders (cron, every 5 min)
// Sends appointment reminders at the 24-hour and 1-hour marks
// to both the customer and vendor.
// Uses the notifications table for idempotency — each reminder
// type is sent at most once per booking.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_reminder24h,
  msg_reminder1h,
  msg_vendor_reminder24h,
  msg_vendor_reminder1h,
  formatTime,
} from '../_shared/notifications.ts';

const WINDOW_MINS = 5; // half the cron interval each side

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
  if (!isCronCall) return errorResponse('Unauthorized', 401);

  const supabase = createAdminClient();
  const now = new Date();

  let sent24h = 0;
  let sent1h = 0;

  // ── 24-hour reminders ────────────────────────────────────────
  const h24lo = new Date(now.getTime() + (24 * 60 - WINDOW_MINS) * 60 * 1000).toISOString();
  const h24hi = new Date(now.getTime() + (24 * 60 + WINDOW_MINS) * 60 * 1000).toISOString();

  const { data: bookings24h } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id, scheduled_at, service_name,
      profiles:user_id (full_name, push_token),
      vendors:vendor_id (full_name, push_token)
    `)
    .in('status', [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY])
    .gte('scheduled_at', h24lo)
    .lte('scheduled_at', h24hi);

  for (const b of bookings24h ?? []) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('booking_id', b.id)
      .eq('type', 'reminder_24h')
      .maybeSingle();
    if (existing) continue;

    const profile = (b as any).profiles as { full_name: string; push_token: string | null } | null;
    const vendor  = (b as any).vendors  as { full_name: string; push_token: string | null } | null;
    const vendorName      = vendor?.full_name ?? 'Your vendor';
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
    const time = formatTime(b.scheduled_at);

    if (profile) {
      const msg = msg_reminder24h(vendorName, time);
      await sendNotification({
        recipientId: b.user_id, recipientType: 'user',
        type: 'reminder_24h', title: msg.title, body: msg.body,
        bookingId: b.id, pushToken: profile.push_token,
        data: { bookingId: b.id },
      });
    }
    if (vendor) {
      const msg = msg_vendor_reminder24h(time, b.service_name, clientFirstName);
      await sendNotification({
        recipientId: b.vendor_id, recipientType: 'vendor',
        type: 'reminder_24h', title: msg.title, body: msg.body,
        bookingId: b.id, pushToken: vendor.push_token,
        data: { bookingId: b.id },
      });
    }
    sent24h++;
    console.log(`send-reminders: 24h reminder sent for booking ${b.id}`);
  }

  // ── 1-hour reminders ─────────────────────────────────────────
  const h1lo = new Date(now.getTime() + (60 - WINDOW_MINS) * 60 * 1000).toISOString();
  const h1hi = new Date(now.getTime() + (60 + WINDOW_MINS) * 60 * 1000).toISOString();

  const { data: bookings1h } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id, scheduled_at,
      profiles:user_id (full_name, push_token),
      vendors:vendor_id (full_name, push_token)
    `)
    .in('status', [BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ON_WAY])
    .gte('scheduled_at', h1lo)
    .lte('scheduled_at', h1hi);

  for (const b of bookings1h ?? []) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('booking_id', b.id)
      .eq('type', 'reminder_1h')
      .maybeSingle();
    if (existing) continue;

    const profile = (b as any).profiles as { full_name: string; push_token: string | null } | null;
    const vendor  = (b as any).vendors  as { full_name: string; push_token: string | null } | null;
    const vendorName      = vendor?.full_name ?? 'Your vendor';
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];

    if (profile) {
      const msg = msg_reminder1h(vendorName);
      await sendNotification({
        recipientId: b.user_id, recipientType: 'user',
        type: 'reminder_1h', title: msg.title, body: msg.body,
        bookingId: b.id, pushToken: profile.push_token,
        data: { bookingId: b.id },
      });
    }
    if (vendor) {
      const msg = msg_vendor_reminder1h(clientFirstName);
      await sendNotification({
        recipientId: b.vendor_id, recipientType: 'vendor',
        type: 'reminder_1h', title: msg.title, body: msg.body,
        bookingId: b.id, pushToken: vendor.push_token,
        data: { bookingId: b.id },
      });
    }
    sent1h++;
    console.log(`send-reminders: 1h reminder sent for booking ${b.id}`);
  }

  return jsonResponse({ sent_24h: sent24h, sent_1h: sent1h });
});
