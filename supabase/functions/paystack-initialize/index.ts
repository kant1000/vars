// ============================================================
// VARS — paystack-initialize
// Called when user taps "Book for NGN X,XXX" on the booking schedule screen.
// Accepts an array of service_ids (multi-service V2).
// Validates services, calculates total, initializes Paystack transaction.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { PaystackClient, generateReference } from '../_shared/paystack.ts';
import { BOOKING_STATUS, BASE_RADIUS_KM, TRANSPORT_FEE_TIERS, VARS_COMMISSION_PERCENT, PIONEER_BOOKINGS_THRESHOLD } from '../_shared/constants.ts';
import { isSlotFree } from '../_shared/slot.ts';

// ── Haversine distance (km) ─────────────────────────────────
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Transport surcharge lookup ──────────────────────────────
function calcTransportSurcharge(
  userLat: number, userLng: number,
  zoneLatOrNull: number | null, zoneLngOrNull: number | null
): { transportFeeKobo: number; distanceKm: number; preBufferSlots: number } {
  if (zoneLatOrNull == null || zoneLngOrNull == null) {
    return { transportFeeKobo: 0, distanceKm: 0, preBufferSlots: 0 };
  }
  const distanceKm = haversineKm(userLat, userLng, zoneLatOrNull, zoneLngOrNull);
  const kmOver = Math.max(0, distanceKm - BASE_RADIUS_KM);
  if (kmOver === 0) {
    return { transportFeeKobo: 0, distanceKm, preBufferSlots: 0 };
  }
  const tier = TRANSPORT_FEE_TIERS.find(
    (t) => kmOver > t.minKmOver && kmOver <= t.maxKmOver
  );
  if (!tier) {
    return { transportFeeKobo: 0, distanceKm, preBufferSlots: 0 };
  }
  return { transportFeeKobo: tier.feeKobo, distanceKm, preBufferSlots: tier.preBufferSlots };
}

