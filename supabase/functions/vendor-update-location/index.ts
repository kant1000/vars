// ============================================================
// VARS — vendor-update-location
// Called periodically from the mobile app (every ~60s)
// while the vendor is online.
//
// Stores the vendor's current GPS coordinates and checks
// for zone drift. If the vendor is more than
// (zone_radius_km + 3km) from their zone centre, auto-accept
// is paused (auto_accept_paused_due_to_drift = TRUE).
// When they return within range, the pause is lifted.
//
// POST body: { lat, lng }
// Returns:   { drifted, distance_km, zone_radius_km, paused }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

/** Haversine distance in km between two lat/lng points. */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

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
  if (lat == null || lng == null || typeof lat !== 'number' || typeof lng !== 'number') {
    return errorResponse('lat and lng are required numbers');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return errorResponse('Invalid coordinates');
  }

  const supabase = createAdminClient();

  // Fetch vendor zone settings
  const { data: vendor } = await supabase
    .from('vendors')
    .select(`
      id,
      auto_accept_zone_lat,
      auto_accept_zone_lng,
      auto_accept_zone_radius_km,
      auto_accept_enabled,
      auto_accept_paused_due_to_drift
    `)
    .eq('id', user.id)
    .single();

  if (!vendor) return errorResponse('Vendor not found', 404);

  // Always update the vendor's current position
  const locationUpdate: Record<string, unknown> = {
    vendor_current_lat: lat,
    vendor_current_lng: lng,
    vendor_location_updated_at: new Date().toISOString(),
  };

  // Check zone drift only when auto-accept is configured and enabled
  const zoneConfigured =
    vendor.auto_accept_zone_lat != null &&
    vendor.auto_accept_zone_lng != null &&
    vendor.auto_accept_zone_radius_km != null;

  let drifted = false;
  let distanceKm: number | null = null;
  let driftThresholdKm: number | null = null;

  if (zoneConfigured && vendor.auto_accept_enabled) {
    distanceKm = haversineKm(
      lat, lng,
      vendor.auto_accept_zone_lat!,
      vendor.auto_accept_zone_lng!
    );
    // Zone drift: vendor is >zone_radius + 3km from centre
    driftThresholdKm = vendor.auto_accept_zone_radius_km! + 3;
    drifted = distanceKm > driftThresholdKm;

    if (drifted !== vendor.auto_accept_paused_due_to_drift) {
      // State has changed — update
      locationUpdate.auto_accept_paused_due_to_drift = drifted;
      if (drifted) {
        console.log(`Vendor ${user.id} drifted ${distanceKm.toFixed(1)}km from zone centre (threshold ${driftThresholdKm}km). Auto-accept paused.`);
      } else {
        console.log(`Vendor ${user.id} returned within zone (${distanceKm.toFixed(1)}km). Auto-accept resumed.`);
      }
    }
  }

  const { error } = await supabase
    .from('vendors')
    .update(locationUpdate)
    .eq('id', user.id);

  if (error) {
    console.error('vendor-update-location error:', error);
    return errorResponse('Failed to update location', 500);
  }

  return jsonResponse({
    updated: true,
    drifted,
    distance_km: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    drift_threshold_km: driftThresholdKm,
    auto_accept_paused: drifted || !vendor.auto_accept_enabled,
  });
});
