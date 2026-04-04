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
    const { vendor_service_id, scheduled_at, user_location_lat, user_location_lng, user_location_address } = body;

    if (!vendor_service_id || !scheduled_at || user_location_lat == null || user_location_lng == null) {
      return errorResponse('Missing required fields: vendor_service_id, scheduled_at, user_location_lat, user_location_lng');
    }

    const supabase = createAdminClient();

    // 1. Fetch the vendor service with vendor details
    const { data: vendorService, error: vsError } = await supabase
      .from('vendor_services')
      .select(`
        id,
        price_kobo,
        duration_blocks,
        is_bookable,
        service:services(id, name, is_bookable_v1),
        vendor:vendors(id, full_name, email, is_active, is_suspended, is_online)
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

    // Check existing accepted bookings that overlap
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('vendor_id', vendorService.vendor.id)
      .in('status', ['pending', 'accepted', 'on_way', 'arrived', 'service_rendered'])
      .lt('scheduled_at', slotEnd.toISOString())
      .gt('scheduled_at', new Date(scheduledDate.getTime() - durationMs).toISOString());

    if (conflicts && conflicts.length > 0) {
      return errorResponse('This time slot is no longer available');
    }

    // Check vendor unavailability
    const { data: unavailable } = await supabase
      .from('vendor_unavailability')
      .select('id')
      .eq('vendor_id', vendorService.vendor.id)
      .lt('start_time', slotEnd.toISOString())
      .gt('end_time', scheduledDate.toISOString());

    if (unavailable && unavailable.length > 0) {
      return errorResponse('Vendor is unavailable at this time');
    }

    // 4. Generate unique reference and initialize Paystack transaction
    const reference = generateReference('VARS_BK');
    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    const transaction = await paystack.initializeTransaction({
      email: userEmail,
      amount: vendorService.price_kobo,
      reference,
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
        },
        cancel_action: 'close', // Paystack popup behaviour
      },
    });

    return jsonResponse({
      access_code: transaction.access_code,
      reference: transaction.reference,
      amount_kobo: vendorService.price_kobo,
      // Summary card data for Step 3 review screen
      booking_preview: {
        vendor_name: vendorService.vendor.full_name,
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
