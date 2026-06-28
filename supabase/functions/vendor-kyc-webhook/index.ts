// ============================================================
// VARS Edge Function: vendor-kyc-webhook
// Receives Youverify result callback after vendor completes KYC.
// Updates vendor.kyc_status → 'verified' | 'rejected' | 'needs_review'
//
// On a clean pass:
//   1. Extracts face image (base64 data URI per Youverify docs) and legal name.
//   2. If either is missing from the webhook payload, calls the Youverify GET
//      API as a fallback before giving up.
//   3. If still missing after GET fallback, sets kyc_status = 'needs_review'
//      for admin to resolve — never silently skips.
//   4. Crops the face image passport-style, uploads raw + cropped to
//      vendor-identity-images bucket, locks profile_image_url.
//
// On rejection: sets kyc_status = 'rejected', stores reason, notifies vendor.
// ============================================================
import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { sendNotification, msg_vendor_verificationApproved, msg_vendor_verificationFailed } from '../_shared/notifications.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

const YOUVERIFY_WEBHOOK_SECRET = Deno.env.get('YOUVERIFY_WEBHOOK_SECRET') ?? '';
const YOUVERIFY_API_KEY        = Deno.env.get('YOUVERIFY_API_KEY') ?? '';
const YOUVERIFY_BASE_URL       = Deno.env.get('YOUVERIFY_BASE_URL') ?? 'https://api.youverify.co';

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

  return computed.toLowerCase() === sig.toLowerCase();
}

// Tries known field paths in priority order; logs which one succeeds.
function extractLegalName(payload: any): string | null {
  const candidates = [
    { first: payload?.data?.firstName,                  last: payload?.data?.lastName,               mid: payload?.data?.middleName },
    { first: payload?.data?.applicant?.firstName,       last: payload?.data?.applicant?.lastName,    mid: payload?.data?.applicant?.middleName },
    { first: payload?.validations?.identity?.firstName, last: payload?.validations?.identity?.lastName, mid: null },
    { first: payload?.data?.nin?.firstName,             last: payload?.data?.nin?.lastName,          mid: payload?.data?.nin?.middleName },
    { first: payload?.data?.bvn?.firstName,             last: payload?.data?.bvn?.lastName,          mid: payload?.data?.bvn?.middleName },
    { first: payload?.data?.firstName,                  last: payload?.data?.surname,                mid: null },
  ];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (typeof c.first === 'string' && c.first.trim().length > 0) {
      console.log(`vendor-kyc-webhook: legal name found at candidate index ${i}`);
      const parts = [c.first.trim(), c.mid?.trim(), c.last?.trim()].filter(Boolean);
      return parts.join(' ') || null;
    }
  }
  return null;
}

