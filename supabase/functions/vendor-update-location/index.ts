// ============================================================
// VARS — vendor-update-location
// Called every 60s by the vendor app while booking status is on_way.
// Updates vendor_current_lat/lng on the vendors table so the
// customer's live tracking map can poll the latest position.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

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

    const { error } = await supabase
      .from('vendors')
      .update({ vendor_current_lat: lat, vendor_current_lng: lng })
      .eq('id', user.id);

    if (error) return errorResponse(error.message, 500);

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('vendor-update-location error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
