// ============================================================
// VARS — export-user-data (NDPA 2023 Art. 26 data portability)
// Returns all personal data held for the authenticated user as JSON.
// Rate-limited: one export per 24 hours (last_data_export_at column).
// Also logs a DSR record (portability, completed) for audit trail.
//
// Exclusions noted in meta:
//   - KYC biometric images (held by Youverify, VARS holds only cropped photo URL)
//   - Paystack auth codes / card tokens (PCI scope, not returned)
//   - Other users' personal data (only display names where needed for context)
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

const RATE_LIMIT_HOURS = 24;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthorised', 401);

  const authClient = createAuthClient(authHeader);
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return errorResponse('Unauthorised', 401);

  const supabase = createAdminClient();

  // Determine user type
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, last_data_export_at, full_name, email, phone_number, created_at, kyc_status, is_deleted, deletion_requested_at')
    .eq('id', user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, phone_number, profile_photo_url, email, created_at, last_data_export_at, is_deleted, deletion_requested_at')
    .eq('id', user.id)
    .maybeSingle();

  const isVendor = !!vendor;
  const lastExport = isVendor ? vendor?.last_data_export_at : profile?.last_data_export_at;

  // Rate limit check
  if (lastExport) {
    const hoursSince = (Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60);
    if (hoursSince < RATE_LIMIT_HOURS) {
      const nextAllowed = new Date(new Date(lastExport).getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000);
      return errorResponse(
        `Export rate limit reached. Next export allowed after ${nextAllowed.toISOString()}`,
        429
      );
    }
  }

  // Gather all personal data in parallel
  const [
    bookingsRes,
    reviewsRes,
    notificationsRes,
    termsRes,
  ] = await Promise.all([
    supabase.from('bookings').select(
      'id, status, service_name, service_price_kobo, scheduled_at, created_at, cancelled_at'
    ).or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`),

    supabase.from('reviews')
      .select('id, rating, comment, created_at')
      .eq('reviewer_id', user.id),

    supabase.from('notifications')
      .select('id, type, title, body, read_at, created_at')
      .eq('user_id', user.id)
      .limit(200),

    supabase.from('terms_acceptances')
      .select('document_type, document_version, accepted_at, ip_address')
      .eq('user_id', user.id),
  ]);

  // Vendor-specific tables
  let vendorSpecific: Record<string, unknown> = {};
  if (isVendor) {
    const [servicesRes, payoutsRes, photosRes] = await Promise.all([
      supabase.from('vendor_services')
        .select('service_name, category_l1, category_l2, price_kobo, duration_blocks, is_active, created_at')
        .eq('vendor_id', user.id),

      supabase.from('payout_history')
        .select('amount_kobo, status, created_at, settlement_ref')
        .eq('vendor_id', user.id),

      supabase.from('portfolio_photos')
        .select('storage_path, consent_state, created_at')
        .eq('vendor_id', user.id),
    ]);

    vendorSpecific = {
      services:       servicesRes.data ?? [],
      payout_history: payoutsRes.data  ?? [],
      portfolio_photos: photosRes.data ?? [],
    };
  }

  // Customer-specific
  let customerSpecific: Record<string, unknown> = {};
  if (!isVendor) {
    const { data: favourites } = await supabase
      .from('favourites')
      .select('vendor_id, created_at')
      .eq('user_id', user.id);
    customerSpecific = { favourites: favourites ?? [] };
  }

  const now = new Date().toISOString();
  const exportData = {
    meta: {
      exported_at:    now,
      user_id:        user.id,
      account_type:   isVendor ? 'vendor' : 'customer',
      rate_limit_note: `One export allowed per ${RATE_LIMIT_HOURS} hours.`,
      exclusions: [
        'KYC biometric capture (held by Youverify, not VARS)',
        'Paystack card tokens (PCI scope, never held by VARS)',
        'Other users PII beyond contextual display names',
      ],
    },
    account: isVendor ? {
      id:                   vendor!.id,
      full_name:            vendor!.full_name,
      email:                vendor!.email,
      phone_number:         vendor!.phone_number,
      kyc_status:           vendor!.kyc_status,
      account_created_at:   vendor!.created_at,
    } : {
      id:                   profile?.id,
      full_name:            profile?.full_name,
      email:                profile?.email ?? user.email,
      phone_number:         profile?.phone_number,
      profile_photo_url:    profile?.profile_photo_url,
      account_created_at:   profile?.created_at,
    },
    bookings:             bookingsRes.data    ?? [],
    reviews_submitted:    reviewsRes.data     ?? [],
    notifications:        notificationsRes.data ?? [],
    terms_acceptances:    termsRes.data       ?? [],
    ...vendorSpecific,
    ...customerSpecific,
  };

  // Update last_data_export_at
  if (isVendor) {
    await supabase.from('vendors').update({ last_data_export_at: now }).eq('id', user.id);
  } else {
    await supabase.from('profiles').update({ last_data_export_at: now }).eq('id', user.id);
  }

  // Insert DSR record for audit trail
  await supabase.from('data_subject_requests').insert({
    requester_type:  isVendor ? 'vendor' : 'customer',
    request_type:    'portability',
    status:          'completed',
    user_id:         user.id,
    inserted_by:     'system',
    resolution_notes: 'Data export generated automatically via in-app request.',
    resolved_at:     now,
  });

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="vars-data-export-${now.slice(0,10)}.json"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
});
