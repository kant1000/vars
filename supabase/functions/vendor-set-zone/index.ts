// ============================================================
// VARS — vendor-set-zone
// Saves the vendor's auto-accept operating zone.
//
// POST body:
//   { lat, lng, radius_km, auto_accept_enabled }
//   radius_km must be one of: 1, 2, 3, 5, 10
//
// Returns:
//   { success: true, zone: { lat, lng, radius_km }, auto_accept_enabled }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

const VALID_RADII = [1, 2, 3, 5, 10];

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  let body: {
    lat?: number;
    lng?: number;
    radius_km?: number;
    auto_accept_enabled?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { lat, lng, radius_km, auto_accept_enabled } = body;

  // Validate
  if (lat == null || typeof lat !== 'number' || lat < -90 || lat > 90) {
    return errorResponse('lat must be a number between -90 and 90');
  }
  if (lng == null || typeof lng !== 'number' || lng < -180 || lng > 180) {
    return errorResponse('lng must be a number between -180 and 180');
  }
  if (!radius_km || !VALID_RADII.includes(radius_km)) {
    return errorResponse(`radius_km must be one of: ${VALID_RADII.join(', ')}`);
  }
  if (auto_accept_enabled != null && typeof auto_accept_enabled !== 'boolean') {
    return errorResponse('auto_accept_enabled must be a boolean');
  }

  const supabase = createAdminClient();

  // Verify this user is a vendor and fetch current zone centre
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, auto_accept_zone_lat, auto_accept_zone_lng')
    .eq('id', user.id)
    .single();

  if (!vendor) return errorResponse('Vendor not found', 404);

  const update: Record<string, unknown> = {
    auto_accept_zone_lat: lat,
    auto_accept_zone_lng: lng,
    auto_accept_zone_radius_km: radius_km,
  };

  if (auto_accept_enabled != null) {
    update.auto_accept_enabled = auto_accept_enabled;
    // Disabling auto-accept also clears drift pause
    if (!auto_accept_enabled) {
      update.auto_accept_paused_due_to_drift = false;
    }
  }

  // Reset daily confirmation ONLY when the pin location actually changed.
  // Just adjusting the radius doesn't invalidate today's confirmation.
  const PIN_EPSILON = 0.0001; // ~11m — treat smaller moves as noise
  const latChanged = Math.abs((vendor.auto_accept_zone_lat ?? 0) - lat) > PIN_EPSILON;
  const lngChanged = Math.abs((vendor.auto_accept_zone_lng ?? 0) - lng) > PIN_EPSILON;
  if (latChanged || lngChanged) {
    update.auto_accept_zone_confirmed_date = null;
  }

  const { error } = await supabase
    .from('vendors')
    .update(update)
    .eq('id', user.id);

  if (error) {
    console.error('vendor-set-zone update error:', error);
    return errorResponse('Failed to save zone settings', 500);
  }

  return jsonResponse({
    success: true,
    zone: { lat, lng, radius_km },
    auto_accept_enabled: auto_accept_enabled ?? null,
    needs_confirmation: auto_accept_enabled === true,
  });
});
