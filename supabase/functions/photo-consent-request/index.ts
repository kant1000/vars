// ============================================================
// VARS — photo-consent-request
// Vendor calls this after uploading a photo to storage.
// Validates limits, creates portfolio_photos record (pending),
// and sends consent push + in-app notification to the client.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import {
  sendNotification,
  msg_consentRequest,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { booking_id, storage_path } = await req.json();
    if (!booking_id || !storage_path) return errorResponse('Missing booking_id or storage_path');

    const supabase = createAdminClient();

    // Verify booking is completed and belongs to this vendor
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, status')
      .eq('id', booking_id)
      .eq('vendor_id', user.id)
      .single();

    if (!booking) return errorResponse('Booking not found', 404);
    if (booking.status !== BOOKING_STATUS.COMPLETED) return errorResponse('Booking must be completed to add a photo');

    // One photo per booking
    const { count: existingForBooking } = await supabase
      .from('portfolio_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', booking_id)
      .neq('consent_state', 'declined');

    if ((existingForBooking ?? 0) > 0) {
      return errorResponse('A photo has already been submitted for this booking');
    }

    // 10-photo profile cap
    const { count: totalCount } = await supabase
      .from('portfolio_photos')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', user.id)
      .neq('consent_state', 'declined');

    if ((totalCount ?? 0) >= 10) {
      return errorResponse('Profile photo limit reached (10). Delete a photo first.');
    }

    const consentExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { data: photo, error: insertError } = await supabase
      .from('portfolio_photos')
      .insert({
        vendor_id: user.id,
        booking_id,
        storage_path,
        consent_state: 'pending',
        consent_expires_at: consentExpiresAt,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Fetch vendor name + client push token in parallel
    const [{ data: vendor }, { data: client }] = await Promise.all([
      supabase.from('vendors').select('full_name').eq('id', user.id).single(),
      supabase.from('profiles').select('push_token').eq('id', booking.user_id).single(),
    ]);

    const msg = msg_consentRequest(vendor?.full_name ?? 'Your vendor');

    await sendNotification({
      recipientId: booking.user_id,
      recipientType: 'user',
      type: 'photo_consent_request',
      title: msg.title,
      body: msg.body,
      bookingId: booking_id,
      pushToken: client?.push_token ?? null,
      data: { photoId: photo.id, screen: `/consent/${photo.id}` },
    });

    console.log(`Consent request created: photo=${photo.id} booking=${booking_id}`);
    return jsonResponse({ success: true, photo_id: photo.id });
  } catch (err) {
    console.error('photo-consent-request error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
