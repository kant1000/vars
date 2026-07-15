// ============================================================
// VARS — paystack-gate
// The "gate" fires when the vendor commits to travel.
// Two triggers (only one fires, atomically):
//   manual    — vendor taps "On My Way" in the app
//   proximity — send-reminders cron detected vendor near customer
//
// Gate logic:
//   1. Atomic check-and-set gate_fired to prevent double-fire.
//   2. Set paystack_reference on booking.
//   3. Returning customer (has authorization_code on profile):
//        → chargeAuthorization (silent)
//        → on success: advance to on_way, notify both parties
//        → on failure: open retry window, push customer to update card
//   4. First-time customer (no authorization_code):
//        → initializeTransaction to generate access_code
//        → push customer to open app and complete checkout
//        → status stays 'accepted' until charge.success webhook fires
//
// Called by:
//   vendor app (manual trigger) — authenticated as vendor
//   send-reminders cron (proximity trigger) — service role key
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  PaystackClient,
  generateReference,
} from '../_shared/paystack.ts';
import { BOOKING_STATUS, GATE_WINDOW_MINUTES, GATE_PAYMENT_RETRY_WINDOW_MINUTES, PIONEER_BOOKINGS_THRESHOLD } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_vendorOnWay,
  msg_vendor_gateCharged,
  msg_vendor_gatePaymentPending,
  msg_gatePaymentNeeded,
  msg_gatePaymentFailed,
  formatNaira,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createAdminClient();
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isCronCall = authHeader === `Bearer ${serviceKey}`;

    if (!authHeader) return errorResponse('Missing authorization', 401);

    const body = await req.json();
    const { booking_id, trigger_type } = body as { booking_id: string; trigger_type: 'manual' | 'proximity' };

    if (!booking_id) return errorResponse('Missing booking_id');
    if (trigger_type !== 'manual' && trigger_type !== 'proximity') {
      return errorResponse('trigger_type must be "manual" or "proximity"');
    }

    // For manual trigger: verify the caller is the vendor for this booking
    let callerVendorId: string | null = null;
    if (!isCronCall) {
      const authClient = createAuthClient(authHeader);
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (authError || !user) return errorResponse('Unauthorized', 401);
      callerVendorId = user.id;
    }

    // ── 1. Fetch booking ─────────────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id, scheduled_at, gate_fired,
        service_price_kobo, transport_fee_kobo
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    if (callerVendorId && booking.vendor_id !== callerVendorId) {
      return errorResponse('Booking does not belong to this vendor', 403);
    }

    if (booking.status !== BOOKING_STATUS.ACCEPTED) {
      return errorResponse(`Cannot gate booking with status: ${booking.status}`, 409);
    }

    // Manual trigger: check gate window (2 hours before scheduled_at)
    if (trigger_type === 'manual') {
      const windowOpen = new Date(
        new Date(booking.scheduled_at).getTime() - GATE_WINDOW_MINUTES * 60 * 1000
      );
      if (new Date() < windowOpen) {
        return errorResponse(
          `"On My Way" is not available yet — opens ${GATE_WINDOW_MINUTES} minutes before your appointment.`,
          409
        );
      }
    }

    // ── 2. Fetch vendor, profile, and validate before claiming ───
    // Validation happens here — before the atomic gate claim — so that
    // a failed prerequisite check never leaves the booking in a stuck
    // gate_fired=true, gate_charged_at=null, gate_retry_expires_at=null state
    // that the release cron cannot clean up.
    const totalKobo: number =
      (booking.service_price_kobo ?? 0) +
      ((booking as unknown as Record<string, number>).transport_fee_kobo ?? 0);

    const [{ data: vendor }, { data: profile }] = await Promise.all([
      supabase
        .from('vendors')
        .select('full_name, email, push_token, pioneer, pioneer_bookings_completed, paystack_subaccount_code, is_restricted')
        .eq('id', booking.vendor_id)
        .single(),
      supabase
        .from('profiles')
        .select('full_name, email, push_token, paystack_authorization_code')
        .eq('id', booking.user_id)
        .single(),
    ]);

    // Restricted vendors may not collect new payments.
    if (vendor?.is_restricted) {
      console.error(`Gate: vendor ${booking.vendor_id} is restricted — blocking gate`);
      return errorResponse('Your account is currently restricted. Please contact support.', 403);
    }

    const vendorName    = vendor?.full_name ?? 'Your vendor';
    const userEmail     = profile?.email ?? '';
    const authCode      = profile?.paystack_authorization_code ?? null;

    if (!userEmail) {
      console.error(`Gate: no email for user ${booking.user_id}`);
      return errorResponse('Customer email not found', 500);
    }

    // Subaccount split params — applied at charge time (not at booking time)
    const isPioneer =
      vendor?.pioneer === true &&
      ((vendor?.pioneer_bookings_completed as number) ?? 0) < PIONEER_BOOKINGS_THRESHOLD;

    const subaccountCode = vendor?.paystack_subaccount_code as string | null;
    if (!subaccountCode) {
      console.error(`Gate: vendor ${booking.vendor_id} has no paystack_subaccount_code — blocking gate to prevent splitless charge`);
      return errorResponse('Vendor payment account not configured. Please contact support.', 422);
    }

    const subaccountParams = {
      subaccount: subaccountCode,
      bearer: 'account' as const,
      ...(isPioneer ? { transaction_charge: 0 } : {}),
    };

    // ── 3. Atomic gate claim ──────────────────────────────────────
    // UPDATE ... WHERE gate_fired = FALSE returning the row.
    // Zero rows returned = another trigger already claimed the gate.
    // All prerequisite validation above this line ensures that a
    // successful claim is always followed by a successful payment call.
    const gateReference = generateReference('VARS_GATE');
    const now = new Date().toISOString();

    const { data: claimed } = await supabase
      .from('bookings')
      .update({
        gate_fired: true,
        gate_trigger_type: trigger_type,
        gate_triggered_at: now,
        paystack_reference: gateReference,
      })
      .eq('id', booking_id)
      .eq('gate_fired', false)
      .select('id');

    if (!claimed || claimed.length === 0) {
      console.log(`Gate already claimed for booking ${booking_id} — duplicate trigger ignored`);
      return jsonResponse({ success: true, booking_id, gate_already_fired: true });
    }

    console.log(`Gate claimed: booking=${booking_id} trigger=${trigger_type} ref=${gateReference}`);

    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
    const chargeMeta = {
      vars_gate: {
        booking_id,
        vendor_id: booking.vendor_id,
        trigger_type,
      },
    };

    // ── 4a. Returning customer — silent charge ─────────────────
    if (authCode) {
      return await handleChargeAuth(
        supabase, paystack, booking, profile, vendor,
        authCode, gateReference, totalKobo, subaccountParams,
        chargeMeta, vendorName, isPioneer
      );
    }

    // ── 4b. First-time customer — open checkout ─────────────────
    // If initializeTransaction throws, the gate is already claimed. Set
    // gate_retry_expires_at to now so sweep 2 of the release cron cancels
    // the booking on its next run rather than leaving it permanently stuck.
    let transaction;
    try {
      transaction = await paystack.initializeTransaction({
        email: userEmail,
        amount: totalKobo,
        reference: gateReference,
        callback_url: 'vars://gate-payment-complete',
        metadata: chargeMeta,
        ...subaccountParams,
      });
    } catch (initErr) {
      console.error(`Gate: initializeTransaction threw for booking ${booking_id} — marking for cron cleanup`, initErr);
      await supabase
        .from('bookings')
        .update({ gate_retry_expires_at: new Date().toISOString() })
        .eq('id', booking_id);
      return errorResponse('Payment initialisation failed. The booking will be cancelled automatically.', 502);
    }

    // Set retry expiry on the booking — booking cancelled if not completed in time
    const retryExpiry = new Date(
      Date.now() + GATE_PAYMENT_RETRY_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    await supabase
      .from('bookings')
      .update({ gate_retry_expires_at: retryExpiry })
      .eq('id', booking_id);

    // Push customer: open app and complete payment
    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'gate_payment_needed',
      title: msg_gatePaymentNeeded(vendorName).title,
      body: msg_gatePaymentNeeded(vendorName).body,
      bookingId: booking_id,
      pushToken: profile?.push_token ?? null,
      data: {
        bookingId: booking_id,
        access_code: transaction.access_code,
        retry_expires_at: retryExpiry,
        screen: `/booking/gate-checkout/${booking_id}`,
      },
    });

    // Push vendor: payment confirming
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'gate_payment_pending',
      title: msg_vendor_gatePaymentPending().title,
      body: msg_vendor_gatePaymentPending().body,
      bookingId: booking_id,
      pushToken: vendor?.push_token ?? null,
      data: { bookingId: booking_id },
    });

    console.log(
      `Gate: first-time checkout opened for booking=${booking_id} ` +
      `expires=${retryExpiry} access_code=${transaction.access_code}`
    );

    return jsonResponse({
      success: true,
      booking_id,
      gate_fired: true,
      checkout_required: true,
      access_code: transaction.access_code,
      retry_expires_at: retryExpiry,
    });
  } catch (err) {
    console.error('paystack-gate error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});

// ============================================================
// chargeAuthorization path (returning customer)
// ============================================================
async function handleChargeAuth(
  supabase: ReturnType<typeof createAdminClient>,
  paystack: PaystackClient,
  booking: { id: string; user_id: string; vendor_id: string; scheduled_at: string },
  profile: { full_name: string; email: string; push_token: string | null } | null,
  vendor: { full_name: string; push_token: string | null } | null,
  authorizationCode: string,
  reference: string,
  totalKobo: number,
  subaccountParams: Record<string, unknown>,
  metadata: Record<string, unknown>,
  vendorName: string,
  isPioneer: boolean
): Promise<Response> {
  const now = new Date().toISOString();

  let chargeResult;
  try {
    chargeResult = await paystack.chargeAuthorization({
      authorization_code: authorizationCode,
      email: profile?.email ?? '',
      amount: totalKobo,
      reference,
      metadata,
      ...(subaccountParams as { subaccount?: string; bearer?: 'account'; transaction_charge?: number }),
    });
  } catch (err) {
    console.error(`chargeAuthorization threw for booking ${booking.id}:`, err);
    return await openRetryWindow(supabase, paystack, booking, profile, vendor, reference, totalKobo, subaccountParams, metadata, vendorName);
  }

  if (chargeResult.status !== 'success') {
    console.log(`chargeAuthorization status=${chargeResult.status} for booking ${booking.id} — opening retry window`);
    return await openRetryWindow(supabase, paystack, booking, profile, vendor, reference, totalKobo, subaccountParams, metadata, vendorName);
  }

  // ── Success — advance to on_way ────────────────────────────
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: BOOKING_STATUS.ON_WAY,
      gate_charged_at: now,
      gate_retry_expires_at: null,
    })
    .eq('id', booking.id);

  if (updateErr) {
    console.error(`Failed to advance booking ${booking.id} to on_way:`, updateErr);
    throw updateErr;
  }

  // Update stored authorization code in case it rotated
  if (chargeResult.authorization?.authorization_code && chargeResult.authorization.reusable) {
    await supabase
      .from('profiles')
      .update({ paystack_authorization_code: chargeResult.authorization.authorization_code })
      .eq('id', booking.user_id);
  }

  // Notify vendor — confirmed, head out
  if (vendor?.push_token) {
    const msg = msg_vendor_gateCharged();
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'gate_charge_confirmed',
      title: msg.title,
      body: msg.body,
      bookingId: booking.id,
      pushToken: vendor.push_token,
      data: { bookingId: booking.id },
    });
  }

  // Notify customer — vendor on their way
  if (profile?.push_token) {
    const msg = msg_vendorOnWay(vendorName);
    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'vendor_on_way',
      title: msg.title,
      body: msg.body,
      bookingId: booking.id,
      pushToken: profile.push_token,
      data: { bookingId: booking.id },
    });
  }

  console.log(
    `Gate charge success (chargeAuth): booking=${booking.id} ` +
    `ref=${reference} amount=₦${formatNaira(totalKobo)} → on_way`
  );

  return jsonResponse({
    success: true,
    booking_id: booking.id,
    gate_fired: true,
    status: BOOKING_STATUS.ON_WAY,
    checkout_required: false,
  });
}

