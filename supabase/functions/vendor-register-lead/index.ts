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
import { welcomeEmail, getFirstName } from '../_shared/lead-copy.ts';

const PIONEER_MAX = 50;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = createAdminClient();

  // ── GET: return current pioneer spot count ──────────────────
  if (req.method === 'GET') {
    const { count: pioneerLeadCount } = await supabase
      .from('vendor_leads')
      .select('id', { count: 'exact', head: true })
      .eq('pioneer', true);

    const spotsUsed      = pioneerLeadCount ?? 0;
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

    if (!full_name?.trim())    return errorResponse('full_name is required');
    if (!email?.trim())        return errorResponse('email is required');
    if (!phone?.trim())        return errorResponse('phone is required');
    if (!service_type?.trim()) return errorResponse('service_type is required');
    if (!location?.trim())     return errorResponse('location is required');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('Invalid email address');
    }

    // Atomic pioneer slot grant via DB function — prevents race conditions
    const { data: regRows, error: regError } = await supabase
      .rpc('register_vendor_lead', {
        p_full_name:    full_name.trim(),
        p_email:        email.toLowerCase().trim(),
        p_phone:        phone.trim(),
        p_service_type: service_type.trim(),
        p_location:     location.trim(),
        p_pioneer_max:  PIONEER_MAX,
      });

    if (regError || !regRows?.[0]) {
      console.error('register_vendor_lead rpc error:', regError);
      return errorResponse('Registration failed — please try again', 500);
    }

    const reg           = regRows[0];
    const newLead       = { id: reg.lead_id as string };
    const isPioneer     = reg.is_pioneer as boolean;
    const spotsRemaining = reg.spots_remaining as number;

    if (reg.already_existed) {
      return jsonResponse({
        status:             isPioneer ? 'pioneer' : 'waitlist',
        spots_remaining:    spotsRemaining,
        already_registered: true,
      });
    }

    // Queue Day 0 welcome email — auto-approved, ready to deliver when provider is live
    const emailCopy = welcomeEmail(
      full_name.trim(),
      service_type.trim(),
      isPioneer,
      spotsRemaining,
    );

    const { error: outreachError } = await supabase
      .from('vendor_lead_outreach')
      .insert({
        lead_id:          newLead.id,
        state_from:       'PROSPECT',
        message_type:     'welcome_email',
        channel:          'email',
        message_template: emailCopy.subject, // subject stored here for email channel
        message_body:     emailCopy.text,
        status:           'approved',
        approved_at:      new Date().toISOString(),
      });

    if (outreachError) {
      // Log but don't block — registration already succeeded
      console.error('vendor-register-lead: outreach insert failed:', outreachError.message);
    }

    return jsonResponse({
      status:          isPioneer ? 'pioneer' : 'waitlist',
      spots_remaining: spotsRemaining,
    });
  } catch (err) {
    console.error('vendor-register-lead error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
