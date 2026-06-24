'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function liftRestriction(vendorId: string) {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Unauthorised');
  const db = adminClient();
  const now = new Date().toISOString();

  const { error } = await db
    .from('vendors')
    .update({
      is_restricted: false,
      restriction_amount_owed_kobo: 0,
      restriction_reason: null,
      restriction_repayment_claimed_at: null,
      restriction_lifted_at: now,
      restriction_lifted_by: admin.email,
      // Leave is_online = false — vendor comes back online manually
    })
    .eq('id', vendorId);
  if (error) throw new Error(error.message);

  // Notify vendor via inbox so they know their account is active again
  await db.from('notifications').insert({
    recipient_id: vendorId,
    recipient_type: 'vendor',
    type: 'restriction_lifted',
    title: 'Account active',
    body: 'Your account restriction has been lifted. Go online to start taking bookings again.',
    created_at: now,
  });

  revalidatePath('/restrictions');
}
