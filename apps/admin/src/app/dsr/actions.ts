'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateDsr(
  dsrId: string,
  patch: { status?: string; resolution_notes?: string; resolved_at?: string; resolved_by?: string }
) {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('data_subject_requests').update(patch).eq('id', dsrId);
  if (error) throw new Error(error.message);
  revalidatePath('/dsr');
}

export async function createManualDsr(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) throw new Error('Unauthorised');

  const db = adminClient();
  const { error } = await db.from('data_subject_requests').insert({
    requester_type:  formData.get('requester_type') as string,
    request_type:    formData.get('request_type')   as string,
    requester_name:  (formData.get('requester_name') as string)?.trim() || null,
    requester_email: (formData.get('requester_email') as string)?.trim() || null,
    details:         (formData.get('details') as string)?.trim() || null,
    inserted_by:     'admin_manual',
    status:          'open',
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dsr');
}
