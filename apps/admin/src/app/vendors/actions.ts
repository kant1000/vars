'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateVendor(vendorId: string, patch: Record<string, unknown>) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendors').update(patch).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}
