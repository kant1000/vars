// ============================================================
// VARS — vendor-set-zone
// Saves the vendor's auto-accept zone settings.
//
// The zone CENTRE is not set here: it is the vendor's base_location, owned
// by vendor-set-base-location. This function owns only the radius around it
// and the auto-accept toggle. Moving the centre (and therefore invalidating
// a daily confirmation) is vendor-set-base-location's job.
//
// POST body:
//   { radius_km, auto_accept_enabled, effective_date? }
//   radius_km must be one of: 1, 1.5
//
// Returns:
//   { success: true, radius_km, auto_accept_enabled }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

const VALID_RADII = [1, 1.5];

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
    radius_km?: number;
    auto_accept_enabled?: boolean;
    effective_date?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { radius_km, auto_accept_enabled, effective_date } = body;

  // Validate
  if (!radius_km || !VALID_RADII.includes(radius_km)) {
    return errorResponse(`radius_km must be one of: ${VALID_RADII.join(', ')}`);
  }
  if (auto_accept_enabled != null && typeof auto_accept_enabled !== 'boolean') {
    return errorResponse('auto_accept_enabled must be a boolean');
  }

  const supabase = createAdminClient();

  // Verify this user is a vendor. Auto-accept cannot be enabled without a
  // base_location to centre the zone on, so check that too.
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, base_location')
    .eq('id', user.id)
    .single();

  if (!vendor) return errorResponse('Vendor not found', 404);

  if (auto_accept_enabled === true && vendor.base_location == null) {
    return errorResponse('Set your location before turning on auto-accept', 400);
  }

  const update: Record<string, unknown> = {
    auto_accept_zone_radius_km: radius_km,
  };

  if (auto_accept_enabled != null) {
    update.auto_accept_enabled = auto_accept_enabled;
    if (!auto_accept_enabled) {
      update.auto_accept_paused_due_to_drift = false;
    }
  }

  // When enabling auto-accept, write confirmed_date atomically so the schedule
  // shows ⚡ immediately without a separate confirm-zone call. The mobile passes
  // effective_date as the local calendar date (WAT), which may be tomorrow UTC
  // after 22:00; validate ±1 day from UTC today and accept it.
  const today = new Date().toISOString().slice(0, 10);
  if (auto_accept_enabled === true && effective_date && /^\d{4}-\d{2}-\d{2}$/.test(effective_date)) {
    const diff = Math.abs(new Date(effective_date).getTime() - new Date(today).getTime());
    if (diff <= 86_400_000) {
      update.auto_accept_zone_confirmed_date = effective_date;
    }
  }

  // No pin-moved reset here any more: the zone centre is base_location, and
  // vendor-set-base-location clears auto_accept_zone_confirmed_date whenever
  // it moves. Changing only the radius does not invalidate a confirmation.

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
    radius_km,
    auto_accept_enabled: auto_accept_enabled ?? null,
    needs_confirmation: auto_accept_enabled === true,
  });
});
