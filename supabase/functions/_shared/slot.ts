// ============================================================
// VARS — Slot availability helper (shared)
// ============================================================

import { createAdminClient } from './supabase.ts';
import { BOOKING_STATUS } from './constants.ts';

/** Statuses that mean a booking is occupying the vendor's time. */
const ACTIVE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ON_WAY,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.SERVICE_RENDERED,
];

/** Safe upper bound for any service duration — used as default lookback. */
const MAX_SERVICE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Returns true if the time range [start, end) is free for the vendor.
 *
 * Checks both tables that can occupy a vendor's time:
 *  1. vendor_calendar — no 'unavailable' or 'transport_buffer' block overlaps the range
 *  2. bookings — no active booking overlaps the range
 *
 * The two queries run in parallel.
 *
 * @param lookbackMs  How far before `start` to search for booking starts that may
 *                    overlap (i.e. a booking that started before `start` but hasn't
 *                    ended yet). Defaults to MAX_SERVICE_MS (4 h). Pass the known
 *                    service duration when available for a tighter query.
 */
export async function isSlotFree(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  start: Date,
  end: Date,
  lookbackMs = MAX_SERVICE_MS,
): Promise<boolean> {
  const [calResult, bookingResult, vendorResult] = await Promise.all([
    supabase
      .from('vendor_calendar')
      .select('id')
      .eq('vendor_id', vendorId)
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .in('block_state', ['unavailable', 'transport_buffer'])
      .limit(1),

    supabase
      .from('bookings')
      .select('id')
      .eq('vendor_id', vendorId)
      .in('status', ACTIVE_STATUSES)
      .lt('scheduled_at', end.toISOString())
      .gt('scheduled_at', new Date(start.getTime() - lookbackMs).toISOString())
      .limit(1),

    supabase
      .from('vendors')
      .select('recurring_block_weekdays')
      .eq('id', vendorId)
      .single(),
  ]);

  if ((calResult.data?.length ?? 0) > 0) return false;
  if ((bookingResult.data?.length ?? 0) > 0) return false;

  // Check recurring weekday blocks (0=Sun … 6=Sat, in WAT = UTC+1)
  const blockedDays = (vendorResult.data?.recurring_block_weekdays as number[] | null) ?? [];
  if (blockedDays.length > 0) {
    const watDay = new Date(start.getTime() + 60 * 60 * 1000).getUTCDay();
    if (blockedDays.includes(watDay)) return false;
  }

  return true;
}
