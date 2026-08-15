// ============================================================
// VARS Edge Function: vendor-kyc-init
// Initialises a Youverify liveness session and returns the URL of the
// widget page (apps/landing/src/app/vendor-kyc-widget) to open in the
// app's WebView.
//
// Youverify has no "hosted verification link" API — their product is
// a client-side SDK widget (confirmed against their public docs and
// npm package README, 2026-08-16). This function's job is just to
// generate the sessionId + authToken their Passive Liveness Web SDK
// needs (requires our secret API key, so must happen server-side) and
// hand the widget page a URL carrying them.
//
// The widget itself lives on the landing app, not a Supabase Edge
// Function — Supabase's Edge Functions platform forces GET responses
// to Content-Type: text/plain with a locked-down CSP sandbox regardless
// of what the function sets, blocking any browser-navigable HTML from
// being served that way (confirmed live, 2026-08-16). See the widget
// route's own comment for detail.
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
      .select('kyc_status')
      .eq('id', vendor_id)
      .single();

    if (vendorErr || !vendor) return errorResponse('Vendor not found', 404);

    // A verified vendor re-hitting this (stale nav, deep link, notification
    // retap) must not regress kyc_status back to 'pending' — that would drop
    // them from discovery without ever resetting is_active to match.
    if (vendor.kyc_status === 'verified') {
      return errorResponse('You are already verified — no need to restart identity check.', 400);
    }

    // Generate the liveness session — requires our secret key, so must
    // happen here rather than client-side in the widget.
    const yvRes = await fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/sdk/liveness/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: YOUVERIFY_API_KEY },
      body: JSON.stringify({ publicMerchantID: YOUVERIFY_PUBLIC_MERCHANT_KEY }),
    });

    if (!yvRes.ok) {
      const errText = await yvRes.text();
      console.error('vendor-kyc-init: Youverify liveness token error', yvRes.status, errText);
      return errorResponse('Could not start verification. Please try again.', 502);
    }

    const yvData = await yvRes.json();
    const sessionId: string | undefined = yvData?.data?.sessionId;
    const authToken: string | undefined = yvData?.data?.authToken;

    if (!sessionId || !authToken) {
      console.error('vendor-kyc-init: missing sessionId/authToken in response', JSON.stringify(yvData));
      return errorResponse('Could not start verification. Please try again.', 502);
    }

    const verificationUrl =
      `${KYC_WIDGET_URL}?sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(authToken)}`;

    // Mark kyc_status as 'pending', clear any previous rejection reason, and
    // record kyc_submitted_at — the only unambiguous signal that KYC was
    // actually started (kyc_status alone defaults to 'pending' at row
    // creation, so it can't distinguish "never started" from "submitted").
    await adminClient
      .from('vendors')
      .update({ kyc_status: 'pending', kyc_rejection_reason: null, kyc_submitted_at: new Date().toISOString() })
      .eq('id', vendor_id);

    return jsonResponse({ verification_url: verificationUrl });
  } catch (err: any) {
    console.error('vendor-kyc-init:', err);
    return errorResponse(err.message ?? 'Internal error', 500);
  }
});
