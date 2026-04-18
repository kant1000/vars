// ============================================================
// VARS — photo-consent-expire (cron — runs hourly)
// Cleans up pending consent photos where consent_expires_at <= now.
// Deletes from storage + DB, notifies vendor.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import {
  sendNotification,
  msg_vendor_consentExpired,
} from '../_shared/notifications.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const isCronCall = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
    if (!isCronCall) return errorResponse('Forbidden', 403);

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    const { data: expiredPhotos } = await supabase
      .from('portfolio_photos')
      .select('id, vendor_id, booking_id, storage_path')
      .eq('consent_state', 'pending')
      .lte('consent_expires_at', nowIso);

    let expiredCount = 0;

    for (const photo of (expiredPhotos ?? [])) {
      try {
        await supabase.storage.from('portfolio').remove([photo.storage_path]);
        await supabase.from('portfolio_photos').delete().eq('id', photo.id);

        const { data: vendor } = await supabase
          .from('vendors')
          .select('push_token')
          .eq('id', photo.vendor_id)
          .single();

        const msg = msg_vendor_consentExpired();
        await sendNotification({
          recipientId: photo.vendor_id,
          recipientType: 'vendor',
          type: 'photo_consent_expired',
          title: msg.title,
          body: msg.body,
          bookingId: photo.booking_id,
          pushToken: vendor?.push_token ?? null,
          data: { photoId: photo.id },
        });

        expiredCount++;
      } catch (err) {
        console.error(`Failed to expire photo ${photo.id}:`, err);
      }
    }

    console.log(`photo-consent-expire: expired=${expiredCount}`);
    return jsonResponse({ expired: expiredCount });
  } catch (err) {
    console.error('photo-consent-expire error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
