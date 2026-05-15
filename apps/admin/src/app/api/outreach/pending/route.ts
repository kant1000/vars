import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Returns lead_ids that already have a custom message in draft or approved state.
// Used by ComposePanel to grey-out leads that can't receive another blast.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db
    .from('vendor_lead_outreach')
    .select('lead_id')
    .in('status', ['draft', 'approved'])
    .eq('message_type', 'custom');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
