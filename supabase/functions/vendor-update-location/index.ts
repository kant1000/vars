// ============================================================
// VARS — vendor-update-location
// Called every 60s by the vendor app while booking status is on_way.
// Updates vendor_current_lat/lng on the vendors table so the
// customer's live tracking map can poll the latest position.
// Also runs drift detection: if the vendor moves >zone_radius+1km
// from their auto-accept zone centre, auto_accept_paused_due_to_drift
// is set to true. It clears automatically once they return within
// zone_radius km. Hysteresis band prevents flapping.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const { lat, lng } = await req.json();
    if (lat == null || lng == null) return errorResponse('Missing lat/lng');

    const supabase = createAdminClient();

    const { data: vendor, error: fetchError } = await supabase
      .from('vendors')
      .select('auto_accept_zone_lat, auto_accept_zone_lng, auto_accept_zone_radius_km, auto_accept_paused_due_to_drift')
      .eq('id', user.id)
      .single();

    if (fetchError) return errorResponse(fetchError.message, 500);

    const zoneLat = vendor.auto_accept_zone_lat;
    const zoneLng = vendor.auto_accept_zone_lng;
    const zoneRadius = vendor.auto_accept_zone_radius_km;
    const currentlyDrifted = vendor.auto_accept_paused_due_to_drift;

    let drifted = currentlyDrifted;

    if (zoneLat != null && zoneLng != null && zoneRadius != null) {
      const distKm = haversineKm(lat, lng, zoneLat, zoneLng);
      if (distKm > zoneRadius + 1) {
        drifted = true;
      } else if (distKm <= zoneRadius) {
        drifted = false;
      }
      // hysteresis band (zoneRadius < dist <= zoneRadius+3): leave drifted unchanged
    }

    const { error: updateError } = await supabase
      .from('vendors')
      .update({
        vendor_current_lat: lat,
        vendor_current_lng: lng,
        auto_accept_paused_due_to_drift: drifted,
      })
      .eq('id', user.id);

    if (updateError) return errorResponse(updateError.message, 500);

    return jsonResponse({ success: true, drifted });
  } catch (err) {
    console.error('vendor-update-location error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
