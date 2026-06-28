// ============================================================
// VARS — vendor-update-job-status
// Vendor advances a booking through on_way → arrived → service_rendered.
// Validates the transition, stamps the timestamp, notifies the customer.
//
// POST body: { booking_id, new_status: 'on_way' | 'arrived' | 'service_rendered' }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_vendorOnWay,
  msg_vendorArrived,
  msg_serviceRendered,
} from '../_shared/notifications.ts';

// on_way is intentionally excluded — that transition is owned by paystack-gate,
// which fires the charge atomically. Allowing it here would bypass payment.
type JobStatus = 'arrived' | 'service_rendered';

const VALID_FROM: Record<JobStatus, string> = {
  arrived:          BOOKING_STATUS.ON_WAY,
  service_rendered: BOOKING_STATUS.ARRIVED,
};

const TIMESTAMP_FIELD: Record<JobStatus, string> = {
  arrived:          'arrived_at',
  service_rendered: 'service_rendered_at',
};

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  let body: { booking_id?: string; new_status?: string };
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400); }

  const { booking_id, new_status } = body;
  if (!booking_id) return errorResponse('booking_id is required');
  if (!new_status || !['arrived', 'service_rendered'].includes(new_status)) {
    return errorResponse('new_status must be arrived or service_rendered — use paystack-gate for on_way');
  }

  const status = new_status as JobStatus;
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, vendor_id, user_id, status')
    .eq('id', booking_id)
    .single();

  if (!booking) return errorResponse('Booking not found', 404);
  if (booking.vendor_id !== user.id) return errorResponse('Not authorised', 403);
  if (booking.status !== VALID_FROM[status]) {
    return errorResponse(`Cannot advance to ${status} from ${booking.status}`, 409);
  }

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status, [TIMESTAMP_FIELD[status]]: new Date().toISOString() })
    .eq('id', booking.id);

  if (updateError) {
    console.error('vendor-update-job-status: update failed', updateError);
    return errorResponse('Failed to update booking status', 500);
  }

  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('push_token').eq('id', booking.user_id).single(),
    supabase.from('vendors').select('full_name').eq('id', booking.vendor_id).single(),
  ]);

  const vendorName = vendor?.full_name ?? 'Your vendor';
  const msg =
    status === 'on_way'           ? msg_vendorOnWay(vendorName) :
    status === 'arrived'          ? msg_vendorArrived(vendorName) :
                                    msg_serviceRendered(vendorName);

  await sendNotification({
    recipientId: booking.user_id,
    recipientType: 'user',
    type: `vendor_${status}`,
    title: msg.title,
    body: msg.body,
    bookingId: booking.id,
    pushToken: profile?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  return jsonResponse({ success: true });
});
