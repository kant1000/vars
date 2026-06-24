'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function liftRestriction(vendorId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db
    .from('vendors')
    .update({
      is_restricted: false,
      restriction_amount_owed_kobo: 0,
      restriction_reason: null,
      restriction_repayment_claimed_at: null,
      // Leave is_online = false — vendor comes back online manually
    })
    .eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/restrictions');
}
