'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// Marks a queued payout as settled after ops has manually triggered the
// Paystack subaccount → bank transfer from the Paystack dashboard (settlement
// is manual per the subaccount model — see paystack-settle's header comment).
// Nothing else ever transitions a payout_history row out of 'settlement_queued';
// without this, queued rows accumulate forever with no way to close them out.
export async function markPayoutSettled(payoutId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db
    .from('payout_history')
    .update({ status: 'success', settled_at: new Date().toISOString() })
    .eq('id', payoutId);
  if (error) throw new Error(error.message);
  revalidatePath('/settlements');
}
