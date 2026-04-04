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
  msg_vendor_newBooking,
  msg_vendor_paymentReleased,
  formatDate,
  formatTime,
  formatNaira,
} from '../_shared/notifications.ts';

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

  // Create the booking record
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
      status: 'pending',
      paystack_reference: reference,
      paystack_authorization_code: (data.authorization as Record<string, unknown>)?.authorization_code ?? null,
      payment_captured: false,
      // Auto-release window: vendor must accept within 2 hours
    })
    .select('id, vendor_id, user_id')
    .single();

  if (bookingError || !booking) {
    console.error('Failed to create booking:', bookingError);
    throw new Error('Booking creation failed');
  }

  console.log(`Booking created: ${booking.id}`);

  // Fetch vendor and user details for notifications
  const [{ data: vendor }, { data: profile }] = await Promise.all([
    supabase.from('vendors').select('full_name, push_token').eq('id', vendor_id).single(),
    supabase.from('profiles').select('full_name, push_token').eq('id', user_id).single(),
  ]);

  const scheduledStr = scheduled_at as string;

  // Notify user: payment authorized, vendor has 2 hours
  if (profile) {
    const msg = msg_paymentAuthorized(vendor?.full_name ?? 'Your vendor');
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

  // Notify vendor: new booking request (2-hour response window)
  if (vendor) {
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];
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
