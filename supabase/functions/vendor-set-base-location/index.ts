// ============================================================
// VARS — vendor-set-base-location
// Vendor updates the single location they operate from, via the
// LocationPicker bar on their profile screen.
//
// POST body:
//   { lat, lng }
//
// base_location drives three things at once: discovery proximity sort,
// transport-fee distance, and the auto-accept zone centre. Moving it
// therefore moves the auto-accept zone, so auto_accept_zone_confirmed_date
// must be cleared in the SAME update — a vendor should re-confirm a zone
// that is no longer where they confirmed it. That invariant is why this
// goes through an edge function instead of a direct client write like the
// customer's session_location does.
//
// Returns:
//   { success: true, lat, lng, zone_confirmation_cleared }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    let body: { lat?: number; lng?: number };
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { lat, lng } = body;
    if (lat == null || typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return errorResponse('lat must be a number between -90 and 90');
    }
    if (lng == null || typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return errorResponse('lng must be a number between -180 and 180');
    }

    const supabase = createAdminClient();

    // Confirm the caller is actually a vendor, and capture whether a zone
    // confirmation is being invalidated so the response can tell the app.
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, auto_accept_zone_confirmed_date')
      .eq('id', user.id)
      .single();

    if (vendorError || !vendor) return errorResponse('Vendor not found', 404);

    const hadConfirmedZone = vendor.auto_accept_zone_confirmed_date != null;

    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        // POINT(lng lat) — PostGIS WKT order is longitude first.
        base_location: `POINT(${lng} ${lat})`,
        // The zone moved with the base location; a stale confirmation would
        // let auto-accept fire around a centre the vendor never confirmed.
        auto_accept_zone_confirmed_date: null,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('vendor-set-base-location update error:', updateError);
      return errorResponse('Failed to save location', 500);
    }

    console.log(
      `Vendor ${user.id} base_location set to ${lat},${lng}` +
      (hadConfirmedZone ? ' (zone confirmation cleared)' : '')
    );

    return jsonResponse({
      success: true,
      lat,
      lng,
      zone_confirmation_cleared: hadConfirmedZone,
    });
  } catch (err) {
    console.error('vendor-set-base-location error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
