// ============================================================
// VARS — vendor-confirm-zone
// Called by the vendor app's daily zone confirmation modal.
//
// GET: returns vendor's zone settings + whether confirmation
//      is needed today.
//
// POST: sets auto_accept_zone_confirmed_date = today (UTC).
//       Clears any existing drift pause if vendor is now
//       back within range.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing authorization', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorized', 401);

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ── GET: zone settings + confirmation status ──────────────
  if (req.method === 'GET') {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select(`
        auto_accept_zone_lat,
        auto_accept_zone_lng,
        auto_accept_zone_radius_km,
        auto_accept_enabled,
        auto_accept_paused_due_to_drift,
        auto_accept_zone_confirmed_date
      `)
      .eq('id', user.id)
      .single();

    if (error || !vendor) return errorResponse('Vendor not found', 404);

    const confirmedToday = vendor.auto_accept_zone_confirmed_date === today;
    const zoneConfigured = vendor.auto_accept_zone_lat != null &&
                           vendor.auto_accept_zone_lng != null &&
                           vendor.auto_accept_zone_radius_km != null;

    return jsonResponse({
      zone_configured: zoneConfigured,
      auto_accept_enabled: vendor.auto_accept_enabled,
      auto_accept_paused_due_to_drift: vendor.auto_accept_paused_due_to_drift,
      confirmed_today: confirmedToday,
      // Show confirmation prompt when zone is configured, auto-accept on, not yet confirmed today
      needs_confirmation: zoneConfigured && vendor.auto_accept_enabled && !confirmedToday,
      zone: zoneConfigured
        ? {
            lat: vendor.auto_accept_zone_lat,
            lng: vendor.auto_accept_zone_lng,
            radius_km: vendor.auto_accept_zone_radius_km,
          }
        : null,
    });
  }

  // ── POST: confirm zone for today ──────────────────────────
  if (req.method === 'POST') {
    const { error } = await supabase
      .from('vendors')
      .update({
        auto_accept_zone_confirmed_date: today,
        // Clear drift pause on explicit confirmation — vendor is actively working
        auto_accept_paused_due_to_drift: false,
      })
      .eq('id', user.id);

    if (error) {
      console.error('vendor-confirm-zone update error:', error);
      return errorResponse('Failed to confirm zone', 500);
    }

    return jsonResponse({ confirmed: true, date: today });
  }

  return errorResponse('Method not allowed', 405);
});
