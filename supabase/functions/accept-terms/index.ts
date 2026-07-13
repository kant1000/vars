// ============================================================
// VARS — accept-terms
// Records clickwrap document acceptances for a signed-in user.
// Called from: mobile terms-acceptance screen, landing page
// (vendor-register-lead handles vendor_leads separately).
//
// POST body:
//   { acceptances: [{ document_type, document_version }] }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthorised', 401);

  // Verify the JWT and get the authenticated user
  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorised', 401);

  let body: { acceptances?: { document_type: string; document_version: string }[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!Array.isArray(body.acceptances) || body.acceptances.length === 0) {
    return errorResponse('acceptances array is required', 400);
  }

  const VALID_DOC_TYPES = new Set([
    'customer_terms', 'privacy_policy', 'vendor_terms', 'vendor_privacy_policy',
  ]);

  for (const a of body.acceptances) {
    if (!VALID_DOC_TYPES.has(a.document_type)) {
      return errorResponse(`Invalid document_type: ${a.document_type}`, 400);
    }
    if (!a.document_version?.trim()) {
      return errorResponse('document_version is required', 400);
    }
  }

  // Extract client IP (Supabase edge runs behind Deno Deploy — IP is in x-forwarded-for)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  const rows = body.acceptances.map((a) => ({
    user_id:          user.id,
    document_type:    a.document_type,
    document_version: a.document_version.trim(),
    ip_address:       ip,
    user_agent:       userAgent,
  }));

  const supabase = createAdminClient();
  const { error } = await supabase.from('terms_acceptances').insert(rows);
  if (error) {
    console.error('accept-terms insert error:', error);
    return errorResponse('Failed to record acceptance', 500);
  }

  return jsonResponse({ accepted: rows.length });
});
