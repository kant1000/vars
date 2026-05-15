'use server';
import { adminClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function updateVendor(vendorId: string, patch: Record<string, unknown>) {
  const db = adminClient();
  const { error } = await db.from('vendors').update(patch).eq('id', vendorId);
  if (error) throw new Error(error.message);
  revalidatePath('/vendors');
}
