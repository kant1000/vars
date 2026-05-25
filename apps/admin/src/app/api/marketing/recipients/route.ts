import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { NextResponse }  from 'next/server';

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const serviceTypes = searchParams.getAll('service_type');  // repeated param
  const pioneer      = searchParams.get('pioneer');          // 'true' | 'false' | null
  const leadStates   = searchParams.getAll('lead_state');
  const converted    = searchParams.get('converted');

  const db    = adminClient();
  let   query = db
    .from('vendor_leads')
    .select('*', { count: 'exact', head: true })
    .eq('email_unsubscribed', false);

  if (serviceTypes.length > 0) query = query.in('service_type', serviceTypes);
  if (pioneer === 'true')       query = query.eq('pioneer', true);
  if (pioneer === 'false')      query = query.eq('pioneer', false);
  if (leadStates.length > 0)   query = query.in('lead_state', leadStates);
  if (converted === 'true')     query = query.eq('converted', true);
  if (converted === 'false')    query = query.eq('converted', false);

  const { count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}
