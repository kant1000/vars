// ============================================================
// VARS — photo-consent-respond
// Client approves or declines a vendor's photo consent request.
// Approved  → consent_state = 'approved', photo goes live.
// Declined  → photo deleted from storage + DB, vendor notified.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import {
  sendNotification,
  msg_vendor_consentApproved,
  msg_vendor_consentDeclined,
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

    const { photo_id, response } = await req.json();
    if (!photo_id) return errorResponse('Missing photo_id');
    if (!['approved', 'declined'].includes(response)) return errorResponse('response must be approved or declined');

    const supabase = createAdminClient();

    // Fetch photo
    const { data: photo } = await supabase
      .from('portfolio_photos')
      .select('id, vendor_id, booking_id, storage_path, consent_state')
      .eq('id', photo_id)
      .single();

    if (!photo) return errorResponse('Photo not found', 404);
    if (photo.consent_state !== 'pending') return errorResponse('Photo is no longer awaiting consent');

    // Confirm booking belongs to this client
    const { data: booking } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('id', photo.booking_id)
      .single();

    if (!booking || booking.user_id !== user.id) {
      return errorResponse('Not authorized for this photo', 403);
    }

    const { data: vendor } = await supabase
      .from('vendors')
      .select('push_token')
      .eq('id', photo.vendor_id)
      .single();

    if (response === 'approved') {
      await supabase
        .from('portfolio_photos')
        .update({ consent_state: 'approved' })
        .eq('id', photo_id);

      const msg = msg_vendor_consentApproved();
      await sendNotification({
        recipientId: photo.vendor_id,
        recipientType: 'vendor',
        type: 'photo_consent_approved',
        title: msg.title,
        body: msg.body,
        bookingId: photo.booking_id,
        pushToken: vendor?.push_token ?? null,
        data: { photoId: photo_id },
      });
    } else {
      // Delete from storage then DB
      await supabase.storage.from('portfolio').remove([photo.storage_path]);
      await supabase.from('portfolio_photos').delete().eq('id', photo_id);

      const msg = msg_vendor_consentDeclined();
      await sendNotification({
        recipientId: photo.vendor_id,
        recipientType: 'vendor',
        type: 'photo_consent_declined',
        title: msg.title,
        body: msg.body,
        bookingId: photo.booking_id,
        pushToken: vendor?.push_token ?? null,
        data: { photoId: photo_id },
      });
    }

    console.log(`Photo ${photo_id}: ${response} by client ${user.id}`);
    return jsonResponse({ success: true, response });
  } catch (err) {
    console.error('photo-consent-respond error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
