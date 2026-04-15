// ============================================================
// VARS Edge Function: vendor-kyc-webhook
// Receives Youverify result callback after vendor completes KYC.
// Updates vendor.kyc_status → 'verified' | 'rejected'
// Sends push notification with VARS brand voice.
// Registered as callback URL in vendor-kyc-init.
// ============================================================
import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { sendNotification } from '../_shared/notifications.ts';

const YOUVERIFY_WEBHOOK_SECRET = Deno.env.get('YOUVERIFY_WEBHOOK_SECRET') ?? '';

// Youverify signs payloads with X-YV-Signature (HMAC-SHA256)
async function verifyYouverifySignature(req: Request, body: string): Promise<boolean> {
  const sig = req.headers.get('X-YV-Signature') ?? req.headers.get('x-yv-signature');
  if (!sig || !YOUVERIFY_WEBHOOK_SECRET) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(YOUVERIFY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  return computed === sig;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();

  const isValid = await verifyYouverifySignature(req, rawBody);
  if (!isValid) {
    console.warn('vendor-kyc-webhook: invalid signature');
    // Return 200 to prevent retries if we ever misconfigure the secret
    return jsonResponse({ received: true });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const adminClient = createAdminClient();

  // Extract vendor_id from Youverify metadata
  const vendorId: string | undefined =
    payload?.metadata?.vendor_id ??
    payload?.issuedId ??
    payload?.data?.metadata?.vendor_id;

  if (!vendorId) {
    console.error('vendor-kyc-webhook: no vendor_id in payload', JSON.stringify(payload));
    return jsonResponse({ received: true });
  }

  // Determine outcome
  // Youverify sends status: 'success' | 'failed' | 'pending'
  const status: string = (
    payload?.status ??
    payload?.data?.status ??
    ''
  ).toLowerCase();

  const isVerified = status === 'success' || status === 'verified' || status === 'approved';
  const isFailed = status === 'failed' || status === 'rejected' || status === 'declined';

  if (!isVerified && !isFailed) {
    // Intermediate status (e.g. 'under_review') — ignore, keep 'pending'
    console.log('vendor-kyc-webhook: intermediate status', status, 'for', vendorId);
    return jsonResponse({ received: true });
  }

  const newKycStatus = isVerified ? 'verified' : 'rejected';

  // Update vendor: clean pass → also set is_active so vendor goes live immediately.
  // Rejected → is_active stays false; case appears in admin panel for review.
  const { error: updateErr } = await adminClient
    .from('vendors')
    .update(isVerified
      ? { kyc_status: 'verified', is_active: true }
      : { kyc_status: 'rejected' }
    )
    .eq('id', vendorId);

  if (updateErr) {
    console.error('vendor-kyc-webhook: DB update failed', updateErr);
    return errorResponse('DB error', 500);
  }

  // Fetch vendor's expo_push_token for notification
  const { data: vendor } = await adminClient
    .from('vendors')
    .select('full_name, expo_push_token')
    .eq('id', vendorId)
    .single();

  if (vendor?.expo_push_token) {
    if (isVerified) {
      await sendNotification({
        adminClient,
        userId: vendorId,
        pushToken: vendor.expo_push_token,
        title: "You're live on VARS 🎉",
        body: "Your profile has been verified. You'll start receiving booking requests soon — make sure your availability is set.",
        type: 'kyc_approved',
        data: { screen: '/vendor-tabs' },
      });
    } else {
      const reason: string = payload?.data?.reason ?? payload?.reason ?? 'Verification could not be completed';
      await sendNotification({
        adminClient,
        userId: vendorId,
        pushToken: vendor.expo_push_token,
        title: 'Verification update',
        body: `We couldn't verify your identity. Reason: ${reason}. Please contact VARS support to resolve this.`,
        type: 'kyc_rejected',
        data: { screen: '/vendor-onboarding/step-4-kyc' },
      });
    }
  }

  console.log(`vendor-kyc-webhook: vendor ${vendorId} → ${newKycStatus}`);
  return jsonResponse({ received: true });
});
