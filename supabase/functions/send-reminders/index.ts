// ============================================================
// VARS — send-reminders (cron, every 5 min)
// Sends appointment reminders at the 24-hour and 1-hour marks
// to both the customer and vendor.
// Uses the notifications table for idempotency — each reminder
// type is sent at most once per booking.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS, GATE_WINDOW_MINUTES, GATE_PROXIMITY_KM } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_reminder24h,
  msg_reminder1h,
  msg_vendor_reminder24h,
  msg_vendor_reminder1h,
  msg_vendor_reminder30min,
  msg_vendor_onWayNudge,
  formatTime,
} from '../_shared/notifications.ts';

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  let sent30min = 0;

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

  // ── 30-min pending booking nudge ─────────────────────────────
  // Vendor has 1 hour to accept. Nudge them at the halfway mark.
  const min30lo = new Date(now.getTime() - (30 + WINDOW_MINS) * 60 * 1000).toISOString();
  const min30hi = new Date(now.getTime() - (30 - WINDOW_MINS) * 60 * 1000).toISOString();

  const { data: pending30 } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id,
      profiles:user_id (full_name),
      vendors:vendor_id (push_token)
    `)
    .eq('status', BOOKING_STATUS.PENDING)
    .gte('created_at', min30lo)
    .lte('created_at', min30hi);

  for (const b of pending30 ?? []) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('booking_id', b.id)
      .eq('type', 'vendor_reminder_30min')
      .maybeSingle();
    if (existing) continue;

    const profile = (b as any).profiles as { full_name: string } | null;
    const vendor  = (b as any).vendors  as { push_token: string | null } | null;
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
    const msg = msg_vendor_reminder30min(clientFirstName);
    await sendNotification({
      recipientId: b.vendor_id,
      recipientType: 'vendor',
      type: 'vendor_reminder_30min',
      title: msg.title,
      body: msg.body,
      bookingId: b.id,
      pushToken: vendor?.push_token ?? null,
      data: { bookingId: b.id },
    });
    sent30min++;
    console.log(`send-reminders: 30min nudge sent for booking ${b.id}`);
  }

  // ── Gate window opens: nudge vendor to tap On My Way ─────────
  // Fires once when scheduled_at enters the GATE_WINDOW_MINUTES window.
  // Idempotent via on_way_nudge notification type.
  const gateWindowLo = new Date(now.getTime() + (GATE_WINDOW_MINUTES - WINDOW_MINS) * 60 * 1000).toISOString();
  const gateWindowHi = new Date(now.getTime() + (GATE_WINDOW_MINUTES + WINDOW_MINS) * 60 * 1000).toISOString();

  const { data: gateNudgeBookings } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id,
      profiles:user_id (full_name),
      vendors:vendor_id (push_token)
    `)
    .eq('status', BOOKING_STATUS.ACCEPTED)
    .eq('gate_fired', false)
    .gte('scheduled_at', gateWindowLo)
    .lte('scheduled_at', gateWindowHi);

  let sentGateNudge = 0;
  for (const b of gateNudgeBookings ?? []) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('booking_id', b.id)
      .eq('type', 'on_way_nudge')
      .maybeSingle();
    if (existing) continue;

    const profile = (b as unknown as Record<string, unknown>).profiles as { full_name: string } | null;
    const vendor  = (b as unknown as Record<string, unknown>).vendors  as { push_token: string | null } | null;
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
    const msg = msg_vendor_onWayNudge(clientFirstName);
    await sendNotification({
      recipientId: b.vendor_id,
      recipientType: 'vendor',
      type: 'on_way_nudge',
      title: msg.title,
      body: msg.body,
      bookingId: b.id,
      pushToken: vendor?.push_token ?? null,
      data: { bookingId: b.id },
    });
    sentGateNudge++;
    console.log(`send-reminders: on_way_nudge sent for booking ${b.id}`);
  }

  // ── Proximity gate detection ──────────────────────────────────
  // For each vendor's next accepted booking within the gate window,
  // check if the vendor is close enough to the customer to auto-fire the gate.
  // Only fires on the vendor's chronologically-next accepted booking.
  // Delegates actual gate logic (charge + status update) to paystack-gate.
  const gateWindowStart = now.toISOString();
  const gateWindowEnd   = new Date(now.getTime() + GATE_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Find all accepted bookings in the gate window that haven't fired yet
  const { data: proximityBookings } = await supabase
    .from('bookings')
    .select(`
      id, vendor_id, user_id,
      user_location_lat, user_location_lng, scheduled_at,
      vendors:vendor_id (vendor_current_lat, vendor_current_lng)
    `)
    .eq('status', BOOKING_STATUS.ACCEPTED)
    .eq('gate_fired', false)
    .gte('scheduled_at', gateWindowStart)
    .lte('scheduled_at', gateWindowEnd)
    .order('scheduled_at', { ascending: true });

  // Group by vendor — only process each vendor's NEXT booking
  const vendorNextBooking = new Map<string, (typeof proximityBookings)[0]>();
  for (const b of proximityBookings ?? []) {
    if (!vendorNextBooking.has(b.vendor_id)) {
      vendorNextBooking.set(b.vendor_id, b);
    }
  }

  let proximityGatesFired = 0;
  for (const [vendorId, booking] of vendorNextBooking) {
    const v = (booking as unknown as Record<string, unknown>).vendors as {
      vendor_current_lat: number | null;
      vendor_current_lng: number | null;
    } | null;

    if (
      v?.vendor_current_lat == null || v?.vendor_current_lng == null ||
      booking.user_location_lat == null || booking.user_location_lng == null
    ) continue;

    const distKm = haversineKm(
      v.vendor_current_lat, v.vendor_current_lng,
      booking.user_location_lat, booking.user_location_lng
    );

    if (distKm > GATE_PROXIMITY_KM) continue;

    console.log(
      `Proximity gate: vendor=${vendorId} dist=${distKm.toFixed(2)}km ` +
      `< ${GATE_PROXIMITY_KM}km → firing gate for booking=${booking.id}`
    );

    // Delegate to paystack-gate: atomic gate fire + charge
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const res = await fetch(`${supabaseUrl}/functions/v1/paystack-gate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ booking_id: booking.id, trigger_type: 'proximity' }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Proximity gate call failed for booking ${booking.id}: ${res.status} ${text}`);
      } else {
        proximityGatesFired++;
      }
    } catch (err) {
      console.error(`Proximity gate fetch error for booking ${booking.id}:`, err);
    }
  }

  return jsonResponse({
    sent_24h: sent24h,
    sent_1h: sent1h,
    sent_30min: sent30min,
    sent_gate_nudge: sentGateNudge,
    proximity_gates_fired: proximityGatesFired,
  });
});
