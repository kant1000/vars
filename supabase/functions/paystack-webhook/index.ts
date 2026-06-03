// ============================================================
// VARS — paystack-webhook
// Receives all Paystack webhook events.
// MUST verify HMAC-SHA512 signature before processing.
//
// Handled events:
//   charge.success        → create booking, notify vendor
//   transfer.success      → update payout_history to success
//   transfer.failed       → update payout_history to failed, alert admin
//   transfer.reversed     → update payout_history to failed, alert admin
//   charge.dispute.create → freeze auto_release, alert admin (bank chargeback)
//   refund.processed      → log success for audit trail
//   refund.failed         → log failure for manual ops review
// ============================================================

import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import { verifyWebhookSignature, PaystackClient } from '../_shared/paystack.ts';
import { createTransportBuffers, createPreTransportBuffers } from '../_shared/calendar.ts';
import { isSlotFree } from '../_shared/slot.ts';
import {
  sendNotification,
  sendTransactionalEmail,
  msg_paymentAuthorized,
  msg_autoAccepted,
  msg_vendor_newBooking,
  msg_vendor_autoAccepted,
  msg_vendor_paymentReleased,
  email_bookingConfirmed_customer,
  email_bookingConfirmed_vendor,
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

      case 'charge.dispute.create':
        await handleChargeDispute(supabase, event.data);
        break;

      case 'refund.processed':
      case 'refund.failed':
        await handleRefundUpdate(event.event, event.data);
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
    console.log(`charge.success for non-booking reference: ${reference}`);
    return;
  }

  // Idempotency: skip if booking already created
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
    service_ids,
    service_summary: metaServiceSummary,
    total_service_kobo: metaTotalServiceKobo,
    total_duration_blocks: metaTotalDurationBlocks,
    scheduled_at,
    user_location_lat,
    user_location_lng,
    user_location_address,
    access_building,
    access_floor,
    access_flat,
    access_code,
    transport_fee_kobo: metaTransportFeeKobo,
    distance_km: metaDistanceKm,
    pre_transport_buffer_slots: metaPreBufferSlots,
  } = bookingMeta as Record<string, unknown>;

  const transportFeeKobo = (metaTransportFeeKobo as number) ?? 0;
  const distanceKm       = (metaDistanceKm as number)       ?? 0;
  const preBufferSlots   = (metaPreBufferSlots as number)    ?? 0;

  // Re-fetch services server-side to verify prices haven't changed
  const serviceIdList = service_ids as string[];
  const { data: services, error: svError } = await supabase
    .from('vendor_services')
    .select('id, service_name, price_kobo, duration_blocks')
    .in('id', serviceIdList);

  if (svError || !services || services.length !== serviceIdList.length) {
    console.error('handleChargeSuccess: could not re-fetch services', svError);
    throw new Error('Service validation failed');
  }

  // Server-side total (authoritative)
  const totalServiceKobo   = services.reduce((s, sv) => s + sv.price_kobo, 0);
  const totalDurationBlocks = services.reduce((s, sv) => s + sv.duration_blocks, 0);

  // Warn if price diverged between initialize and webhook (vendor edited between payment init and charge)
  if (totalServiceKobo !== (metaTotalServiceKobo as number)) {
    console.warn(
      `Price mismatch for ref ${reference}: ` +
      `expected ${metaTotalServiceKobo} kobo, got ${totalServiceKobo} kobo — using DB value`
    );
  }

  const serviceSummary = metaServiceSummary as string;
  const userLocationPoint = `POINT(${user_location_lng} ${user_location_lat})`;
  const scheduledStr = scheduled_at as string;
  const userLat = user_location_lat as number;
  const userLng = user_location_lng as number;

  // ── Check auto-accept conditions ──────────────────────────
  const autoAcceptResult = await checkAutoAccept(
    supabase,
    vendor_id as string,
    scheduledStr,
    totalDurationBlocks,
    userLat,
    userLng
  );

  // ── Create the booking record ──────────────────────────────
  const now = new Date();
  const graceExpiry = new Date(now.getTime() + 5 * 60 * 1000);

  const scheduledEnd = new Date(
    new Date(scheduledStr).getTime() + totalDurationBlocks * 30 * 60 * 1000
  );
  const autoReleaseAt = new Date(scheduledEnd.getTime() + 2 * 60 * 60 * 1000);

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      user_id,
      vendor_id,
      // Canonical V2 columns
      service_summary: serviceSummary,
      total_amount: totalServiceKobo,
      // Compat mirrors — read by paystack-capture, paystack-settle, paystack-cancel
      service_name: serviceSummary,
      service_price_kobo: totalServiceKobo,
      service_duration_blocks: totalDurationBlocks,
      // Schedule
      scheduled_at,
      user_location: userLocationPoint,
      user_location_address: user_location_address ?? null,
      user_location_lat: userLat,
      user_location_lng: userLng,
      access_building: (access_building as string) ?? null,
      access_floor: (access_floor as string) ?? null,
      access_flat: (access_flat as string) ?? null,
      access_code: (access_code as string) ?? null,
      // Transport surcharge — immutable after creation
      transport_fee_kobo: transportFeeKobo,
      distance_km: distanceKm,
      pre_transport_buffer_slots: preBufferSlots,
      status: autoAcceptResult.shouldAutoAccept ? BOOKING_STATUS.ACCEPTED : BOOKING_STATUS.PENDING,
      paystack_reference: reference,
      paystack_authorization_code: (data.authorization as Record<string, unknown>)?.authorization_code ?? null,
      payment_captured: false,
      auto_release_at: autoReleaseAt.toISOString(),
      auto_accepted: autoAcceptResult.shouldAutoAccept,
      auto_accept_grace_expires_at: autoAcceptResult.shouldAutoAccept
        ? graceExpiry.toISOString()
        : null,
      accepted_at: autoAcceptResult.shouldAutoAccept ? now.toISOString() : null,
    })
    .select('id, vendor_id, user_id')
    .single();

  if (bookingError || !booking) {
    console.error('Failed to create booking:', bookingError);
    throw new Error('Booking creation failed');
  }

  // ── Create booking_services rows (one per service) ─────────
  const bookingServiceRows = services.map((sv) => ({
    booking_id: booking.id,
    vendor_service_id: sv.id,
    service_name: sv.service_name,
    price_kobo: sv.price_kobo,
  }));

  const { error: bsError } = await supabase
    .from('booking_services')
    .insert(bookingServiceRows);

  if (bsError) {
    console.error('Failed to create booking_services:', bsError);
    // Non-fatal: booking exists; booking_services can be backfilled if needed
  }

  console.log(`Booking created: ${booking.id} (auto_accept=${autoAcceptResult.shouldAutoAccept})`);

  // ── Transport buffer blocks if auto-accepted ────────────────
  if (autoAcceptResult.shouldAutoAccept) {
    await createTransportBuffers(
      supabase,
      vendor_id as string,
      booking.id,
      scheduledStr,
      totalDurationBlocks
    );
  }

  // ── Fetch vendor and user for notifications ─────────────────
  const [{ data: vendor }, { data: profile }] = await Promise.all([
    supabase.from('vendors').select('full_name, push_token, email, pioneer, pioneer_bookings_completed').eq('id', vendor_id).single(),
    supabase.from('profiles').select('full_name, push_token, email').eq('id', user_id).single(),
  ]);

  const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
  const vendorName = vendor?.full_name ?? 'Your vendor';

  if (autoAcceptResult.shouldAutoAccept) {
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
    if (vendor) {
      const msg = msg_vendor_autoAccepted(
        clientFirstName,
        serviceSummary,
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

    try {
      const isPioneer = vendor?.pioneer === true && (vendor?.pioneer_bookings_completed ?? 3) < 3;
      const totalKobo = totalServiceKobo + transportFeeKobo;
      const vendorAmountKobo = isPioneer ? totalKobo : Math.round(totalKobo * 0.8);

      if (profile?.email) {
        const { subject, body } = email_bookingConfirmed_customer({
          customerFirstName: clientFirstName,
          vendorName,
          service: serviceSummary,
          date: formatDate(scheduledStr),
          time: formatTime(scheduledStr),
          amount: `₦${formatNaira(totalKobo)}`,
        });
        await sendTransactionalEmail(profile.email, subject, body);
      }

      if (vendor?.email) {
        const { subject, body } = email_bookingConfirmed_vendor({
          vendorName: vendor.full_name,
          customerFirstName: clientFirstName,
          service: serviceSummary,
          date: formatDate(scheduledStr),
          time: formatTime(scheduledStr),
          amount: `₦${formatNaira(vendorAmountKobo)}`,
        });
        await sendTransactionalEmail(vendor.email, subject, body);
      }
    } catch (err) {
      console.error('paystack-webhook: booking-confirmed email failed (non-fatal):', err);
    }
  } else {
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
      const isPioneer = vendor.pioneer === true && (vendor.pioneer_bookings_completed ?? 3) < 3;
      const totalKobo = totalServiceKobo + transportFeeKobo;
      const vendorAmountKobo = isPioneer ? totalKobo : Math.round(totalKobo * 0.8);
      const msg = msg_vendor_newBooking(
        clientFirstName,
        serviceSummary,
        formatDate(scheduledStr),
        formatTime(scheduledStr),
        formatNaira(vendorAmountKobo)
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

  // Slot must be free — no unavailable/transport_buffer blocks and no booking conflicts
  if (!await isSlotFree(supabase, vendorId, slotStart, slotEnd, durationBlocks * 30 * 60 * 1000)) {
    return { shouldAutoAccept: false, reason: 'slot blocked' };
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

// ── Bank chargeback from Paystack ────────────────────────────
// Distinct from in-app disputes. Fires when a customer's bank reverses
// a charge. Freeze auto_release so funds aren't paid out mid-dispute.
async function handleChargeDispute(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  // Paystack dispute payload carries reference at data.reference or
  // data.transaction.reference depending on event version — try both.
  const transaction = data.transaction as Record<string, unknown> | undefined;
  const reference = (data.reference as string | undefined) ?? (transaction?.reference as string | undefined);

  if (!reference) {
    console.error('charge.dispute.create: no transaction reference in payload', JSON.stringify(data));
    return;
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (!booking) {
    console.error(`charge.dispute.create: no booking found for reference ${reference}`);
    return;
  }

  // Push auto_release_at 90 days out — prevents the settle cron from firing
  // while the chargeback is open. Admin must manually resolve.
  const frozenUntil = new Date();
  frozenUntil.setDate(frozenUntil.getDate() + 90);

  await supabase
    .from('bookings')
    .update({ auto_release_at: frozenUntil.toISOString() })
    .eq('id', booking.id);

  console.error(
    `CHARGEBACK RAISED — booking=${booking.id} ref=${reference} status=${booking.status} auto_release frozen until ${frozenUntil.toISOString()} — REQUIRES MANUAL ADMIN REVIEW`
  );
}

// ── Refund status from Paystack ──────────────────────────────
// Refunds are not instant. Paystack fires these after processing.
// refund.failed means the customer will NOT receive their money.
async function handleRefundUpdate(
  event: string,
  data: Record<string, unknown>
) {
  const transaction = data.transaction as Record<string, unknown> | undefined;
  const reference = transaction?.reference as string | undefined;
  const amountKobo = data.amount as number | undefined;

  if (event === 'refund.failed') {
    console.error(
      `REFUND FAILED — ref=${reference ?? 'unknown'} amount=${amountKobo ?? 'unknown'} kobo — CUSTOMER NOT REFUNDED — MANUAL ACTION REQUIRED`
    );
    return;
  }

  console.log(`Refund processed — ref=${reference} amount=${amountKobo} kobo`);
}
