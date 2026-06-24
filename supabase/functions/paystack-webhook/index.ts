// ============================================================
// VARS — paystack-webhook
// Receives all Paystack webhook events.
// MUST verify HMAC-SHA512 signature before processing.
//
// In the gate model, bookings are created at request time (paystack-initialize).
// charge.success fires only when a first-time customer completes a WebView
// checkout at gate time. It advances the booking to on_way.
//
// Returning customers are charged silently in paystack-gate via
// chargeAuthorization — on_way transition is handled there, not here.
//
// Handled events:
//   charge.success        → gate checkout complete: store auth_code, advance to on_way
//   charge.dispute.create → set settlement_on_hold=true on vendor (bank chargeback)
//   refund.processed      → log success for audit trail
//   refund.failed         → log failure for manual ops review
// ============================================================

import { createAdminClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import { PaystackClient, verifyWebhookSignature } from '../_shared/paystack.ts';
import { advanceGateToOnWay } from '../_shared/gate.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;

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

      case 'charge.dispute.create':
        await handleChargeDispute(supabase, event.data);
        break;

      case 'refund.processed':
      case 'refund.failed':
        await handleRefundUpdate(supabase, event.event, event.data);
        break;

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }
  } catch (err) {
    console.error(`Webhook handler error for ${event.event}:`, err);
    // Return 500 so Paystack retries delivery. advanceGateToOnWay uses
    // WHERE gate_charged_at IS NULL so retries are safely idempotent.
    return new Response('Internal error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});

// ============================================================
// HANDLERS
// ============================================================

/**
 * Gate checkout complete (first-time customer via WebView).
 *
 * paystack-gate already set gate_fired=true and paystack_reference on the
 * booking when it generated the access_code. This webhook fires when the
 * customer actually completes the Paystack inline checkout.
 *
 * Returning customers (chargeAuthorization) are handled synchronously inside
 * paystack-gate — they never reach this handler.
 *
 * Reconciliation is delegated to advanceGateToOnWay (_shared/gate.ts) so
 * this path and the verify-before-issue path in paystack-gate-checkout can
 * never drift apart.
 */
async function handleChargeSuccess(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;
  const authorization = (data.authorization as Record<string, unknown>) ?? {};
  const authorizationCode = authorization.authorization_code as string | null;
  const isReusable = authorization.reusable as boolean | undefined;

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, vendor_id, status, gate_charged_at')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (!booking) {
    console.log(`charge.success: no booking found for reference ${reference} — ignoring`);
    return;
  }

  if (booking.gate_charged_at) {
    // advanceGateToOnWay already ran (from gate-checkout verify path or a prior webhook delivery)
    console.log(`charge.success: booking ${booking.id} already reconciled — idempotent skip`);
    return;
  }

  if (booking.status !== BOOKING_STATUS.ACCEPTED) {
    // If the booking was cancelled (likely by the expiry sweep) while the customer
    // was completing checkout, the charge landed but the booking is gone.
    // Issue an emergency refund — the customer paid but receives no service.
    if (booking.status === BOOKING_STATUS.CANCELLED && !booking.gate_charged_at) {
      console.error(
        `charge.success: booking ${booking.id} CANCELLED with gate_charged_at=null — ` +
        `payment landed after expiry cancellation — issuing emergency refund ref=${reference}`
      );
      const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);
      try {
        await paystack.refundTransaction({
          transaction: reference,
          merchant_note: `Emergency refund: booking ${booking.id} expired while payment was in flight`,
        });
        console.log(`Emergency refund issued: booking=${booking.id} ref=${reference}`);
      } catch (refundErr) {
        console.error(
          `CRITICAL: Emergency refund FAILED — booking=${booking.id} ref=${reference} — ` +
          `CUSTOMER NOT REFUNDED — MANUAL ACTION REQUIRED:`,
          refundErr
        );
        // Throw so the outer handler returns 500 and Paystack retries delivery.
        // advanceGateToOnWay's idempotency guard makes retries safe; the emergency
        // refund path above also re-enters safely if Paystack already accepted the refund.
        throw refundErr;
      }
      return;
    }
    console.warn(
      `charge.success: booking ${booking.id} status=${booking.status} — no action`
    );
    return;
  }

  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('push_token, full_name').eq('id', booking.user_id).single(),
    supabase.from('vendors').select('push_token, full_name').eq('id', booking.vendor_id).single(),
  ]);

  await advanceGateToOnWay(supabase, {
    bookingId: booking.id,
    userId: booking.user_id,
    vendorId: booking.vendor_id,
    vendorName: vendor?.full_name ?? 'Your vendor',
    vendorPushToken: vendor?.push_token ?? null,
    userPushToken: profile?.push_token ?? null,
    authorizationCode,
    reusable: isReusable,
  });

  console.log(`Gate charge reconciled (webhook): booking=${booking.id} ref=${reference} → on_way`);
}

