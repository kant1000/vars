// ============================================================
// VARS Edge Function: vendor-kyc-webhook
// Receives Youverify result callback after vendor completes KYC.
// Updates vendor.kyc_status → 'verified' | 'rejected'
// On a clean pass: extracts liveness face image, crops it passport-style,
// uploads both raw and cropped to vendor-identity-images storage bucket,
// and locks the profile_image_url column.
// Sends push notification with VARS brand voice.
// Registered as callback URL in vendor-kyc-init.
// ============================================================
import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import { sendNotification, msg_vendor_verificationApproved, msg_vendor_verificationFailed } from '../_shared/notifications.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

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

// Extract the legal name from the Youverify payload.
// Youverify's field paths vary by flow (NIN, BVN, CWB). We try known paths
// in priority order and log which succeeded on the first sandbox webhook hit.
function extractLegalName(payload: any): string | null {
  const candidates = [
    { first: payload?.data?.firstName,               last: payload?.data?.lastName,               mid: payload?.data?.middleName },
    { first: payload?.data?.applicant?.firstName,    last: payload?.data?.applicant?.lastName,    mid: payload?.data?.applicant?.middleName },
    { first: payload?.validations?.identity?.firstName, last: payload?.validations?.identity?.lastName, mid: null },
    { first: payload?.data?.nin?.firstName,          last: payload?.data?.nin?.lastName,          mid: payload?.data?.nin?.middleName },
    { first: payload?.data?.bvn?.firstName,          last: payload?.data?.bvn?.lastName,          mid: payload?.data?.bvn?.middleName },
    { first: payload?.data?.firstName,               last: payload?.data?.surname,                mid: null },
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

// Extract the liveness face image URL from the Youverify payload.
// Youverify's field path differs between CWB and standalone liveness flows.
// We try known paths in priority order and log which one succeeded so the
// sandbox run confirms the correct path for this integration.
function extractFaceImageUrl(payload: any): string | null {
  const candidates = [
    payload?.data?.faceImage,
    payload?.validations?.selfie?.selfieVerification?.image,
    payload?.data?.selfie?.image,
    payload?.data?.liveness?.image,
    payload?.data?.selfieImage,
    payload?.faceImage,
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === 'string' && candidates[i].startsWith('http')) {
      console.log(`vendor-kyc-webhook: face image found at candidate index ${i}`);
      return candidates[i];
    }
  }
  return null;
}

// Crop the image passport-style: centre-square of the top 65% of height, resized to 400x400.
// This is a geometric heuristic — Youverify liveness captures reliably centre the face
// in the upper portion of the frame. No ML face detection is performed.
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

  // Log full payload structure in non-production so the face image field path
  // can be confirmed from the first sandbox webhook hit.
  if (Deno.env.get('ENVIRONMENT') !== 'production') {
    console.log('vendor-kyc-webhook: full payload', JSON.stringify(payload));
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
  const status: string = (
    payload?.status ??
    payload?.data?.status ??
    ''
  ).toLowerCase();

  const isVerified = status === 'success' || status === 'verified' || status === 'approved';
  const isFailed   = status === 'failed'  || status === 'rejected' || status === 'declined';

  if (!isVerified && !isFailed) {
    // Intermediate status (e.g. 'under_review') — ignore, keep 'pending'
    console.log('vendor-kyc-webhook: intermediate status', status, 'for', vendorId);
    return jsonResponse({ received: true });
  }

  // ---- Build base DB update payload ----
  const reason: string = payload?.data?.reason ?? payload?.reason ?? 'Verification could not be completed';

  const dbUpdate: Record<string, unknown> = isVerified
    ? { kyc_status: 'verified', is_active: true, kyc_rejection_reason: null }
    : { kyc_status: 'rejected', kyc_rejection_reason: reason };

  // ---- On a clean pass: extract legal name ----
  if (isVerified) {
    const legalName = extractLegalName(payload);
    if (legalName) {
      dbUpdate.kyc_legal_name = legalName;
      console.log(`vendor-kyc-webhook: legal name stored for vendor ${vendorId}: ${legalName}`);
    } else {
      console.warn('vendor-kyc-webhook: no legal name found in payload for vendor', vendorId);
    }
  }

  // ---- On a clean pass: extract and upload identity images ----
  if (isVerified) {
    try {
      const faceImageUrl = extractFaceImageUrl(payload);

      if (!faceImageUrl) {
        console.warn('vendor-kyc-webhook: no face image URL found in payload for vendor', vendorId,
          '— profile_image_url will not be set. Admin can set manually.');
      } else {
        // Fetch the liveness image from Youverify's CDN
        const imageRes = await fetch(faceImageUrl);
        if (!imageRes.ok) {
          throw new Error(`Face image fetch failed: ${imageRes.status} ${imageRes.statusText}`);
        }
        const rawBuffer = new Uint8Array(await imageRes.arrayBuffer());

        // Crop passport-style
        const croppedBuffer = await cropPassportStyle(rawBuffer);

        const rawPath     = `${vendorId}/raw.jpg`;
        const profilePath = `${vendorId}/profile.jpg`;

        // Upload raw (audit copy)
        const { error: rawErr } = await adminClient.storage
          .from('vendor-identity-images')
          .upload(rawPath, rawBuffer, { contentType: 'image/jpeg', upsert: true });
        if (rawErr) throw new Error(`Raw upload failed: ${rawErr.message}`);

        // Upload cropped (public profile)
        const { error: profileErr } = await adminClient.storage
          .from('vendor-identity-images')
          .upload(profilePath, croppedBuffer, { contentType: 'image/jpeg', upsert: true });
        if (profileErr) throw new Error(`Profile upload failed: ${profileErr.message}`);

        const { data: { publicUrl: rawPublicUrl } } = adminClient.storage
          .from('vendor-identity-images')
          .getPublicUrl(rawPath);

        const { data: { publicUrl: profilePublicUrl } } = adminClient.storage
          .from('vendor-identity-images')
          .getPublicUrl(profilePath);

        dbUpdate.profile_image_url     = profilePublicUrl;
        dbUpdate.profile_image_raw_url = rawPublicUrl;
        dbUpdate.profile_image_locked  = true;

        console.log(`vendor-kyc-webhook: identity images stored for vendor ${vendorId}`);
      }
    } catch (imgErr: any) {
      // Image processing must never block the KYC pass.
      // Admin can set profile_image_url manually if needed.
      console.error('vendor-kyc-webhook: image processing failed for vendor', vendorId, '—', imgErr?.message ?? imgErr);
    }
  }

  // ---- Write all fields in a single DB round-trip ----
  const { error: updateErr } = await adminClient
    .from('vendors')
    .update(dbUpdate)
    .eq('id', vendorId);

  if (updateErr) {
    console.error('vendor-kyc-webhook: DB update failed', updateErr);
    return errorResponse('DB error', 500);
  }

  // ---- Push notification ----
  const { data: vendor } = await adminClient
    .from('vendors')
    .select('full_name, push_token')
    .eq('id', vendorId)
    .single();

  if (vendor?.push_token) {
    if (isVerified) {
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
    } else {
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
  }

  const newKycStatus = isVerified ? 'verified' : 'rejected';
  console.log(`vendor-kyc-webhook: vendor ${vendorId} → ${newKycStatus}`);
  return jsonResponse({ received: true });
});
