// ============================================================
// VARS — paystack-gate-checkout
// Called when a first-time customer opens the app after receiving
// a "Complete your payment" push (sent by paystack-gate).
//
// The gate has already fired (gate_fired = true). This endpoint
// generates a fresh access_code for the Paystack inline checkout.
//
// The push notification from paystack-gate already contains the
// initial access_code — this endpoint exists for cases where the
// customer opens the app later (push tapped after a delay) and
// the initial code may have expired, or when the customer
// requests a retry after a failed charge.
//
// ── DOUBLE-CHARGE GUARD ──────────────────────────────────────
// Before issuing a new access_code, this endpoint checks directly
// with Paystack whether a charge already succeeded for the booking's
// current paystack_reference. This protects against the scenario
// where a charge succeeded but our webhook handler errored before
// writing gate_charged_at (our DB is stale but Paystack's isn't).
//
// If Paystack confirms success: reconcile the booking in place
//   (same advanceGateToOnWay call the webhook uses) and return 409.
// If Paystack confirms no success: generate a fresh reference as normal.
// If Paystack verify call throws: return 503 — block rather than risk
//   double-charging while we can't determine prior charge status.
//
// ── VERIFY SCOPE ─────────────────────────────────────────────
// The verify is skipped entirely when paystack_reference is null.
// That only happens on the absolute first call per gate-fire event
// (gate_fired=true but paystack-gate-checkout has never been called
// for this booking). In practice paystack_reference is set the moment
// paystack-gate fires, so null is rare but handled.
//
// Security: customer must be authenticated AND own the booking.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient, generateReference } from '../_shared/paystack.ts';
import { advanceGateToOnWay } from '../_shared/gate.ts';
import { BOOKING_STATUS, GATE_PAYMENT_RETRY_WINDOW_MINUTES } from '../_shared/constants.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id } = await req.json();
    if (!booking_id) return errorResponse('Missing booking_id');

    const supabase = createAdminClient();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id, status, user_id, vendor_id, gate_fired, gate_charged_at,
        gate_retry_expires_at, service_price_kobo, transport_fee_kobo,
        paystack_reference
      `)
      .eq('id', booking_id)
      .eq('user_id', user.id)
      .single();

    if (bookingError || !booking) return errorResponse('Booking not found', 404);

    // Gate must be fired but charge not yet complete
    if (!booking.gate_fired) {
      return errorResponse('Gate has not fired for this booking', 409);
    }
    if (booking.gate_charged_at) {
      return errorResponse('Booking is already charged', 409);
    }
    if (booking.status !== BOOKING_STATUS.ACCEPTED) {
      return errorResponse(`Cannot checkout for booking with status: ${booking.status}`, 409);
    }

    // Check retry window hasn't expired
    if (booking.gate_retry_expires_at && new Date(booking.gate_retry_expires_at) < new Date()) {
      return errorResponse('Payment window has expired — this booking has been cancelled', 410);
    }

    // Fetch customer profile and vendor data (needed for both paths below)
    const [{ data: profile }, { data: vendor }] = await Promise.all([
      supabase.from('profiles').select('email, push_token').eq('id', user.id).single(),
      supabase.from('vendors')
        .select('full_name, push_token, paystack_subaccount_code, pioneer, pioneer_bookings_completed')
        .eq('id', booking.vendor_id)
        .single(),
    ]);

    if (!profile?.email) return errorResponse('Customer email not found', 500);

    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    // ── Double-charge guard ───────────────────────────────────────
    // If a prior access_code was issued for this booking, check Paystack
    // directly to see whether that charge already succeeded before creating
    // a new one. Our DB (gate_charged_at) can be stale if the webhook
    // handler errored after a successful charge.
    const priorReference = (booking as unknown as Record<string, string | null>).paystack_reference;
    if (priorReference) {
      let verifyResult;
      try {
        verifyResult = await paystack.verifyTransaction(priorReference);
      } catch (verifyErr) {
        // Cannot confirm whether the prior charge succeeded — block rather
        // than risk charging twice. The customer can retry shortly.
        console.error(
          `paystack-gate-checkout: verify threw for ref=${priorReference} ` +
          `booking=${booking.id}:`, verifyErr
        );
        return errorResponse(
          'Could not confirm prior payment status — try again in a moment',
          503
        );
      }

      if (verifyResult.status === 'success') {
        // Prior charge succeeded but webhook errored before writing
        // gate_charged_at. Reconcile now using the same shared function the
        // webhook uses so both paths stay in sync.
        console.warn(
          `paystack-gate-checkout: prior charge confirmed for booking=${booking.id} ` +
          `ref=${priorReference} — reconciling without issuing new access code`
        );
        await advanceGateToOnWay(supabase, {
          bookingId: booking.id,
          userId: user.id,
          vendorId: booking.vendor_id,
          vendorName: vendor?.full_name ?? 'Your vendor',
          vendorPushToken: (vendor as unknown as Record<string, string | null>)?.push_token ?? null,
          userPushToken: (profile as unknown as Record<string, string | null>)?.push_token ?? null,
          authorizationCode: verifyResult.authorization?.authorization_code ?? null,
          reusable: verifyResult.authorization?.reusable ?? false,
        });
        // 409 "already charged" is the code the mobile gate-checkout screen
        // already handles by navigating to bookings.
        return errorResponse('Booking is already charged', 409);
      }

      // Non-success status (failed, abandoned, pending): fall through and
      // generate a fresh reference for the customer to try again.
      console.log(
        `paystack-gate-checkout: prior ref=${priorReference} status=${verifyResult.status} ` +
        `for booking=${booking.id} — proceeding with fresh reference`
      );
    }
    // ── End double-charge guard ───────────────────────────────────

    const totalKobo: number =
      (booking.service_price_kobo ?? 0) +
      ((booking as unknown as Record<string, number>).transport_fee_kobo ?? 0);

    const isPioneer =
      vendor?.pioneer === true &&
      ((vendor?.pioneer_bookings_completed as number) ?? 0) < 3;

    const subaccountCode = vendor?.paystack_subaccount_code as string | null;
    const subaccountParams = subaccountCode
      ? {
          subaccount: subaccountCode,
          bearer: 'account' as const,
          ...(isPioneer ? { transaction_charge: 0 } : {}),
        }
      : {};

    // Generate a fresh reference + access_code
    const freshReference = generateReference('VARS_GATE');
    const retryExpiry = new Date(
      Date.now() + GATE_PAYMENT_RETRY_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const transaction = await paystack.initializeTransaction({
      email: profile.email,
      amount: totalKobo,
      reference: freshReference,
      metadata: { vars_gate: { booking_id, trigger_type: 'checkout_refresh' } },
      ...subaccountParams,
    });

    // Update booking with fresh reference and extended expiry
    await supabase
      .from('bookings')
      .update({
        paystack_reference: freshReference,
        gate_retry_expires_at: retryExpiry,
      })
      .eq('id', booking_id);

    console.log(
      `Gate checkout refreshed: booking=${booking_id} ` +
      `ref=${freshReference} expires=${retryExpiry}`
    );

    return jsonResponse({
      access_code: transaction.access_code,
      reference: freshReference,
      amount_kobo: totalKobo,
      retry_expires_at: retryExpiry,
    });
  } catch (err) {
    console.error('paystack-gate-checkout error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
