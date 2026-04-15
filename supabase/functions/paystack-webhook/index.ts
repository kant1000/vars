// ============================================================
// VARS — paystack-webhook
// Receives all Paystack webhook events.
// MUST verify HMAC-SHA512 signature before processing.
//
// Handled events:
//   charge.success       → create booking, notify vendor
//   transfer.success     → update payout_history to success
//   transfer.failed      → update payout_history to failed, alert admin
//   charge.dispute.create → flag booking, alert admin
// ============================================================

import { createAdminClient } from '../_shared/supabase.ts';
import { verifyWebhookSignature, PaystackClient } from '../_shared/paystack.ts';
import {
  sendNotification,
  msg_paymentAuthorized,
  msg_autoAccepted,
  msg_vendor_newBooking,
  msg_vendor_autoAccepted,
  msg_vendor_paymentReleased,
  formatDate,
  formatTime,
  formatNaira,
} from '../_shared/notifications.ts';

// ── Haversine distance (km) ─────────────────────────────────
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;

  // Security: reject any request with invalid signature
  const isValid = await verifyWebhookSignature(payload, signature, secretKey);
  if (!isValid) {
    console.warn('Invalid Paystack webhook signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = createAdminClient();
  console.log(`Paystack webhook: ${event.event}`);

  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(supabase, event.data);
        break;

      case 'transfer.success':
        await handleTransferSuccess(supabase, event.data);
        break;

      case 'transfer.failed':
      case 'transfer.reversed':
        await handleTransferFailed(supabase, event.data);
        break;

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.event}:`, err);
    // Return 200 to prevent Paystack from retrying — log for manual review
    return new Response('Handled with error', { status: 200 });
  }

  return new Response('OK', { status: 200 });
});

// ============================================================
// HANDLERS
// ============================================================

async function handleChargeSuccess(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const bookingMeta = metadata.vars_booking as Record<string, unknown> | undefined;

  if (!bookingMeta) {
    // Not a VARS booking transaction — ignore
    console.log(`charge.success for non-booking reference: ${reference}`);
    return;
  }

  // Idempotency: check if booking already created for this reference
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (existing) {
    console.log(`Booking already exists for reference ${reference} — skipping`);
    return;
  }

  const {
    user_id,
    vendor_id,
    vendor_service_id,
    service_name,
    service_price_kobo,
    service_duration_blocks,
    scheduled_at,
    user_location_lat,
    user_location_lng,
    user_location_address,
  } = bookingMeta as Record<string, unknown>;

  // Build PostGIS point from lat/lng
  const userLocationPoint = `POINT(${user_location_lng} ${user_location_lat})`;

  // ── Check auto-accept conditions ──────────────────────────
  const scheduledStr = scheduled_at as string;
  const userLat = user_location_lat as number;
  const userLng = user_location_lng as number;

  const autoAcceptResult = await checkAutoAccept(
    supabase,
    vendor_id as string,
    scheduledStr,
    service_duration_blocks as number,
    userLat,
    userLng
  );

  // ── Create the booking record ──────────────────────────────
  const now = new Date();
  const graceExpiry = new Date(now.getTime() + 5 * 60 * 1000); // +5 min

  // auto_release_at = scheduled end time + 1 hour (fixed wall-clock, not relative to service_rendered)
  const scheduledEnd = new Date(
    new Date(scheduledStr).getTime() + (service_duration_blocks as number) * 30 * 60 * 1000
  );
  const autoReleaseAt = new Date(scheduledEnd.getTime() + 60 * 60 * 1000);

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      user_id,
      vendor_id,
      vendor_service_id,
      service_name,
      service_price_kobo,
      service_duration_blocks,
      scheduled_at,
      user_location: userLocationPoint,
      user_location_address: user_location_address ?? null,
      status: autoAcceptResult.shouldAutoAccept ? 'accepted' : 'pending',
      paystack_reference: reference,
      paystack_authorization_code: (data.authorization as Record<string, unknown>)?.authorization_code ?? null,
      payment_captured: false,
      // auto_release fires 1 hour after the scheduled booking end time
      auto_release_at: autoReleaseAt.toISOString(),
      // Auto-accept fields
      auto_accepted: autoAcceptResult.shouldAutoAccept,
      auto_accept_grace_expires_at: autoAcceptResult.shouldAutoAccept
        ? graceExpiry.toISOString()
        : null,
      // Timestamps
      accepted_at: autoAcceptResult.shouldAutoAccept ? now.toISOString() : null,
    })
    .select('id, vendor_id, user_id')
    .single();

  if (bookingError || !booking) {
    console.error('Failed to create booking:', bookingError);
    throw new Error('Booking creation failed');
  }

  console.log(`Booking created: ${booking.id} (auto_accept=${autoAcceptResult.shouldAutoAccept})`);

  // ── Create transport buffer blocks if auto-accepted ────────
  if (autoAcceptResult.shouldAutoAccept) {
    await createTransportBuffers(
      supabase,
      vendor_id as string,
      booking.id,
      scheduledStr,
      service_duration_blocks as number
    );
  }

  // ── Fetch vendor and user details for notifications ────────
  const [{ data: vendor }, { data: profile }] = await Promise.all([
    supabase.from('vendors').select('full_name, push_token').eq('id', vendor_id).single(),
    supabase.from('profiles').select('full_name, push_token').eq('id', user_id).single(),
  ]);

  const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
  const vendorName = vendor?.full_name ?? 'Your vendor';

  if (autoAcceptResult.shouldAutoAccept) {
    // Auto-accept: user sees instant confirmation
    if (profile) {
      const msg = msg_autoAccepted(vendorName, formatDate(scheduledStr), formatTime(scheduledStr));
      await sendNotification({
        recipientId: user_id as string,
        recipientType: 'user',
        type: 'booking_auto_accepted',
        title: msg.title,
        body: msg.body,
        bookingId: booking.id,
        pushToken: profile.push_token,
        data: { bookingId: booking.id, autoAccepted: true },
      });
    }
    // Vendor: auto-accepted with 5-min grace notice
    if (vendor) {
      const msg = msg_vendor_autoAccepted(
        clientFirstName,
        service_name as string,
        formatDate(scheduledStr),
        formatTime(scheduledStr)
      );
      await sendNotification({
        recipientId: vendor_id as string,
        recipientType: 'vendor',
        type: 'booking_auto_accepted',
        title: msg.title,
        body: msg.body,
        bookingId: booking.id,
        pushToken: vendor.push_token,
        data: { bookingId: booking.id, autoAccepted: true, graceExpiresAt: graceExpiry.toISOString() },
      });
    }
  } else {
    // Normal flow: user waits up to 2 hours
    if (profile) {
      const msg = msg_paymentAuthorized(vendorName);
      await sendNotification({
        recipientId: user_id as string,
        recipientType: 'user',
        type: 'payment_authorized',
        title: msg.title,
        body: msg.body,
        bookingId: booking.id,
        pushToken: profile.push_token,
        data: { bookingId: booking.id },
      });
    }
    if (vendor) {
      const msg = msg_vendor_newBooking(
        clientFirstName,
        service_name as string,
        formatDate(scheduledStr),
        formatTime(scheduledStr)
      );
      await sendNotification({
        recipientId: vendor_id as string,
        recipientType: 'vendor',
        type: 'new_booking_request',
        title: msg.title,
        body: msg.body,
        bookingId: booking.id,
        pushToken: vendor.push_token,
        data: { bookingId: booking.id },
      });
    }
  }
}

// ── Auto-accept condition checker ────────────────────────────
async function checkAutoAccept(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  scheduledAt: string,
  durationBlocks: number,
  userLat: number,
  userLng: number
): Promise<{ shouldAutoAccept: boolean; reason?: string }> {
  // Fetch vendor auto-accept settings
  const { data: vendor } = await supabase
    .from('vendors')
    .select(`
      auto_accept_enabled,
      auto_accept_paused_due_to_drift,
      auto_accept_zone_confirmed_date,
      auto_accept_zone_lat,
      auto_accept_zone_lng,
      auto_accept_zone_radius_km
    `)
    .eq('id', vendorId)
    .single();

  if (!vendor?.auto_accept_enabled) {
    return { shouldAutoAccept: false, reason: 'auto_accept not enabled' };
  }
  if (vendor.auto_accept_paused_due_to_drift) {
    return { shouldAutoAccept: false, reason: 'vendor drifted from zone' };
  }

  // Zone must be confirmed today
  const today = new Date().toISOString().slice(0, 10);
  if (vendor.auto_accept_zone_confirmed_date !== today) {
    return { shouldAutoAccept: false, reason: 'zone not confirmed today' };
  }

  // Zone must be configured
  if (
    vendor.auto_accept_zone_lat == null ||
    vendor.auto_accept_zone_lng == null ||
    vendor.auto_accept_zone_radius_km == null
  ) {
    return { shouldAutoAccept: false, reason: 'zone not configured' };
  }

  // Condition 2: user must be within zone radius
  const userDistanceKm = haversineKm(
    userLat, userLng,
    vendor.auto_accept_zone_lat,
    vendor.auto_accept_zone_lng
  );
  if (userDistanceKm > vendor.auto_accept_zone_radius_km) {
    return { shouldAutoAccept: false, reason: `user ${userDistanceKm.toFixed(1)}km outside zone (radius ${vendor.auto_accept_zone_radius_km}km)` };
  }

  // Condition 1: the booked time slot must have block_state = 'auto_accept'
  const slotStart = new Date(scheduledAt);
  const slotEnd = new Date(slotStart.getTime() + durationBlocks * 30 * 60 * 1000);

  // Check if ALL 30-min blocks of the booking duration are auto_accept
  const { data: calendarBlocks } = await supabase
    .from('vendor_calendar')
    .select('block_state')
    .eq('vendor_id', vendorId)
    .lt('start_time', slotEnd.toISOString())
    .gt('end_time', slotStart.toISOString());

  // Any unavailable or transport_buffer block prevents auto-accept
  const blockers = (calendarBlocks ?? []).filter(
    (b) => b.block_state === 'unavailable' || b.block_state === 'transport_buffer'
  );
  if (blockers.length > 0) {
    return { shouldAutoAccept: false, reason: 'slot blocked (unavailable or transport_buffer)' };
  }

  // At least one auto_accept block must cover the start of the slot
  const { data: autoBlocks } = await supabase
    .from('vendor_calendar')
    .select('start_time, end_time, block_state')
    .eq('vendor_id', vendorId)
    .eq('block_state', 'auto_accept')
    .lte('start_time', slotStart.toISOString())
    .gt('end_time', slotStart.toISOString());

  if (!autoBlocks || autoBlocks.length === 0) {
    return { shouldAutoAccept: false, reason: 'slot not marked as auto_accept' };
  }

  console.log(`Auto-accept: all conditions met for vendor ${vendorId}, slot ${scheduledAt}`);
  return { shouldAutoAccept: true };
}

// ── Transport buffer creator ─────────────────────────────────
// Creates two 30-min blocks immediately after the confirmed booking ends.
// Rules:
//   • Both blocks are AFTER the booking only (no before-buffer)
//   • Skip a block if it would end after 22:00 (outside working hours)
//   • Skip a block if a calendar entry already exists at that start time
async function createTransportBuffers(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  bookingId: string,
  scheduledAt: string,
  durationBlocks: number
): Promise<void> {
  const bookingStart = new Date(scheduledAt);
  const bookingEnd = new Date(bookingStart.getTime() + durationBlocks * 30 * 60 * 1000);

  // Working hours boundary relative to the booking's day (UTC)
  const dayOf = (d: Date) => {
    const base = new Date(d);
    base.setUTCHours(0, 0, 0, 0);
    return base;
  };
  const workEnd = (d: Date) => new Date(dayOf(d).getTime() + 22 * 60 * 60 * 1000);

  // Two consecutive 30-min after-buffers
  const buf1Start = bookingEnd;
  const buf1End   = new Date(bookingEnd.getTime() + 30 * 60 * 1000);
  const buf2Start = buf1End;
  const buf2End   = new Date(buf1End.getTime() + 30 * 60 * 1000);

  const candidates: { start: Date; end: Date }[] = [];

  // Add each block only if it fits within working hours
  if (buf1End <= workEnd(buf1End)) {
    candidates.push({ start: buf1Start, end: buf1End });
  }
  if (buf2End <= workEnd(buf2End)) {
    candidates.push({ start: buf2Start, end: buf2End });
  }

  if (candidates.length === 0) return;

  // For each candidate buffer slot, check if a block already exists
  const inserts: Record<string, unknown>[] = [];
  for (const { start, end } of candidates) {
    const { data: existing } = await supabase
      .from('vendor_calendar')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('start_time', start.toISOString())
      .maybeSingle();

    if (!existing) {
      inserts.push({
        vendor_id: vendorId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        block_state: 'transport_buffer',
        transport_buffer_source_booking_id: bookingId,
      });
    }
  }

  if (inserts.length === 0) {
    console.log(`Transport buffers for booking ${bookingId}: slots already occupied, skipped.`);
    return;
  }

  const { error } = await supabase.from('vendor_calendar').insert(inserts);
  if (error) {
    console.error(`Failed to create transport buffers for booking ${bookingId}:`, error);
  } else {
    console.log(`Transport buffers created for booking ${bookingId} (${inserts.length} block(s))`);
  }
}

async function handleTransferSuccess(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  const transferCode = data.transfer_code as string;
  const reference = data.reference as string;

  // Update payout_history
  const { data: payout } = await supabase
    .from('payout_history')
    .update({
      status: 'success',
      settled_at: new Date().toISOString(),
      paystack_transfer_code: transferCode,
    })
    .eq('paystack_transfer_reference', reference)
    .select('vendor_id, vendor_amount_kobo, booking_id')
    .single();

  if (!payout) {
    console.warn(`transfer.success: no payout record found for reference ${reference}`);
    return;
  }

  // Notify vendor: payment is on its way
  const { data: vendor } = await supabase
    .from('vendors')
    .select('push_token')
    .eq('id', payout.vendor_id)
    .single();

  const msg = msg_vendor_paymentReleased(formatNaira(payout.vendor_amount_kobo));
  await sendNotification({
    recipientId: payout.vendor_id,
    recipientType: 'vendor',
    type: 'vendor_payment_released',
    title: msg.title,
    body: msg.body,
    bookingId: payout.booking_id,
    pushToken: vendor?.push_token ?? null,
    data: { bookingId: payout.booking_id, amountKobo: payout.vendor_amount_kobo },
  });

  console.log(`Transfer success: ${transferCode} — vendor ${payout.vendor_id} paid ₦${formatNaira(payout.vendor_amount_kobo)}`);
}

async function handleTransferFailed(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;
  const reason = (data.gateway_response as string) ?? 'Unknown reason';

  await supabase
    .from('payout_history')
    .update({ status: 'failed' })
    .eq('paystack_transfer_reference', reference);

  // Log for admin visibility — in production this should alert the ops team
  console.error(`TRANSFER FAILED: ref=${reference} reason=${reason}`);
}
