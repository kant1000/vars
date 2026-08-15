// ============================================================
// VARS Edge Function: vendor-kyc-init
// Initialises a Youverify liveness session and returns the URL of the
// widget page (apps/landing/src/app/vendor-kyc-widget) to open in the
// app's WebView.
//
// Youverify has no "hosted verification link" API — their product is
// a client-side SDK widget (confirmed against their public docs and
// npm package README, 2026-08-15). This function's job is just to
// generate the sessionId + authToken their Passive Liveness Web SDK
// needs (requires our secret API key, so must happen server-side) and
// hand the widget page a URL carrying them.
//
// The widget itself lives on the landing app, not a Supabase Edge
// Function — Supabase's Edge Functions platform forces GET responses
// to Content-Type: text/plain with a locked-down CSP sandbox regardless
// of what the function sets, blocking any browser-navigable HTML from
// being served that way (confirmed live, 2026-08-15). See the widget
// route's own comment for detail.
//
// Does NOT touch vendors.kyc_submitted_at — that's set by vendor-kyc-verify
// once a real verification attempt actually happens. Setting it here (at
// session-generation time, before the vendor has done anything) meant any
// app reload between opening this screen and finishing the liveness/NIN
// check got routed straight to the "pending review" screen, since the
// routing logic reads kyc_submitted_at as "a real attempt was made."
// Confirmed live, 2026-08-15.
//
// sessionId and the SDK's sessionToken (Youverify calls it authToken) come
// from two SEPARATE endpoints, not one — confirmed against the npm package
// README, 2026-08-15, after "Invalid or expired sessionId" errors live: the
// sessionId embedded in the /liveness/token response is NOT the one the
// Passive Liveness widget actually validates against. The SDK also defaults
// to sandbox mode, so the widget must be told whether these server-generated
// credentials came from sandbox or live.
//
// Called by: step-4-kyc.tsx → handleStartKyc()
// ============================================================
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAuthClient, createAdminClient } from '../_shared/supabase.ts';

const YOUVERIFY_BASE_URL = Deno.env.get('YOUVERIFY_BASE_URL') ?? 'https://api.youverify.co';
const YOUVERIFY_API_KEY  = Deno.env.get('YOUVERIFY_API_KEY') ?? '';
const YOUVERIFY_PUBLIC_MERCHANT_KEY = Deno.env.get('YOUVERIFY_PUBLIC_MERCHANT_KEY') ?? '';
const KYC_WIDGET_URL = 'https://www.bookwithvars.com/vendor-kyc-widget';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing auth header', 401);

    const userClient = createAuthClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return errorResponse('Unauthorized', 401);

    const { vendor_id } = await req.json();
    if (!vendor_id || vendor_id !== user.id) return errorResponse('Invalid vendor_id', 400);

    const adminClient = createAdminClient();
    const { data: vendor, error: vendorErr } = await adminClient
      .from('vendors')
      .select('kyc_status, full_name')
      .eq('id', vendor_id)
      .single();

    if (vendorErr || !vendor) return errorResponse('Vendor not found', 404);

    // A verified vendor re-hitting this (stale nav, deep link, notification
    // retap) must not regress kyc_status back to 'pending' — that would drop
    // them from discovery without ever resetting is_active to match.
    if (vendor.kyc_status === 'verified') {
      return errorResponse('You are already verified — no need to restart identity check.', 400);
    }

    // Two separate calls, both requiring our secret key so must happen here
    // rather than client-side in the widget: one for the actual sessionId
    // the Passive Liveness widget validates, one for the auth token
    // (SDK constructor field: sessionToken).
    const isSandbox = YOUVERIFY_BASE_URL.includes('sandbox');
    const deviceCorrelationId = crypto.randomUUID();

    const [sessionRes, tokenRes] = await Promise.all([
      fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/sdk/session/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: YOUVERIFY_API_KEY },
        body: JSON.stringify({
          publicMerchantID: YOUVERIFY_PUBLIC_MERCHANT_KEY,
          metadata: { vendor_id, deviceCorrelationId },
        }),
      }),
      fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/sdk/liveness/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: YOUVERIFY_API_KEY },
        body: JSON.stringify({
          publicMerchantID: YOUVERIFY_PUBLIC_MERCHANT_KEY,
          deviceCorrelationId,
        }),
      }),
    ]);

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      console.error('vendor-kyc-init: Youverify session/generate error', sessionRes.status, errText);
      return errorResponse('Could not start verification. Please try again.', 502);
    }
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('vendor-kyc-init: Youverify liveness/token error', tokenRes.status, errText);
      return errorResponse('Could not start verification. Please try again.', 502);
    }

    const sessionData = await sessionRes.json();
    const tokenData = await tokenRes.json();
    // Response shapes vary between a flat body and one nested under `data` —
    // handle both rather than guess which this endpoint uses.
    const sessionId: string | undefined = sessionData?.sessionId ?? sessionData?.data?.sessionId;
    const authToken: string | undefined = tokenData?.authToken ?? tokenData?.data?.authToken;

    if (!sessionId || !authToken) {
      console.error(
        'vendor-kyc-init: missing sessionId/authToken',
        JSON.stringify(sessionData), JSON.stringify(tokenData),
      );
      return errorResponse('Could not start verification. Please try again.', 502);
    }

    // The SDK's `user.firstName` is a required constructor field.
    const [firstName, ...rest] = (vendor.full_name ?? '').trim().split(/\s+/).filter(Boolean);
    const lastName = rest.join(' ');

    const verificationUrl =
      `${KYC_WIDGET_URL}?sessionId=${encodeURIComponent(sessionId)}` +
      `&token=${encodeURIComponent(authToken)}` +
      `&sandbox=${encodeURIComponent(String(isSandbox))}` +
      `&firstName=${encodeURIComponent(firstName || 'Vendor')}` +
      `&lastName=${encodeURIComponent(lastName)}`;

    return jsonResponse({ verification_url: verificationUrl });
  } catch (err: any) {
    console.error('vendor-kyc-init:', err);
    return errorResponse(err.message ?? 'Internal error', 500);
  }
});