// ── Service summary label ───────────────────────────────────
function buildServiceSummary(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('Missing authorization', 401);

    const authClient = createAuthClient(authHeader);
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const {
      service_ids,
      scheduled_at,
      user_location_lat,
      user_location_lng,
      user_location_address,
      access_building,
      access_floor,
      access_flat,
      access_code,
    } = body;

    if (
      !Array.isArray(service_ids) || service_ids.length === 0 ||
      !scheduled_at ||
      user_location_lat == null || user_location_lng == null
    ) {
      return errorResponse('Missing required fields: service_ids[], scheduled_at, user_location_lat, user_location_lng');
    }

    // Deduplicate service IDs
    const uniqueServiceIds: string[] = [...new Set(service_ids as string[])];

    const supabase = createAdminClient();

    // 1. Fetch all requested services with vendor details
    const { data: services, error: svError } = await supabase
      .from('vendor_services')
      .select(`
        id,
        vendor_id,
        service_name,
        price_kobo,
        duration_blocks,
        is_active,
        vendor:vendors(
          id, full_name, email, is_active, is_suspended, is_online,
          auto_accept_enabled, auto_accept_paused_due_to_drift,
          auto_accept_zone_confirmed_date, auto_accept_zone_lat,
          auto_accept_zone_lng, auto_accept_zone_radius_km,
          paystack_subaccount_code, pioneer, pioneer_bookings_completed
        )
      `)
      .in('id', uniqueServiceIds);

    if (svError || !services || services.length === 0) {
      return errorResponse('Services not found');
    }

    if (services.length !== uniqueServiceIds.length) {
      return errorResponse('One or more services not found');
    }

    // Validate all services belong to the same vendor
    const vendorIds = [...new Set(services.map((s) => s.vendor_id))];
    if (vendorIds.length !== 1) {
      return errorResponse('All services must belong to the same vendor');
    }

    // Validate all services are active
    const inactiveService = services.find((s) => !s.is_active);
    if (inactiveService) {
      return errorResponse(`Service "${inactiveService.service_name}" is no longer available`);
    }

    const vendor = (services[0].vendor as Record<string, unknown>);
    if (!vendor) return errorResponse('Vendor not found');
    if (!vendor.is_active) return errorResponse('Vendor is not active');
    if (vendor.is_suspended) return errorResponse('Vendor is suspended');

    // 2. Calculate totals
    const totalServiceKobo = services.reduce((sum, s) => sum + s.price_kobo, 0);
    const totalDurationBlocks = services.reduce((sum, s) => sum + s.duration_blocks, 0);
    const serviceNames = services.map((s) => s.service_name);
    const serviceSummary = buildServiceSummary(serviceNames);

    // 3. Fetch user profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone_number')
      .eq('id', user.id)
      .single();

    const userEmail = profile?.email ?? user.email ?? '';
    if (!userEmail) return errorResponse('User email not found');

    // 4. Check slot availability using total duration
    const scheduledDate = new Date(scheduled_at);
    const durationMs = totalDurationBlocks * 30 * 60 * 1000;
    const slotEnd = new Date(scheduledDate.getTime() + durationMs);

    const BLOCK_MS = 30 * 60 * 1000;
    const nextSlotStart = new Date(Math.floor(Date.now() / BLOCK_MS) * BLOCK_MS + BLOCK_MS);
    if (scheduledDate <= nextSlotStart) {
      return errorResponse('This time slot is too soon to book');
    }

    if (!await isSlotFree(supabase, vendorIds[0], scheduledDate, slotEnd, durationMs)) {
      return errorResponse('This time slot is no longer available');
    }

    // 5. Calculate transport surcharge
    const { transportFeeKobo, distanceKm, preBufferSlots } = calcTransportSurcharge(
      user_location_lat as number,
      user_location_lng as number,
      (vendor.auto_accept_zone_lat as number) ?? null,
      (vendor.auto_accept_zone_lng as number) ?? null
    );
    const totalKobo = totalServiceKobo + transportFeeKobo;

    if (transportFeeKobo > 0) {
      console.log(
        `Transport surcharge: vendor=${vendor.id} dist=${distanceKm.toFixed(2)}km ` +
        `fee=₦${transportFeeKobo / 100} preBuffers=${preBufferSlots}`
      );
    }

    // 6. Initialize Paystack transaction
    const reference = generateReference('VARS_BK');
    const paystack = new PaystackClient(Deno.env.get('PAYSTACK_SECRET_KEY')!);

    // Compute the correct split for this transaction.
    // Pioneer vendors get 100% on their first PIONEER_BOOKINGS_THRESHOLD bookings
    // (platform takes ₦0). We must check this at initialization time because the
    // split is fixed when the transaction is created — it cannot be changed at settle time.
    const subaccountCode = vendor.paystack_subaccount_code as string | null;
    const isPioneerBooking =
      vendor.pioneer === true &&
      (vendor.pioneer_bookings_completed as number) < PIONEER_BOOKINGS_THRESHOLD;

    // transaction_charge: flat kobo amount going to VARS main account.
    //   Pioneer: 0 → VARS gets ₦0, vendor subaccount gets 100% of the charge.
    //   Normal:  omit → default percentage_charge (20%) set on subaccount applies.
    const subaccountParams = subaccountCode
      ? {
          subaccount: subaccountCode,
          bearer: 'account' as const,     // VARS main account bears the Paystack fee
          ...(isPioneerBooking ? { transaction_charge: 0 } : {}),
        }
      : {};

    if (subaccountCode) {
      console.log(
        `Transaction split: vendor=${vendorIds[0]} subaccount=${subaccountCode} ` +
        `pioneer=${isPioneerBooking} ` +
        `split=${isPioneerBooking ? '100%→subaccount (Pioneer)' : `${100 - VARS_COMMISSION_PERCENT}%→subaccount`}`
      );
    } else {
      console.warn(`Vendor ${vendorIds[0]} has no paystack_subaccount_code — no split applied`);
    }

    const transaction = await paystack.initializeTransaction({
      email: userEmail,
      amount: totalKobo,
      reference,
      callback_url: 'vars://payment/callback',
      metadata: {
        vars_booking: {
          user_id: user.id,
          vendor_id: vendorIds[0],
          service_ids: uniqueServiceIds,
          service_summary: serviceSummary,
          total_service_kobo: totalServiceKobo,
          total_duration_blocks: totalDurationBlocks,
          scheduled_at,
          user_location_lat,
          user_location_lng,
          user_location_address: user_location_address ?? null,
          access_building: access_building ?? null,
          access_floor: access_floor ?? null,
          access_flat: access_flat ?? null,
          access_code: access_code ?? null,
          transport_fee_kobo: transportFeeKobo,
          distance_km: distanceKm,
          pre_transport_buffer_slots: preBufferSlots,
          is_pioneer_booking: isPioneerBooking,
        },
        cancel_action: 'close',
      },
      ...subaccountParams,
    });

    // 7. Check auto-accept likelihood for UX hint
    const today = new Date().toISOString().slice(0, 10);
    const bookingDateUTC = scheduledDate.toISOString().slice(0, 10);
    const confirmedDate = vendor.auto_accept_zone_confirmed_date;
    const zoneConfirmedToday = confirmedDate === today || confirmedDate === bookingDateUTC;
    const vendorSettingsOk =
      vendor.auto_accept_enabled &&
      !vendor.auto_accept_paused_due_to_drift &&
      zoneConfirmedToday;

    // Auto-accept is likely when vendor settings are valid and the slot is free.
    // No per-slot auto_accept calendar rows exist; day-level zone confirmation is sufficient.
    let autoAcceptLikely = false;
    if (vendorSettingsOk) {
      autoAcceptLikely = await isSlotFree(supabase, vendorIds[0], scheduledDate, slotEnd, durationMs);
    }

    return jsonResponse({
      access_code: transaction.access_code,
      reference: transaction.reference,
      amount_kobo: totalKobo,
      auto_accept_likely: autoAcceptLikely,
      booking_preview: {
        vendor_name: vendor.full_name,
        service_summary: serviceSummary,
        service_price_kobo: totalServiceKobo,
        transport_fee_kobo: transportFeeKobo,
        total_kobo: totalKobo,
        distance_km: distanceKm,
        duration_blocks: totalDurationBlocks,
        scheduled_at,
        user_location_address: user_location_address ?? null,
      },
    });
  } catch (err) {
    console.error('paystack-initialize error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500);
  }
});
