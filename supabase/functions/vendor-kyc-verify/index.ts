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
// Separate from YOUVERIFY_WEBHOOK_SECRET on purpose: rotating the webhook
// signing secret shouldn't silently change every stored NIN hash, and a
// leaked webhook secret shouldn't double as a NIN-guessing key.
const NIN_HASH_PEPPER          = Deno.env.get('NIN_HASH_PEPPER') ?? '';

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signPayload(body: string): Promise<string> {
  return hmacHex(YOUVERIFY_WEBHOOK_SECRET, body);
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

    // Fail closed: a missing pepper must never silently downgrade every NIN
    // hash to a deterministic function of an 11-digit ID with no secret
    // input. Better to break loudly than to quietly weaken dedup for every
    // verification until someone notices.
    if (!NIN_HASH_PEPPER) {
      console.error('vendor-kyc-verify: NIN_HASH_PEPPER is not set');
      return errorResponse('Verification is temporarily unavailable. Please try again shortly.', 500);
    }

    // Detects the same NIN verifying multiple vendor accounts (see
    // 20260816000010_vendor_kyc_nin_hash.sql) without ever storing the raw
    // NIN — only this hash rides through to vendor-kyc-webhook.
    const ninHash = await hmacHex(NIN_HASH_PEPPER, String(nin));

    // The Passive Liveness SDK's onSuccess.faceImage is a Youverify-hosted
    // URL (e.g. https://cdn.youverify.co/17868), not base64 — confirmed live,
    // 2026-08-16 ("[selfie len=64 prefix=https://cdn.youverify.co/17868]").
    // Wrapping it as `data:image/jpeg;base64,${url}` produced a malformed
    // value Youverify's NIN endpoint rejected as "Invalid Image". The NIN
    // endpoint's validations.selfie.image field accepts either a URL or
    // base64, so pass a URL through unchanged.
    const selfieStr = String(selfie);
    const selfieImage =
      selfieStr.startsWith('data:image') || selfieStr.startsWith('http')
        ? selfieStr
        : `data:image/jpeg;base64,${selfieStr}`;

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
      // TEMP diagnostic — surfaces the real Youverify NIN-endpoint error to
      // the app instead of a generic message, same pattern used to diagnose
      // vendor-kyc-init earlier. Revert once diagnosed.
      return errorResponse(`Youverify NIN ${yvRes.status}: ${errText.slice(0, 400)}`, 502);
    }

    const yvJson = await yvRes.json();
    const data = yvJson?.data ?? {};
    const found = data.status === 'found';

    // kyc_submitted_at marks a real, completed verification attempt (we have
    // a definitive answer from Youverify at this point) — set here, not at
    // session-generation time in vendor-kyc-init, so an app reload between
    // opening the identity-check screen and actually finishing it doesn't
    // get misrouted to the "pending review" screen for a check that never
    // ran. See vendor-kyc-init's doc comment for the bug this fixes.
    const adminClient = createAdminClient();
    await adminClient
      .from('vendors')
      .update({ kyc_submitted_at: new Date().toISOString() })
      .eq('id', user.id);

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
      metadata: { vendor_id: user.id, nin_hash: ninHash },
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
