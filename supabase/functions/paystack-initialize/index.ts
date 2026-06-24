// ============================================================
// VARS — paystack-initialize
// Creates a booking record. No Paystack call happens here.
// Payment is charged at gate time when the vendor commits to travel.
// ============================================================

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient, createAuthClient } from '../_shared/supabase.ts';
import { BOOKING_STATUS, BASE_RADIUS_KM, TRANSPORT_FEE_TIERS } from '../_shared/constants.ts';
import { isSlotFree } from '../_shared/slot.ts';
import { createTransportBuffers, createPreTransportBuffers } from '../_shared/calendar.ts';
import {
  sendNotification,
  sendTransactionalEmail,
  msg_paymentAuthorized,
  msg_autoAccepted,
  msg_vendor_newBooking,
  msg_vendor_autoAccepted,
  email_bookingConfirmed_customer,
  email_bookingConfirmed_vendor,
  formatDate,
  formatTime,
  formatNaira,
} from '../_shared/notifications.ts';

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

// ── Auto-accept condition checker ───────────────────────────
async function checkAutoAccept(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  scheduledAt: string,
  durationBlocks: number,
  userLat: number,
  userLng: number
): Promise<{ shouldAutoAccept: boolean }> {
  const { data: vendor } = await supabase
    .from('vendors')
    .select(`
      auto_accept_enabled,
      auto_accept_paused_due_to_drift,
      auto_accept_zone_confirmed_date,
      auto_accept_zone_lat,
      auto_accept_zone_lng,
      auto_accept_zone_radius_km
    `)
    .eq('id', vendorId)
    .single();

  if (!vendor?.auto_accept_enabled) return { shouldAutoAccept: false };
  if (vendor.auto_accept_paused_due_to_drift) return { shouldAutoAccept: false };

  const today = new Date().toISOString().slice(0, 10);
  const bookingDate = new Date(scheduledAt).toISOString().slice(0, 10);
  const confirmedDate = vendor.auto_accept_zone_confirmed_date;
  if (confirmedDate !== today && confirmedDate !== bookingDate) return { shouldAutoAccept: false };

  if (
    vendor.auto_accept_zone_lat == null ||
    vendor.auto_accept_zone_lng == null ||
    vendor.auto_accept_zone_radius_km == null
  ) return { shouldAutoAccept: false };

  const userDistanceKm = haversineKm(
    userLat, userLng,
    vendor.auto_accept_zone_lat,
    vendor.auto_accept_zone_lng
  );
  if (userDistanceKm > vendor.auto_accept_zone_radius_km) return { shouldAutoAccept: false };

  const slotStart = new Date(scheduledAt);
  const slotEnd = new Date(slotStart.getTime() + durationBlocks * 30 * 60 * 1000);
  if (!await isSlotFree(supabase, vendorId, slotStart, slotEnd, durationBlocks * 30 * 60 * 1000)) {
    return { shouldAutoAccept: false };
  }

  console.log(`Auto-accept: all conditions met for vendor ${vendorId}, slot ${scheduledAt}`);
  return { shouldAutoAccept: true };
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

    const uniqueServiceIds: string[] = [...new Set(service_ids as string[])];
    const supabase = createAdminClient();

    // 1. Fetch services with vendor details
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
          id, full_name, email, push_token, is_active, is_suspended, is_online, is_restricted,
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

    const vendorIds = [...new Set(services.map((s) => s.vendor_id))];
    if (vendorIds.length !== 1) {
      return errorResponse('All services must belong to the same vendor');
    }

    const inactiveService = services.find((s) => !s.is_active);
    if (inactiveService) {
      return errorResponse(`Service "${inactiveService.service_name}" is no longer available`);
    }

    const vendor = (services[0].vendor as Record<string, unknown>);
    if (!vendor) return errorResponse('Vendor not found');
    if (!vendor.is_active) return errorResponse('Vendor is not active');
    if (vendor.is_suspended) return errorResponse('Vendor is suspended');
    if ((vendor as { is_restricted?: boolean }).is_restricted) {
      return errorResponse('This vendor is temporarily unavailable');
    }

    // 2. Calculate totals
    const totalServiceKobo = services.reduce((sum, s) => sum + s.price_kobo, 0);
    const totalDurationBlocks = services.reduce((sum, s) => sum + s.duration_blocks, 0);
    const serviceNames = services.map((s) => s.service_name);
    const serviceSummary = buildServiceSummary(serviceNames);

    // 3. Fetch customer profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, push_token')
      .eq('id', user.id)
      .single();

    // 4. Slot availability check
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

    // 5. Transport surcharge
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

    // 6. Auto-accept check
    const autoAcceptResult = await checkAutoAccept(
      supabase,
      vendorIds[0],
      scheduled_at,
      totalDurationBlocks,
      user_location_lat as number,
      user_location_lng as number
    );

    // 7. Create booking
    const now = new Date();
    const scheduledEnd = new Date(scheduledDate.getTime() + durationMs);
    const autoReleaseAt = new Date(scheduledEnd.getTime() + 2 * 60 * 60 * 1000);
    const userLocationPoint = `POINT(${user_location_lng} ${user_location_lat})`;

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        vendor_id: vendorIds[0],
        service_summary: serviceSummary,
        total_amount: totalServiceKobo,
        service_name: serviceSummary,
        service_price_kobo: totalServiceKobo,
        service_duration_blocks: totalDurationBlocks,
        scheduled_at,
        user_location: userLocationPoint,
        user_location_address: user_location_address ?? null,
        user_location_lat: user_location_lat,
        user_location_lng: user_location_lng,
        access_building: access_building ?? null,
        access_floor: access_floor ?? null,
        access_flat: access_flat ?? null,
        access_code: access_code ?? null,
        transport_fee_kobo: transportFeeKobo,
        distance_km: distanceKm,
        pre_transport_buffer_slots: preBufferSlots,
        status: autoAcceptResult.shouldAutoAccept ? BOOKING_STATUS.ACCEPTED : BOOKING_STATUS.PENDING,
        auto_release_at: autoReleaseAt.toISOString(),
        auto_accepted: autoAcceptResult.shouldAutoAccept,
        accepted_at: autoAcceptResult.shouldAutoAccept ? now.toISOString() : null,
      })
      .select('id, vendor_id, user_id')
      .single();

    if (bookingError || !booking) {
      console.error('Failed to create booking:', bookingError);
      return errorResponse('Booking creation failed', 500);
    }

    // 8. Create booking_services rows
    const bookingServiceRows = services.map((sv) => ({
      booking_id: booking.id,
      vendor_service_id: sv.id,
      service_name: sv.service_name,
      price_kobo: sv.price_kobo,
    }));
    const { error: bsError } = await supabase.from('booking_services').insert(bookingServiceRows);
    if (bsError) {
      console.error('Failed to create booking_services (non-fatal):', bsError);
    }

    console.log(`Booking created: ${booking.id} (auto_accept=${autoAcceptResult.shouldAutoAccept})`);

    // 9. Transport buffers if auto-accepted
    if (autoAcceptResult.shouldAutoAccept) {
      await createTransportBuffers(supabase, vendorIds[0], booking.id, scheduled_at, totalDurationBlocks);
      if (preBufferSlots > 0) {
        await createPreTransportBuffers(supabase, vendorIds[0], booking.id, scheduled_at, preBufferSlots);
      }
    }

    // 10. Notifications
    const vendorName = (vendor.full_name as string) ?? 'Your vendor';
    const clientFirstName = (profile?.full_name ?? 'Client').split(' ')[0];

    if (autoAcceptResult.shouldAutoAccept) {
      if (profile?.push_token) {
        const msg = msg_autoAccepted(vendorName, formatDate(scheduled_at), formatTime(scheduled_at));
        await sendNotification({
          recipientId: user.id,
          recipientType: 'user',
          type: 'booking_auto_accepted',
          title: msg.title,
          body: msg.body,
          bookingId: booking.id,
          pushToken: profile.push_token,
          data: { bookingId: booking.id, autoAccepted: true },
        });
      }
      const vendorPushToken = vendor.push_token as string | null;
      if (vendorPushToken) {
        const msg = msg_vendor_autoAccepted(clientFirstName, serviceSummary, formatDate(scheduled_at), formatTime(scheduled_at));
        await sendNotification({
          recipientId: vendorIds[0],
          recipientType: 'vendor',
          type: 'booking_auto_accepted',
          title: msg.title,
          body: msg.body,
          bookingId: booking.id,
          pushToken: vendorPushToken,
          data: { bookingId: booking.id, autoAccepted: true },
        });
      }

      try {
        const isPioneer = vendor.pioneer === true && (vendor.pioneer_bookings_completed as number) < 3;
        const vendorAmountKobo = isPioneer ? totalKobo : Math.round(totalKobo * 0.8);
        if (profile?.email) {
          const { subject, body: emailBody } = email_bookingConfirmed_customer({
            customerFirstName: clientFirstName,
            vendorName,
            service: serviceSummary,
            date: formatDate(scheduled_at),
            time: formatTime(scheduled_at),
            amount: `₦${formatNaira(totalKobo)}`,
          });
          await sendTransactionalEmail(profile.email, subject, emailBody);
        }
        if (vendor.email) {
          const { subject, body: emailBody } = email_bookingConfirmed_vendor({
            vendorName,
            customerFirstName: clientFirstName,
            service: serviceSummary,
            date: formatDate(scheduled_at),
            time: formatTime(scheduled_at),
            amount: `₦${formatNaira(vendorAmountKobo)}`,
          });
          await sendTransactionalEmail(vendor.email as string, subject, emailBody);
        }
      } catch (err) {
        console.error('Booking-confirmed email failed (non-fatal):', err);
      }
    } else {
      if (profile?.push_token) {
        const msg = msg_paymentAuthorized(vendorName);
        await sendNotification({
          recipientId: user.id,
          recipientType: 'user',
          type: 'booking_requested',
          title: msg.title,
          body: msg.body,
          bookingId: booking.id,
          pushToken: profile.push_token,
          data: { bookingId: booking.id },
        });
      }
      const vendorPushToken = vendor.push_token as string | null;
      const isPioneer = vendor.pioneer === true && (vendor.pioneer_bookings_completed as number) < 3;
      const vendorAmountKobo = isPioneer ? totalKobo : Math.round(totalKobo * 0.8);
      await sendNotification({
        recipientId: vendorIds[0],
        recipientType: 'vendor',
        type: 'new_booking_request',
        title: msg_vendor_newBooking(clientFirstName, serviceSummary, formatDate(scheduled_at), formatTime(scheduled_at), formatNaira(vendorAmountKobo)).title,
        body: msg_vendor_newBooking(clientFirstName, serviceSummary, formatDate(scheduled_at), formatTime(scheduled_at), formatNaira(vendorAmountKobo)).body,
        bookingId: booking.id,
        pushToken: vendorPushToken,
        data: { bookingId: booking.id },
      });
    }

    return jsonResponse({
      booking_id: booking.id,
      auto_accepted: autoAcceptResult.shouldAutoAccept,
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
