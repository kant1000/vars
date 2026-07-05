// ============================================================
// VARS — vendor-check-identity
// Public endpoint — no auth required (called before sign-in).
// Accepts { identifier, type } and resolves to one of:
//   'has_account' — existing vendor with an app account
//   'lead_only'   — pre-registered on landing page, not yet in app
//   'not_found'   — unknown to VARS entirely
// Phone normalisation happens inside the SQL function.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

type IdentifierType = 'email' | 'phone';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { identifier?: string; type?: IdentifierType };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { identifier, type } = body;

  if (!identifier?.trim()) return errorResponse('identifier is required');
  if (type !== 'email' && type !== 'phone') return errorResponse('type must be email or phone');

  const supabase = createAdminClient();

  const params =
    type === 'email'
      ? { p_email: identifier.trim().toLowerCase(), p_phone: null }
      : { p_email: null, p_phone: identifier.trim() };

  const { data, error } = await supabase.rpc('check_vendor_identity', params);

  if (error) {
    console.error('check_vendor_identity rpc error:', error);
    return errorResponse('Identity check failed. Please try again.', 500);
  }

  return jsonResponse({ status: data as 'has_account' | 'lead_only' | 'not_found' });
});
