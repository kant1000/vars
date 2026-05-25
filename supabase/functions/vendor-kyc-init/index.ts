// ============================================================
// VARS Edge Function: vendor-kyc-init
// Initialises a Youverify verification session for a vendor.
// Returns { verification_url } — opened in the app's WebView.
// Called by: step-4-kyc.tsx → handleStartKyc()
// ============================================================
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAuthClient, createAdminClient } from '../_shared/supabase.ts';

const YOUVERIFY_BASE_URL = Deno.env.get('YOUVERIFY_BASE_URL') ?? 'https://api.youverify.co';
const YOUVERIFY_API_URL  = `${YOUVERIFY_BASE_URL}/v2/identity/kyc/link`;
const YOUVERIFY_API_KEY  = Deno.env.get('YOUVERIFY_API_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCors(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing auth header', 401);

    const userClient = createAuthClient(authHeader);
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return errorResponse('Unauthorized', 401);

    const { vendor_id } = await req.json();
    if (!vendor_id || vendor_id !== user.id) return errorResponse('Invalid vendor_id', 400);

    // Fetch vendor record for pre-filling Youverify form
    const adminClient = createAdminClient();
    const { data: vendor, error: vendorErr } = await adminClient
      .from('vendors')
      .select('full_name, phone_number')
      .eq('id', vendor_id)
      .single();

    if (vendorErr || !vendor) return errorResponse('Vendor not found', 404);

    // Initialize Youverify hosted KYC link
    const yvRes = await fetch(YOUVERIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: YOUVERIFY_API_KEY,
      },
      body: JSON.stringify({
        // Youverify widget config
        issuedId: vendor_id,          // our internal reference
        callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/vendor-kyc-webhook`,
        metadata: { vendor_id },
        // Pre-fill
        firstName: vendor.full_name?.split(' ')[0] ?? '',
        lastName: vendor.full_name?.split(' ').slice(1).join(' ') ?? '',
        phone: vendor.phone_number ?? '',
        // KYC type: BVN or NIN or gov ID
        verificationType: 'identity',
      }),
    });

    if (!yvRes.ok) {
      const errText = await yvRes.text();
      console.error('Youverify error:', errText);
      return errorResponse('Could not start verification. Please try again.', 502);
    }

    const yvData = await yvRes.json();
    const verificationUrl: string = yvData?.data?.url ?? yvData?.url;

    if (!verificationUrl) {
      console.error('Youverify: no URL in response', JSON.stringify(yvData));
      return errorResponse('Could not obtain verification URL.', 502);
    }

    // Mark kyc_status as 'pending' and clear any previous rejection reason
    await adminClient
      .from('vendors')
      .update({ kyc_status: 'pending', kyc_rejection_reason: null })
      .eq('id', vendor_id);

    return jsonResponse({ verification_url: verificationUrl });
  } catch (err: any) {
    console.error('vendor-kyc-init:', err);
    return errorResponse(err.message ?? 'Internal error', 500);
  }
});
