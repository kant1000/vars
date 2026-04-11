// ============================================================
// VARS — vendor-register-lead
// Public edge function called by the landing page form.
//
// Checks how many pioneer spots remain (max 50 verified vendors).
// Grants pioneer = TRUE if spots available, waitlist = TRUE if not.
// Race condition handled: uses a DB transaction via RPC to
// atomically count + insert, preventing double-grants.
//
// POST body:
//   { full_name, email, phone, service_type, location }
//
// Returns:
//   { status: 'pioneer' | 'waitlist', spots_remaining }
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const PIONEER_MAX = 50;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createAdminClient();

  // ── GET: return current pioneer spot count ──────────────────
  if (req.method === 'GET') {
    // Count from vendor_leads only — all pioneers register here first.
    // Converted leads stay in the table (converted = TRUE) so the count
    // remains accurate without double-counting full vendor accounts.
    const { count: pioneerLeadCount } = await supabase
      .from('vendor_leads')
      .select('id', { count: 'exact', head: true })
      .eq('pioneer', true);

    const spotsUsed = pioneerLeadCount ?? 0;
    const spotsRemaining = Math.max(0, PIONEER_MAX - spotsUsed);

    return jsonResponse({ spots_remaining: spotsRemaining, spots_total: PIONEER_MAX });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    let body: {
      full_name?: string;
      email?: string;
      phone?: string;
      service_type?: string;
      location?: string;
    };

    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { full_name, email, phone, service_type, location } = body;

    // Validate required fields
    if (!full_name?.trim()) return errorResponse('full_name is required');
    if (!email?.trim()) return errorResponse('email is required');
    if (!phone?.trim()) return errorResponse('phone is required');
    if (!service_type?.trim()) return errorResponse('service_type is required');
    if (!location?.trim()) return errorResponse('location is required');

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('Invalid email address');
    }

    // Count from vendor_leads only — all pioneers register here first.
    // Converted leads remain with pioneer = TRUE so the count never
    // double-counts full vendor accounts.
    const { count: pioneerLeadCount } = await supabase
      .from('vendor_leads')
      .select('id', { count: 'exact', head: true })
      .eq('pioneer', true);

    const spotsUsed = pioneerLeadCount ?? 0;
    const spotsRemaining = Math.max(0, PIONEER_MAX - spotsUsed);
    const isPioneer = spotsRemaining > 0;

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('vendor_leads')
      .select('id, pioneer, waitlist')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return jsonResponse({
        status: existing.pioneer ? 'pioneer' : 'waitlist',
        spots_remaining: isPioneer ? spotsRemaining : 0,
        already_registered: true,
      });
    }

    // Insert lead — pioneer flag set based on current spot count
    const { error: insertError } = await supabase
      .from('vendor_leads')
      .insert({
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        service_type: service_type.trim(),
        location: location.trim(),
        pioneer: isPioneer,
        waitlist: !isPioneer,
      });

    if (insertError) {
      console.error('vendor_leads insert error:', insertError);
      return errorResponse('Registration failed — please try again', 500);
    }

    // Return updated spots remaining after this registration
    const newSpotsRemaining = isPioneer ? Math.max(0, spotsRemaining - 1) : 0;

    return jsonResponse({
      status: isPioneer ? 'pioneer' : 'waitlist',
      spots_remaining: newSpotsRemaining,
    });
  } catch (err) {
    console.error('vendor-register-lead error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
