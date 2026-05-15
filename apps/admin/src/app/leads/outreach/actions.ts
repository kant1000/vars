'use server';
import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateOutreach(id: string, patch: Record<string, unknown>) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db.from('vendor_lead_outreach').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/leads/outreach');
}

export async function updateManyOutreach(ids: string[], patch: Record<string, unknown>) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  if (ids.length === 0) return;
  const db = adminClient();
  const { error } = await db.from('vendor_lead_outreach').update(patch).in('id', ids);
  if (error) throw new Error(error.message);
  revalidatePath('/leads/outreach');
}

export async function createOutreachMessages(
  messages: {
    lead_id: string;
    state_from: string;
    message_type: string;
    channel: string;
    message_template: string;
    message_body: string;
    status: string;
    approved_by: string | null;
    approved_at: string;
  }[]
) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  if (messages.length === 0) return;
  const db = adminClient();
  const { error } = await db.from('vendor_lead_outreach').insert(messages);
  if (error) throw new Error(error.message);
  revalidatePath('/leads/outreach');
}

export async function markLeadOutreach(leadId: string) {
  if (!(await requireAdmin())) throw new Error('Unauthorised');
  const db = adminClient();
  const { error } = await db
    .from('vendor_leads')
    .update({ last_outreach: new Date().toISOString() })
    .eq('id', leadId);
  if (error) throw new Error(error.message);
}