// ── Bank chargeback from Paystack ────────────────────────────
// Distinct from in-app disputes. Fires when a customer's bank reverses
// a charge. Sets settlement_on_hold on the vendor so paystack-settle
// skips their settlement until resolved. Admin clears the flag.
async function handleChargeDispute(
  supabase: ReturnType<typeof createAdminClient>,
  data: Record<string, unknown>
) {
  const transaction = data.transaction as Record<string, unknown> | undefined;
  const reference = (data.reference as string | undefined) ?? (transaction?.reference as string | undefined);

  if (!reference) {
    console.error('charge.dispute.create: no transaction reference in payload', JSON.stringify(data));
    return;
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, vendor_id, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (!booking) {
    console.error(`charge.dispute.create: no booking found for reference ${reference}`);
    return;
  }

  await supabase
    .from('vendors')
    .update({ settlement_on_hold: true })
    .eq('id', booking.vendor_id);

  console.error(
    `CHARGEBACK RAISED — booking=${booking.id} ref=${reference} vendor=${booking.vendor_id} ` +
    `status=${booking.status} settlement_on_hold=true — REQUIRES MANUAL ADMIN REVIEW`
  );
}

// ── Refund status from Paystack ──────────────────────────────
// Refunds are not instant. Paystack fires these after processing.
// refund.failed means the customer will NOT receive their money.
async function handleRefundUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  event: string,
  data: Record<string, unknown>
) {
  const transaction = data.transaction as Record<string, unknown> | undefined;
  const reference = transaction?.reference as string | undefined;
  const amountKobo = data.amount as number | undefined;
  const now = new Date().toISOString();

  // Look up the booking so we can notify the customer and have an audit trail.
  const { data: booking } = reference
    ? await supabase
        .from('bookings')
        .select('id, user_id')
        .eq('paystack_reference', reference)
        .maybeSingle()
    : { data: null };

  if (event === 'refund.failed') {
    console.error(
      `REFUND FAILED — ref=${reference ?? 'unknown'} amount=${amountKobo ?? 'unknown'} kobo ` +
      `booking=${booking?.id ?? 'unknown'} customer=${booking?.user_id ?? 'unknown'} — CUSTOMER NOT REFUNDED — MANUAL ACTION REQUIRED`
    );

    // Notify the customer that a manual refund is in progress so they aren't left in the dark.
    if (booking?.user_id) {
      await supabase.from('notifications').insert({
        recipient_id: booking.user_id,
        recipient_type: 'user',
        type: 'refund_failed',
        title: 'Refund update',
        body: "We had a hiccup processing your refund — our team will reach out to make it right.",
        created_at: now,
      });
    }
    return;
  }

  // refund.processed — let the customer know their money is on its way.
  console.log(`Refund processed — ref=${reference} amount=${amountKobo} kobo booking=${booking?.id ?? 'unknown'}`);
  if (booking?.user_id) {
    await supabase.from('notifications').insert({
      recipient_id: booking.user_id,
      recipient_type: 'user',
      type: 'refund_processed',
      title: 'Refund on its way',
      body: 'Your refund has been processed and is heading to your account.',
      created_at: now,
    });
  }
}
