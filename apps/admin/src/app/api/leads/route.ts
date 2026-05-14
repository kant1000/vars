import { adminClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceType = searchParams.get('serviceType');
  const converted   = searchParams.get('converted'); // 'true' | 'false'

  const db    = adminClient();
  let   query = db
    .from('vendor_leads')
    .select('id, full_name, email, phone, lead_state, converted')
    .order('full_name');

  if (serviceType)          query = query.eq('service_type', serviceType);
  if (converted === 'true') query = query.eq('converted', true);
  if (converted === 'false') query = query.eq('converted', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
