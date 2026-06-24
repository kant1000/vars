// ============================================================
// VARS — Shared gate reconciliation
//
// Single source of truth for advancing a gate-fired booking to
// on_way after a confirmed successful charge. Two callers:
//
//   paystack-webhook  — charge.success event (first-time checkout)
//   paystack-gate-checkout — verify-before-issue reconciliation
//                            (covers both first-time and returning-
//                             customer paths when webhook failed)
//
// paystack-gate's chargeAuthorization success path is NOT refactored
// to use this — that function is off-limits to this change. Any future
// edit to that function must manually stay in sync with this one.
//
// The DB update uses WHERE gate_charged_at IS NULL so concurrent
// callers (retried webhook + gate-checkout verify racing) are safe
// — only one will write, the other is a no-op.
// ============================================================

import { createAdminClient } from './supabase.ts';
import { BOOKING_STATUS } from './constants.ts';
import {
  sendNotification,
  msg_vendor_gateCharged,
  msg_vendorOnWay,
} from './notifications.ts';

export interface GateChargeSuccessContext {
  bookingId: string;
  userId: string;
  vendorId: string;
  vendorName: string;
  vendorPushToken: string | null;
  userPushToken: string | null;
  /** Set when Paystack returns a reusable authorization_code in the charge response. */
  authorizationCode?: string | null;
  reusable?: boolean;
}

/**
 * Advance a gate-fired booking to on_way after a confirmed successful charge.
 *
 * Returns true if the DB row was updated (first reconciliation).
 * Returns false if gate_charged_at was already set (concurrent caller won the race).
 * Throws on DB error — callers must propagate.
 */
export async function advanceGateToOnWay(
  supabase: ReturnType<typeof createAdminClient>,
  ctx: GateChargeSuccessContext
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: BOOKING_STATUS.ON_WAY,
      gate_charged_at: now,
      gate_retry_expires_at: null,
    })
    .eq('id', ctx.bookingId)
    .is('gate_charged_at', null) // idempotency guard
    .select('id');

  if (updateErr) {
    throw new Error(
      `advanceGateToOnWay: DB update failed for booking ${ctx.bookingId}: ${updateErr.message}`
    );
  }

  if (!updated || updated.length === 0) {
    // Another caller already reconciled — safe to ignore
    console.log(`advanceGateToOnWay: booking ${ctx.bookingId} already reconciled — no-op`);
    return false;
  }

  // Store authorization code for future silent charges (first-time customers)
  if (ctx.authorizationCode && ctx.reusable) {
    await supabase
      .from('profiles')
      .update({ paystack_authorization_code: ctx.authorizationCode })
      .eq('id', ctx.userId);
  }

  // Notify vendor — confirmed, head out
  const vendorMsg = msg_vendor_gateCharged();
  await sendNotification({
    recipientId: ctx.vendorId,
    recipientType: 'vendor',
    type: 'gate_charge_confirmed',
    title: vendorMsg.title,
    body: vendorMsg.body,
    bookingId: ctx.bookingId,
    pushToken: ctx.vendorPushToken,
    data: { bookingId: ctx.bookingId },
  });

  // Notify customer — vendor on their way
  const userMsg = msg_vendorOnWay(ctx.vendorName);
  await sendNotification({
    recipientId: ctx.userId,
    recipientType: 'user',
    type: 'vendor_on_way',
    title: userMsg.title,
    body: userMsg.body,
    bookingId: ctx.bookingId,
    pushToken: ctx.userPushToken,
    data: { bookingId: ctx.bookingId },
  });

  return true;
}
