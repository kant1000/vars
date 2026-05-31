// ============================================================
// VARS — Calendar helpers (shared)
// ============================================================

import { createAdminClient } from './supabase.ts';
import { isSlotFree } from './slot.ts';

/**
 * Insert two 30-min transport_buffer blocks immediately after a confirmed booking ends.
 * Called for both auto-accepted and manually accepted bookings.
 *
 * Rules:
 *  - After-only (no before-buffer)
 *  - Clamped to working hours (must end by 22:00)
 *  - Skipped if the slot is occupied (vendor_calendar block or back-to-back booking)
 *  - Linked to booking via transport_buffer_source_booking_id (deleted on cancellation)
 */
export async function createTransportBuffers(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  bookingId: string,
  scheduledAt: string,
  durationBlocks: number
): Promise<void> {
  const bookingStart = new Date(scheduledAt);
  const bookingEnd = new Date(bookingStart.getTime() + durationBlocks * 30 * 60 * 1000);

  const dayOf = (d: Date) => { const b = new Date(d); b.setUTCHours(0, 0, 0, 0); return b; };
  const workEnd = (d: Date) => new Date(dayOf(d).getTime() + 22 * 60 * 60 * 1000);

  const buf1Start = bookingEnd;
  const buf1End   = new Date(bookingEnd.getTime() + 30 * 60 * 1000);
  const buf2Start = buf1End;
  const buf2End   = new Date(buf1End.getTime() + 30 * 60 * 1000);

  const candidates: { start: Date; end: Date }[] = [];
  if (buf1End <= workEnd(buf1End)) candidates.push({ start: buf1Start, end: buf1End });
  if (buf2End <= workEnd(buf2End)) candidates.push({ start: buf2Start, end: buf2End });
  if (candidates.length === 0) return;

  const inserts: Record<string, unknown>[] = [];
  for (const { start, end } of candidates) {
    if (await isSlotFree(supabase, vendorId, start, end)) {
      inserts.push({
        vendor_id: vendorId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        block_state: 'transport_buffer',
        transport_buffer_source_booking_id: bookingId,
      });
    }
  }


  if (inserts.length === 0) {
    console.log(`Transport buffers for booking ${bookingId}: slots already occupied, skipped.`);
    return;
  }

  const { error } = await supabase.from('vendor_calendar').insert(inserts);
  if (error) {
    console.error(`Failed to create transport buffers for booking ${bookingId}:`, error);
  } else {
    console.log(`Transport buffers created for booking ${bookingId} (${inserts.length} block(s))`);
  }
}

/**
 * Insert 30-min transport_buffer blocks immediately BEFORE a confirmed booking starts.
 * Only inserted when transport_fee_kobo > 0 (vendor is travelling beyond the base radius).
 *
 * Rules:
 *  - Count driven by preBufferSlots (1 or 2, matching TRANSPORT_FEE_TIERS)
 *  - Slots work backwards from booking start: slot A = start−30min, slot B = start−60min
 *  - Clamped to 07:00 UTC (= 08:00 WAT, consistent with existing 22:00 UTC post-buffer floor)
 *  - Skipped if slot is occupied — collision is logged, booking is not failed
 *  - Linked via transport_buffer_source_booking_id so all three cancel functions
 *    clean them up automatically (no changes to cancel functions needed)
 */
export async function createPreTransportBuffers(
  supabase: ReturnType<typeof createAdminClient>,
  vendorId: string,
  bookingId: string,
  scheduledAt: string,
  preBufferSlots: number
): Promise<void> {
  if (preBufferSlots === 0) return;

  const bookingStart = new Date(scheduledAt);

  // Working hours floor: 07:00 UTC = 08:00 WAT.
  // Mirrors the 22:00 UTC post-buffer ceiling in createTransportBuffers.
  const dayOf = (d: Date) => { const b = new Date(d); b.setUTCHours(0, 0, 0, 0); return b; };
  const workStart = (d: Date) => new Date(dayOf(d).getTime() + 7 * 60 * 60 * 1000);

  const candidates: { start: Date; end: Date }[] = [];

  const buf1End   = bookingStart;
  const buf1Start = new Date(bookingStart.getTime() - 30 * 60 * 1000);

  if (buf1Start >= workStart(buf1Start)) {
    candidates.push({ start: buf1Start, end: buf1End });
  } else {
    console.log(`Pre-buffer slot A clamped for booking ${bookingId}: ${buf1Start.toISOString()} before working hours`);
  }

  if (preBufferSlots >= 2) {
    const buf2End   = buf1Start;
    const buf2Start = new Date(buf1Start.getTime() - 30 * 60 * 1000);
    if (buf2Start >= workStart(buf2Start)) {
      candidates.push({ start: buf2Start, end: buf2End });
    } else {
      console.log(`Pre-buffer slot B clamped for booking ${bookingId}: ${buf2Start.toISOString()} before working hours`);
    }
  }

  if (candidates.length === 0) return;

  const inserts: Record<string, unknown>[] = [];
  for (const { start, end } of candidates) {
    if (await isSlotFree(supabase, vendorId, start, end)) {
      inserts.push({
        vendor_id: vendorId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        block_state: 'transport_buffer',
        transport_buffer_source_booking_id: bookingId,
      });
    } else {
      console.warn(`Pre-buffer collision for booking ${bookingId} at ${start.toISOString()} — slot occupied, skipping`);
    }
  }

  if (inserts.length === 0) return;

  const { error } = await supabase.from('vendor_calendar').insert(inserts);
  if (error) {
    console.error(`Failed to create pre-transport buffers for booking ${bookingId}:`, error);
  } else {
    console.log(`Pre-transport buffers created for booking ${bookingId} (${inserts.length} slot(s))`);
  }
}
