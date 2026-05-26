// ============================================================
// VARS — paystack-initialize
// Called when user taps "Confirm & Pay" on booking review screen (§4.5 Step 3)
// Validates the booking request, initializes Paystack transaction,
// returns access_code for the Paystack inline popup.
// Booking record is created by paystack-webhook after charge.success fires.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient, generateReference } from '../_shared/paystack.ts';
import { BOOKING_STATUS } from '../_shared/constants.ts';
import { isSlotFree } from '../_shared/slot.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    // Authenticate the user
    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const {
      vendor_service_id, scheduled_at, user_location_lat, user_location_lng, user_location_address,
      access_building, access_floor, access_flat, access_code,
    } = body;

    if (!vendor_service_id || !scheduled_at || user_location_lat == null || user_location_lng == null) {
      return errorResponse('Missing required fields: vendor_service_id, scheduled_at, user_location_lat, user_location_lng');
    }

    const supabase = createAdminClient();

    // 1. Fetch the vendor service with vendor details + auto-accept zone
    const { data: vendorService, error: vsError } = await supabase
      .from('vendor_services')
      .select(`
        id,
        price_kobo,
        duration_blocks,
        is_bookable,
        service:services(id, name, is_bookable_v1),
        vendor:vendors(
          id, full_name, email, is_active, is_suspended, is_online,
          auto_accept_enabled, auto_accept_paused_due_to_drift,
          auto_accept_zone_confirmed_date, auto_accept_zone_lat,
          auto_accept_zone_lng, auto_accept_zone_radius_km
        )
      `)
      .eq('id', vendor_service_id)
      .single();

    if (vsError || !vendorService) return errorResponse('Service not found');
    if (!vendorService.is_bookable) return errorResponse('This service is not bookable');
    if (!vendorService.vendor.is_active) return errorResponse('Vendor is not active');
    if (vendorService.vendor.is_suspended) return errorResponse('Vendor is suspended');

    // 2. Fetch the user's profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', user.id)
      .single();

    const userEmail = profile?.email ?? user.email ?? '';
    if (!userEmail) return errorResponse('User email not found');

    // 3. Check for slot conflicts — ensure time slot is available
    const scheduledDate = new Date(scheduled_at);
    const durationMs = vendorService.duration_blocks * 30 * 60 * 1000;
    const slotEnd = new Date(scheduledDate.getTime() + durationMs);

    // Reject slots that are in progress or the next upcoming slot — not enough lead time.
    // Mirrors the client-side rule: earliest bookable = slot after next 30-min boundary.
    const BLOCK_MS = 30 * 60 * 1000;
    const nextSlotStart = new Date(Math.floor(Date.now() / BLOCK_MS) * BLOCK_MS + BLOCK_MS);
    if (scheduledDate <= nextSlotStart) {
      return errorResponse('This time slot is too soon to book');
    }

    // Check slot availability — vendor_calendar blocks and booking conflicts
    if (!await isSlotFree(supabase, vendorService.vendor.id, scheduledDate, slotEnd, durationMs)) {
      return errorResponse('This time slot is no longer available');
    }

    // 4. Generate unique reference and initialize Paystack transaction
    const reference = generateReference('VARS_BK');
    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    const transaction = await paystack.initializeTransaction({
      email: userEmail,
      amount: vendorService.price_kobo,
      reference,
      callback_url: 'vars://payment/callback',
      metadata: {
        // Stored in Paystack — used by webhook to create the booking
        vars_booking: {
          user_id: user.id,
          vendor_id: vendorService.vendor.id,
          vendor_service_id: vendorService.id,
          service_name: vendorService.service.name,
          service_price_kobo: vendorService.price_kobo,
          service_duration_blocks: vendorService.duration_blocks,
          scheduled_at,
          user_location_lat,
          user_location_lng,
          user_location_address: user_location_address ?? null,
          access_building: access_building ?? null,
          access_floor: access_floor ?? null,
          access_flat: access_flat ?? null,
          access_code: access_code ?? null,
        },
        cancel_action: 'close', // Paystack popup behaviour
      },
    });

    // Check if this slot is likely to be auto-accepted (hint for UX)
    // All three conditions must hold: vendor settings OK + specific slot is auto_accept
    const vendor = vendorService.vendor as any;
    const today = new Date().toISOString().slice(0, 10);
    const zoneConfirmedToday = vendor.auto_accept_zone_confirmed_date === today;
    const vendorSettingsOk =
      vendor.auto_accept_enabled &&
      !vendor.auto_accept_paused_due_to_drift &&
      zoneConfirmedToday;

    let autoAcceptLikely = false;
    if (vendorSettingsOk) {
      // Confirm the specific slot has at least one auto_accept block covering it
      const { data: autoBlock } = await supabase
        .from('vendor_calendar')
        .select('id')
        .eq('vendor_id', vendorService.vendor.id)
        .eq('block_state', 'auto_accept')
        .lte('start_time', scheduledDate.toISOString())
        .gt('end_time', scheduledDate.toISOString())
        .maybeSingle();
      autoAcceptLikely = !!autoBlock;
    }

    return jsonResponse({
      access_code: transaction.access_code,
      reference: transaction.reference,
      amount_kobo: vendorService.price_kobo,
      // UX hint: whether this booking will likely be auto-accepted
      auto_accept_likely: autoAcceptLikely,
      // Summary card data for Step 3 review screen
      booking_preview: {
        vendor_name: vendor.full_name,
        service_name: vendorService.service.name,
        price_kobo: vendorService.price_kobo,
        duration_blocks: vendorService.duration_blocks,
        scheduled_at,
        user_location_address: user_location_address ?? null,
      },
    });
  } catch (err) {
    console.error('paystack-initialize error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
