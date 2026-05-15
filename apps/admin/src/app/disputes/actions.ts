'use server';
import { adminClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function updateDispute(disputeId: string, patch: Record<string, unknown>) {
  const db = adminClient();
  const { error } = await db.from('disputes').update(patch).eq('id', disputeId);
  if (error) throw new Error(error.message);
  revalidatePath('/disputes');
}

export async function callSettlementEdgeFn(fnName: 'paystack-release' | 'paystack-settle', bookingId: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ booking_id: bookingId, trigger: 'admin_dispute' }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.status.toString());
    throw new Error(`Edge function ${fnName} failed: ${msg}`);
  }
}
