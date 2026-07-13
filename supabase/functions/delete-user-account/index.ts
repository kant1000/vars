// ============================================================
// VARS — delete-user-account (NDPA 2023 Art. 25 right to erasure)
//
// Guard checks (in order, any fail = 400):
//   1. Active bookings (pending/accepted/on_way/arrived/service_rendered)
//   2. Open disputes
//   3. is_restricted = true on vendor
//   4. Vendor: pending_payout > 0 in payout_history
//
// What gets erased:
//   Customers: null PII on profiles, null access_details on bookings,
//     anonymise reviews → 'VARS Customer', anonymise blog_comments,
//     hard delete notifications + favourites
//   Vendors (additionally): null PII on vendors (keep kyc_status/earnings),
//     mark vendor_services inactive, note portfolio_photos for storage cleanup,
//     anonymise vendor_leads matching email, set deletion_requested_at
//
// Auth: ban_duration=876000h on auth.users (do NOT deleteUser — would cascade).
// DSR: insert erasure record (completed, system).
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';

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

  // ── Determine user type ─────────────────────────────────────
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, email, is_restricted, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const isVendor = !!vendor;

  // ── Guard 1: active bookings ────────────────────────────────
  const ACTIVE_STATUSES = ['pending', 'accepted', 'on_way', 'arrived', 'service_rendered'];
  const { count: activeBookingCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`)
    .in('status', ACTIVE_STATUSES);

  if ((activeBookingCount ?? 0) > 0) {
    return errorResponse(
      'Account cannot be deleted while bookings are in progress. Complete or cancel all active bookings first.',
      400
    );
  }

  // ── Guard 2: open disputes ──────────────────────────────────
  const { count: openDisputeCount } = await supabase
    .from('disputes')
    .select('id', { count: 'exact', head: true })
    .or(`user_id.eq.${user.id},vendor_id.eq.${user.id}`)
    .not('status', 'eq', 'resolved');

  if ((openDisputeCount ?? 0) > 0) {
    return errorResponse(
      'Account cannot be deleted while disputes are open. Wait for all disputes to be resolved.',
      400
    );
  }

  // ── Guard 3: vendor restricted ──────────────────────────────
  if (isVendor && vendor.is_restricted) {
    return errorResponse(
      'Account is restricted due to an outstanding balance. Resolve the restriction before deleting.',
      400
    );
  }

  // ── Guard 4: vendor pending payouts ────────────────────────
  if (isVendor) {
    const { count: pendingPayoutCount } = await supabase
      .from('payout_history')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', user.id)
      .eq('status', 'pending');

    if ((pendingPayoutCount ?? 0) > 0) {
      return errorResponse(
        'Account cannot be deleted while payouts are pending. Wait for all payouts to settle.',
        400
      );
    }
  }

  // ── Erasure ─────────────────────────────────────────────────
  const now = new Date().toISOString();

  // Customer: null PII on profile
  await supabase.from('profiles').update({
    full_name:         null,
    phone_number:      null,
    profile_photo_url: null,
    email:             null,
    is_deleted:        true,
    deleted_at:        now,
  }).eq('id', user.id);

  // Anonymise customer's reviews
  await supabase.from('reviews')
    .update({ reviewer_name: 'VARS Customer', reviewer_photo_url: null })
    .eq('reviewer_id', user.id);

  // Anonymise blog comments
  await supabase.from('blog_comments')
    .update({ author_name: 'VARS Customer', author_email: null })
    .eq('user_id', user.id);

  // Null out access_details from bookings where this user was the customer
  await supabase.from('bookings')
    .update({ access_details: null })
    .eq('user_id', user.id);

  // Hard delete notifications and favourites
  await supabase.from('notifications').delete().eq('user_id', user.id);
  await supabase.from('favourites').delete().eq('user_id', user.id);

  if (isVendor) {
    // Null PII on vendor row (keep kyc_status, earnings, subaccount for audit)
    await supabase.from('vendors').update({
      full_name:         null,
      email:             null,
      phone_number:      null,
      profile_image_url: null,
      is_deleted:        true,
      deleted_at:        now,
      deletion_requested_at: now,
    }).eq('id', user.id);

    // Mark all services inactive
    await supabase.from('vendor_services')
      .update({ is_active: false })
      .eq('vendor_id', user.id);

    // Anonymise matching vendor_leads entry (pre-onboarding email link)
    if (vendor.email) {
      await supabase.from('vendor_leads')
        .update({ full_name: '[Deleted]', phone: null })
        .eq('email', vendor.email);
    }

    // Note: portfolio photos in storage are NOT auto-deleted here because
    // storage.remove() is async and photos may be referenced in reviews.
    // Admin should run periodic cleanup of storage for is_deleted vendors.
    await supabase.from('vendors')
      .update({ deletion_requested_at: now })
      .eq('id', user.id);
  }

  // ── Disable auth — ban_duration prevents login without cascade-deleting rows ──
  const { error: banError } = await supabase.auth.admin.updateUser(user.id, {
    ban_duration: '876000h',
  });
  if (banError) {
    console.error('delete-user-account: ban failed:', banError.message);
    // Continue — PII is already nulled. Log and surface to admin.
  }

  // ── DSR record ──────────────────────────────────────────────
  await supabase.from('data_subject_requests').insert({
    requester_type:  isVendor ? 'vendor' : 'customer',
    request_type:    'erasure',
    status:          'completed',
    user_id:         user.id,
    inserted_by:     'system',
    resolution_notes: 'Account deletion processed automatically via in-app request. Auth account disabled (ban_duration). PII nulled per NDPA 2023 Art. 25.',
    resolved_at:     now,
  });

  return jsonResponse({ deleted: true });
});
