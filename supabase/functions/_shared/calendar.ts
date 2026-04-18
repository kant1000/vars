// ============================================================
// VARS — Calendar helpers (shared)
// ============================================================

import { createAdminClient } from './supabase.ts';

/**
 * Insert two 30-min transport_buffer blocks immediately after a confirmed booking ends.
 * Called for both auto-accepted and manually accepted bookings.
 *
 * Rules:
 *  - After-only (no before-buffer)
 *  - Clamped to working hours (must end by 22:00)
 *  - Skipped if a calendar block already exists in that slot
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
    const { data: existing } = await supabase
      .from('vendor_calendar')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('start_time', start.toISOString())
      .maybeSingle();

    if (!existing) {
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
