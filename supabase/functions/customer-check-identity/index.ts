// ============================================================
// VARS — customer-check-identity
// Public endpoint — no auth required (called before sign-in).
// Accepts { phone } and resolves to:
//   status: 'has_account' — existing customer with an app account
//           'not_found'   — unknown to VARS entirely (customers self-serve,
//                           so this means "let's create your account")
//   has_password: whether login.tsx can offer the password screen, or
//                 needs to go through OTP (also true for an account that
//                 exists but never finished setting a password)
// Phone is the only customer identifier — WhatsApp-first auth, email is
// profile metadata only, never used to identify an account.
// Phone normalisation happens inside the SQL function.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { phone } = body;

  if (!phone?.trim()) return errorResponse('phone is required');

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('check_customer_identity', { p_phone: phone.trim() });

  if (error) {
    console.error('check_customer_identity rpc error:', error);
    return errorResponse('Identity check failed. Please try again.', 500);
  }

  const row = (data as { status: 'has_account' | 'not_found'; has_password: boolean }[])[0];
  return jsonResponse({ status: row.status, has_password: row.has_password });
});
