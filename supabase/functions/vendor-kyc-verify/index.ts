// ============================================================
// VARS Edge Function: vendor-kyc-verify
// Called by step-4-kyc.tsx after the liveness widget captures a selfie.
// Verifies the vendor's NIN + selfie against Youverify's synchronous
// NIN eIDV endpoint (POST /v2/api/identity/ng/nin), then reuses
// vendor-kyc-webhook's existing storage/notification/is_active logic
// by constructing a payload in the shape that webhook already expects
// (Youverify's async KYC Link callback shape) and calling it internally
// with a validly-signed request — avoids duplicating that logic here.
//
// VARS never stores the raw NIN — it's only ever passed through in this
// request, never written to the vendors table.
// ============================================================
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAuthClient, createAdminClient } from '../_shared/supabase.ts';

const YOUVERIFY_BASE_URL       = Deno.env.get('YOUVERIFY_BASE_URL') ?? 'https://api.youverify.co';
const YOUVERIFY_API_KEY        = Deno.env.get('YOUVERIFY_API_KEY') ?? '';
const YOUVERIFY_WEBHOOK_SECRET = Deno.env.get('YOUVERIFY_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';

async function signPayload(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(YOUVERIFY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return errorResponse('Unauthorized', 401);

    const { nin, selfie } = await req.json();
    if (!nin || !/^\d{11}$/.test(String(nin))) {
      return errorResponse('Enter a valid 11-digit NIN.', 400);
    }
    if (!selfie) return errorResponse('Missing selfie image.', 400);

    const selfieImage = String(selfie).startsWith('data:image')
      ? selfie
      : `data:image/jpeg;base64,${selfie}`;

    const yvRes = await fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/ng/nin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: YOUVERIFY_API_KEY },
      body: JSON.stringify({
        id: nin,
        isSubjectConsent: true,
        validations: { selfie: { image: selfieImage } },
      }),
    });

    if (!yvRes.ok) {
      const errText = await yvRes.text();
      console.error('vendor-kyc-verify: Youverify NIN error', yvRes.status, errText);
      return errorResponse('Could not verify your identity. Please try again.', 502);
    }

    const yvJson = await yvRes.json();
    const data = yvJson?.data ?? {};
    const found = data.status === 'found';

    // Shaped to match what vendor-kyc-webhook already parses from Youverify's
    // async KYC Link callback — reuses its image crop/upload, legal-name
    // extraction, notifications, and is_active-flip logic unchanged.
    const webhookPayload = {
      status: found ? 'found' : 'failed',
      allValidationPassed: found ? data.allValidationPassed : undefined,
      reason: !found
        ? 'We could not find a match for this NIN. Please check the number and try again.'
        : (data.reason ?? undefined),
      data: {
        ...data,
        image: selfieImage, // the live selfie just captured, not the official NIN photo
      },
      metadata: { vendor_id: user.id },
      issuedId: user.id,
      id: data.id,
    };
    const body = JSON.stringify(webhookPayload);
    const signature = await signPayload(body);

    const webhookRes = await fetch(`${SUPABASE_URL}/functions/v1/vendor-kyc-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-YV-Signature': signature },
      body,
    });

    if (!webhookRes.ok) {
      console.error('vendor-kyc-verify: internal webhook call failed', webhookRes.status, await webhookRes.text());
      return errorResponse('Could not finalize verification. Please try again.', 502);
    }

    return jsonResponse({
      success: true,
      allValidationPassed: found ? data.allValidationPassed : false,
      reason: webhookPayload.reason ?? null,
    });
  } catch (err: any) {
    console.error('vendor-kyc-verify:', err);
    return errorResponse(err.message ?? 'Internal error', 500);
  }
});
