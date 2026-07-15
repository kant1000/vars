// ============================================================
// VARS — migrate-raw-kyc-images (ONE-TIME OPS FUNCTION)
// Moves legacy raw KYC liveness images from the public
// vendor-identity-images bucket into the private
// vendor-identity-raw bucket, then updates the DB column
// from the full public URL to the storage path.
//
// Invoke once with the service role key:
//   curl -X POST https://<project>.supabase.co/functions/v1/migrate-raw-kyc-images \
//     -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
//
// Idempotent: vendors whose profile_image_raw_url is already a
// path (not http://...) are skipped. Safe to re-run.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch all vendors whose raw URL is a full public http(s) URL
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, profile_image_raw_url')
    .like('profile_image_raw_url', 'http%');

  if (error) {
    console.error('migrate-raw-kyc-images: failed to fetch vendors', error);
    return errorResponse('Failed to fetch vendors', 500);
  }

  const results: Array<{ vendorId: string; status: string; reason?: string }> = [];

  for (const vendor of vendors ?? []) {
    const rawUrl: string = vendor.profile_image_raw_url;
    const vendorId: string = vendor.id;

    // Extract the storage path from the public URL.
    // Expected form: .../object/public/vendor-identity-images/{vendorId}/raw.jpg
    const match = rawUrl.match(/\/vendor-identity-images\/(.+)$/);
    if (!match) {
      results.push({ vendorId, status: 'skipped', reason: `URL did not match expected pattern: ${rawUrl}` });
      console.warn(`migrate-raw-kyc-images: unrecognised URL for vendor ${vendorId}: ${rawUrl}`);
      continue;
    }

    const storagePath = match[1]; // e.g. "{vendorId}/raw.jpg"

    try {
      // 1. Download from public bucket
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('vendor-identity-images')
        .download(storagePath);

      if (downloadErr || !fileData) {
        results.push({ vendorId, status: 'error', reason: `Download failed: ${downloadErr?.message}` });
        console.error(`migrate-raw-kyc-images: download failed for ${vendorId}`, downloadErr);
        continue;
      }

      const buffer = new Uint8Array(await fileData.arrayBuffer());

      // 2. Upload to private bucket
      const { error: uploadErr } = await supabase.storage
        .from('vendor-identity-raw')
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) {
        results.push({ vendorId, status: 'error', reason: `Upload failed: ${uploadErr.message}` });
        console.error(`migrate-raw-kyc-images: upload failed for ${vendorId}`, uploadErr);
        continue;
      }

      // 3. Update DB column to storage path (not public URL)
      const { error: dbErr } = await supabase
        .from('vendors')
        .update({ profile_image_raw_url: storagePath })
        .eq('id', vendorId);

      if (dbErr) {
        results.push({ vendorId, status: 'error', reason: `DB update failed: ${dbErr.message}` });
        console.error(`migrate-raw-kyc-images: DB update failed for ${vendorId}`, dbErr);
        continue;
      }

      // 4. Delete from public bucket — removes public addressability
      const { error: deleteErr } = await supabase.storage
        .from('vendor-identity-images')
        .remove([storagePath]);

      if (deleteErr) {
        // Non-fatal: file is in private bucket and DB is updated; public copy
        // will become a dangling object. Log for manual cleanup.
        console.warn(`migrate-raw-kyc-images: delete from public bucket failed for ${vendorId} — manual cleanup needed`, deleteErr);
        results.push({ vendorId, status: 'migrated_delete_failed', reason: deleteErr.message });
      } else {
        results.push({ vendorId, status: 'migrated' });
        console.log(`migrate-raw-kyc-images: ${vendorId} → moved to private bucket`);
      }
    } catch (err: any) {
      results.push({ vendorId, status: 'error', reason: err?.message ?? String(err) });
      console.error(`migrate-raw-kyc-images: unexpected error for ${vendorId}`, err);
    }
  }

  const summary = {
    total: vendors?.length ?? 0,
    migrated: results.filter(r => r.status === 'migrated').length,
    migrated_delete_failed: results.filter(r => r.status === 'migrated_delete_failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  };

  console.log('migrate-raw-kyc-images: complete', JSON.stringify(summary));
  return jsonResponse(summary);
});
