// ============================================================
// VARS — submit-review
// Customer submits a star rating + optional comment for a completed booking.
// Inserts the review row (DB trigger updates vendor avg_rating)
// and notifies the vendor.
//
// POST body: { booking_id, rating: 1–5, comment?: string }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  sendNotification,
  msg_vendor_newReview,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  let body: { booking_id?: string; rating?: number; comment?: string };
  try { body = await req.json(); } catch { return errorResponse('Invalid JSON body', 400); }

  const { booking_id, rating, comment } = body;
  if (!booking_id) return errorResponse('booking_id is required');
  if (!rating || rating < 1 || rating > 5) return errorResponse('rating must be between 1 and 5');

  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, user_id, vendor_id, status')
    .eq('id', booking_id)
    .single();

  if (!booking) return errorResponse('Booking not found', 404);
  if (booking.user_id !== user.id) return errorResponse('Not authorised', 403);
  if (booking.status !== 'completed') return errorResponse('Booking is not completed', 409);

  const { error: insertError } = await supabase.from('reviews').insert({
    booking_id,
    user_id:   user.id,
    vendor_id: booking.vendor_id,
    rating,
    comment:   comment?.trim() || null,
  });

  if (insertError) {
    if (insertError.code === '23505') return errorResponse('Already reviewed', 409);
    console.error('submit-review: insert failed', insertError);
    return errorResponse('Failed to submit review', 500);
  }

  const [{ data: profile }, { data: vendor }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('vendors').select('push_token').eq('id', booking.vendor_id).single(),
  ]);

  const clientFirstName = (profile?.full_name ?? 'Someone').split(' ')[0];
  const msg = msg_vendor_newReview(clientFirstName);
  await sendNotification({
    recipientId: booking.vendor_id,
    recipientType: 'vendor',
    type: 'new_review',
    title: msg.title,
    body: msg.body,
    bookingId: booking.id,
    pushToken: vendor?.push_token ?? null,
    data: { bookingId: booking.id },
  });

  return jsonResponse({ success: true });
});
