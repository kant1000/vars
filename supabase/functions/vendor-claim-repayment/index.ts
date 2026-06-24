// ============================================================
// VARS — vendor-claim-repayment
// Called when a restricted vendor taps "I've paid" on the
// restriction blocking screen.
//
// Records the timestamp of the claim. Admin sees this in the
// restrictions queue (apps/admin/src/app/restrictions) and
// confirms or rejects. If confirmed, admin lifts is_restricted.
//
// This endpoint does NOT verify payment — it only records the claim.
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

    const supabase = createAdminClient();

    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, is_restricted, restriction_amount_owed_kobo, restriction_repayment_claimed_at')
      .eq('id', user.id)
      .single();

    if (vendorError || !vendor) return errorResponse('Vendor not found', 404);

    if (!vendor.is_restricted) {
      return errorResponse('Account is not restricted', 409);
    }

    if (vendor.restriction_repayment_claimed_at) {
      // Already claimed — idempotent response
      console.log(`Vendor ${user.id}: repayment already claimed at ${vendor.restriction_repayment_claimed_at}`);
      return jsonResponse({
        success: true,
        already_claimed: true,
        claimed_at: vendor.restriction_repayment_claimed_at,
      });
    }

    const now = new Date().toISOString();

    await supabase
      .from('vendors')
      .update({ restriction_repayment_claimed_at: now })
      .eq('id', user.id);

    console.log(
      `Vendor ${user.id} claimed repayment of ₦${(vendor.restriction_amount_owed_kobo / 100).toLocaleString()} ` +
      `at ${now} — pending admin confirmation`
    );

    return jsonResponse({
      success: true,
      already_claimed: false,
      claimed_at: now,
      amount_owed_kobo: vendor.restriction_amount_owed_kobo,
    });
  } catch (err) {
    console.error('vendor-claim-repayment error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