// ============================================================
// Open a retry window after charge failure
// ============================================================
async function openRetryWindow(
  supabase: ReturnType<typeof createAdminClient>,
  paystack: PaystackClient,
  booking: { id: string; user_id: string; vendor_id: string },
  profile: { full_name: string; email: string; push_token: string | null } | null,
  vendor: { full_name: string; push_token: string | null } | null,
  originalReference: string,
  totalKobo: number,
  subaccountParams: Record<string, unknown>,
  metadata: Record<string, unknown>,
  vendorName: string
): Promise<Response> {
  // Generate a new reference for the retry checkout
  const retryReference = generateReference('VARS_GATE_RETRY');
  const retryExpiry = new Date(
    Date.now() + GATE_PAYMENT_RETRY_WINDOW_MINUTES * 60 * 1000
  ).toISOString();

  // Open a new checkout for the customer to use a different card
  const transaction = await paystack.initializeTransaction({
    email: profile?.email ?? '',
    amount: totalKobo,
    reference: retryReference,
    callback_url: 'vars://gate-payment-complete',
    metadata,
    ...(subaccountParams as { subaccount?: string; bearer?: 'account'; transaction_charge?: number }),
  });

  // Update booking with new reference and retry expiry
  await supabase
    .from('bookings')
    .update({
      paystack_reference: retryReference,
      gate_retry_expires_at: retryExpiry,
    })
    .eq('id', booking.id);

  // Push customer: card failed, try another
  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: 'gate_payment_failed',
    title: msg_gatePaymentFailed().title,
    body: msg_gatePaymentFailed().body,
    bookingId: booking.id,
    pushToken: profile?.push_token ?? null,
    data: {
      bookingId: booking.id,
      access_code: transaction.access_code,
      retry_expires_at: retryExpiry,
      screen: `/booking/gate-checkout/${booking.id}`,
    },
  });

  // Push vendor: still waiting
  if (vendor?.push_token) {
    await sendNotification({
      recipientId: booking.vendor_id,
      recipientType: 'vendor',
      type: 'gate_payment_pending',
      title: msg_vendor_gatePaymentPending().title,
      body: msg_vendor_gatePaymentPending().body,
      bookingId: booking.id,
      pushToken: vendor.push_token,
      data: { bookingId: booking.id },
    });
  }

  console.log(
    `Gate: retry window opened for booking=${booking.id} ` +
    `expires=${retryExpiry} access_code=${transaction.access_code}`
  );

  return jsonResponse({
    success: true,
    booking_id: booking.id,
    gate_fired: true,
    checkout_required: true,
    charge_failed: true,
    access_code: transaction.access_code,
    retry_expires_at: retryExpiry,
  });
}