// Returns raw image bytes from a Youverify payload.
// Youverify sends the liveness image as a base64 data URI (confirmed by docs).
// Also handles HTTP URLs for forward-compatibility with other flow types.
async function extractImageBuffer(payload: any): Promise<Uint8Array | null> {
  const candidates = [
    payload?.data?.image,                                      // primary — confirmed by Youverify docs
    payload?.data?.faceImage,
    payload?.validations?.selfie?.selfieVerification?.image,
    payload?.data?.selfie?.image,
    payload?.data?.liveness?.image,
    payload?.data?.selfieImage,
    payload?.faceImage,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const val = candidates[i];
    if (typeof val !== 'string' || !val) continue;

    if (val.startsWith('data:image')) {
      console.log(`vendor-kyc-webhook: image found as base64 at candidate index ${i}`);
      const base64 = val.replace(/^data:image\/[a-z]+;base64,/i, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      return bytes;
    }

    if (val.startsWith('http')) {
      console.log(`vendor-kyc-webhook: image found as URL at candidate index ${i}`);
      const res = await fetch(val);
      if (!res.ok) {
        console.warn(`vendor-kyc-webhook: image URL fetch failed: ${res.status}`);
        continue;
      }
      return new Uint8Array(await res.arrayBuffer());
    }
  }
  return null;
}

// GET /v2/api/identity/:identityId — retrieves the full verification record.
// Used when the webhook payload is thin and missing the image or name.
async function fetchIdentityFromApi(identityId: string): Promise<any | null> {
  try {
    const res = await fetch(`${YOUVERIFY_BASE_URL}/v2/api/identity/${identityId}`, {
      headers: { token: YOUVERIFY_API_KEY },
    });
    if (!res.ok) {
      console.warn(`vendor-kyc-webhook: GET identity/${identityId} → ${res.status}`);
      return null;
    }
    const json = await res.json();
    console.log(`vendor-kyc-webhook: GET identity fallback succeeded for ${identityId}`);
    return json;
  } catch (err: any) {
    console.error('vendor-kyc-webhook: GET identity fetch failed', err?.message ?? err);
    return null;
  }
}

// Centre-square crop of the top 65% of frame, resized to 400×400.
async function cropPassportStyle(rawBuffer: Uint8Array): Promise<Uint8Array> {
  const img = await Image.decode(rawBuffer);
  const cropH = Math.floor(img.height * 0.65);
  const size  = Math.min(img.width, cropH);
  const cropX = Math.floor((img.width - size) / 2);
  img.crop(cropX, 0, size, size);
  img.resize(400, 400);
  return await img.encode(1); // 1 = JPEG
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();

  const isValid = await verifyYouverifySignature(req, rawBody);
  if (!isValid) {
    console.warn('vendor-kyc-webhook: invalid signature — rejecting request');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  // Log full payload in non-production so the first real webhook hit confirms field paths.
  if (Deno.env.get('ENVIRONMENT') !== 'production') {
    console.log('vendor-kyc-webhook: full payload', JSON.stringify(payload));
  }

  const adminClient = createAdminClient();

  const vendorId: string | undefined =
    payload?.metadata?.vendor_id ??
    payload?.issuedId ??
    payload?.data?.metadata?.vendor_id;

  if (!vendorId) {
    console.error('vendor-kyc-webhook: no vendor_id in payload', JSON.stringify(payload));
    return jsonResponse({ received: true });
  }

  // Youverify KYC Link sends status "found" with allValidationPassed boolean.
  // Legacy/eIDV flows may send success/verified/approved or failed/rejected/declined.
  const status   = (payload?.status ?? payload?.data?.status ?? '').toLowerCase();
  const allPassed = payload?.allValidationPassed ?? payload?.data?.allValidationPassed;

  const isVerified = status === 'found'
    ? allPassed === true
    : ['success', 'verified', 'approved'].includes(status);

  const isFailed = status === 'found'
    ? allPassed === false
    : ['failed', 'rejected', 'declined'].includes(status);

  if (!isVerified && !isFailed) {
    console.log('vendor-kyc-webhook: intermediate status', status, 'allPassed:', allPassed, 'for', vendorId);
    return jsonResponse({ received: true });
  }

  const reason: string = payload?.data?.reason ?? payload?.reason ?? 'Verification could not be completed';

  // ---- Rejection path ----
  if (isFailed) {
    const { error: updateErr } = await adminClient
      .from('vendors')
      .update({ kyc_status: 'rejected', kyc_rejection_reason: reason })
      .eq('id', vendorId);

    if (updateErr) {
      console.error('vendor-kyc-webhook: DB update failed (rejection)', updateErr);
      return errorResponse('DB error', 500);
    }

    const { data: vendor } = await adminClient
      .from('vendors')
      .select('push_token')
      .eq('id', vendorId)
      .single();

    if (vendor?.push_token) {
      const msg = msg_vendor_verificationFailed(reason);
      await sendNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        type: 'kyc_rejected',
        title: msg.title,
        body: msg.body,
        pushToken: vendor.push_token,
        data: { screen: '/vendor-onboarding/step-4-kyc' },
      });
    }

    console.log(`vendor-kyc-webhook: vendor ${vendorId} → rejected`);
    return jsonResponse({ received: true });
  }

  // ---- Verified path ----

  // 1. Try extracting from webhook payload
  let imageBuffer = await extractImageBuffer(payload);
  let legalName   = extractLegalName(payload);

  // 2. If either missing, try Youverify GET API
  if (!imageBuffer || !legalName) {
    const identityId = payload?.data?.id ?? payload?.id;
    if (identityId) {
      const fullData = await fetchIdentityFromApi(identityId);
      if (fullData) {
        if (!imageBuffer) imageBuffer = await extractImageBuffer(fullData?.data ?? fullData);
        if (!legalName)   legalName   = extractLegalName(fullData?.data ?? fullData);
      }
    } else {
      console.warn('vendor-kyc-webhook: no identityId in payload for GET fallback, vendor', vendorId);
    }
  }

  // 3. If still missing after GET fallback — park as needs_review, do not verify
  if (!imageBuffer || !legalName) {
    const missing = [!imageBuffer && 'image', !legalName && 'legal name'].filter(Boolean).join(' and ');
    console.warn(`vendor-kyc-webhook: missing ${missing} after GET fallback for vendor ${vendorId} — setting needs_review`);
    await adminClient.from('vendors').update({ kyc_status: 'needs_review' }).eq('id', vendorId);
    return jsonResponse({ received: true });
  }

  // 4. All data present — build DB update
  const dbUpdate: Record<string, unknown> = {
    kyc_status:           'verified',
    is_active:            true,
    kyc_rejection_reason: null,
    kyc_legal_name:       legalName,
  };

  console.log(`vendor-kyc-webhook: legal name stored for vendor ${vendorId}: ${legalName}`);

  // 5. Upload images — failure parks as needs_review rather than blocking verification
  try {
    const croppedBuffer = await cropPassportStyle(imageBuffer);

    const rawPath     = `${vendorId}/raw.jpg`;
    const profilePath = `${vendorId}/profile.jpg`;

    const { error: rawErr } = await adminClient.storage
      .from('vendor-identity-images')
      .upload(rawPath, imageBuffer, { contentType: 'image/jpeg', upsert: true });
    if (rawErr) throw new Error(`Raw upload failed: ${rawErr.message}`);

    const { error: profileErr } = await adminClient.storage
      .from('vendor-identity-images')
      .upload(profilePath, croppedBuffer, { contentType: 'image/jpeg', upsert: true });
    if (profileErr) throw new Error(`Profile upload failed: ${profileErr.message}`);

    const { data: { publicUrl: rawPublicUrl } }     = adminClient.storage.from('vendor-identity-images').getPublicUrl(rawPath);
    const { data: { publicUrl: profilePublicUrl } } = adminClient.storage.from('vendor-identity-images').getPublicUrl(profilePath);

    dbUpdate.profile_image_url     = profilePublicUrl;
    dbUpdate.profile_image_raw_url = rawPublicUrl;
    dbUpdate.profile_image_locked  = true;

    console.log(`vendor-kyc-webhook: identity images stored for vendor ${vendorId}`);
  } catch (imgErr: any) {
    console.error('vendor-kyc-webhook: image upload failed for vendor', vendorId, '—', imgErr?.message ?? imgErr);
    await adminClient.from('vendors').update({ kyc_status: 'needs_review' }).eq('id', vendorId);
    return jsonResponse({ received: true });
  }

  // 6. Write all fields in a single DB round-trip
  const { error: updateErr } = await adminClient
    .from('vendors')
    .update(dbUpdate)
    .eq('id', vendorId);

  if (updateErr) {
    console.error('vendor-kyc-webhook: DB update failed', updateErr);
    return errorResponse('DB error', 500);
  }

  // 7. Push notification
  const { data: vendor } = await adminClient
    .from('vendors')
    .select('push_token')
    .eq('id', vendorId)
    .single();

  if (vendor?.push_token) {
    const msg = msg_vendor_verificationApproved();
    await sendNotification({
      recipientId: vendorId,
      recipientType: 'vendor',
      type: 'kyc_approved',
      title: msg.title,
      body: msg.body,
      pushToken: vendor.push_token,
      data: { screen: '/vendor-tabs' },
    });
  }

  console.log(`vendor-kyc-webhook: vendor ${vendorId} → verified`);
  return jsonResponse({ received: true });
});
