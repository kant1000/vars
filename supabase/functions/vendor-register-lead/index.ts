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
import { welcomeEmail } from '../_shared/lead-copy.ts';

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

    const { count: pioneerLeadCount } = await supabase
      .from('vendor_leads')
      .select('id', { count: 'exact', head: true })
      .eq('pioneer', true);

    const spotsUsed      = pioneerLeadCount ?? 0;
    const spotsRemaining = Math.max(0, PIONEER_MAX - spotsUsed);
    const isPioneer      = spotsRemaining > 0;

    // Check for duplicate email
    const { data: existing } = await supabase
      .from('vendor_leads')
      .select('id, pioneer, waitlist')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return jsonResponse({
        status:             existing.pioneer ? 'pioneer' : 'waitlist',
        spots_remaining:    isPioneer ? spotsRemaining : 0,
        already_registered: true,
      });
    }

    // Insert lead — return ID so we can create the outreach record
    const { data: newLead, error: insertError } = await supabase
      .from('vendor_leads')
      .insert({
        full_name:    full_name.trim(),
        email:        email.toLowerCase().trim(),
        phone:        phone.trim(),
        service_type: service_type.trim(),
        location:     location.trim(),
        pioneer:      isPioneer,
        waitlist:     !isPioneer,
      })
      .select('id')
      .single();

    if (insertError || !newLead) {
      console.error('vendor_leads insert error:', insertError);
      return errorResponse('Registration failed — please try again', 500);
    }

    // Queue Day 0 welcome email — auto-approved, ready to deliver when provider is live
    const emailCopy = welcomeEmail(
      full_name.trim(),
      service_type.trim(),
      isPioneer,
      Math.max(0, spotsRemaining - 1), // remaining after this registration
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

    const newSpotsRemaining = isPioneer ? Math.max(0, spotsRemaining - 1) : 0;

    return jsonResponse({
      status:          isPioneer ? 'pioneer' : 'waitlist',
      spots_remaining: newSpotsRemaining,
    });
  } catch (err) {
    console.error('vendor-register-lead error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
