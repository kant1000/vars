// ============================================================
// VARS Admin — Lead Outreach Queue
// Review, edit, approve, and send queued outreach messages.
// ============================================================
export const dynamic = 'force-dynamic';

import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import OutreachTable from './OutreachTable';

const PAGE_SIZE = 50;

interface Props {
  searchParams: { status?: string; leadState?: string; channel?: string; page?: string };
}

async function getCounts() {
  const db = adminClient();
  const [total, draft, approved, sent] = await Promise.all([
    db.from('vendor_lead_outreach').select('*', { count: 'exact', head: true }),
    db.from('vendor_lead_outreach').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('vendor_lead_outreach').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    db.from('vendor_lead_outreach').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
  ]);
  return {
    total:    total.count    ?? 0,
    draft:    draft.count    ?? 0,
    approved: approved.count ?? 0,
    sent:     sent.count     ?? 0,
  };
}

async function getQueue(status: string, leadState: string, channel: string, page: number) {
  const db   = adminClient();
  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  let query = db
    .from('vendor_lead_outreach')
    .select(
      'id, lead_id, state_from, message_type, channel, message_body, status, approved_by, approved_at, sent_at, response_status, response_text, created_at, vendor_leads!inner(id, full_name, email, phone, lead_state)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') query = query.eq('status', status);
  if (leadState)                  query = query.eq('vendor_leads.lead_state', leadState);
  if (channel)                    query = query.eq('channel', channel);

  const { data, count } = await query;
  return { records: data ?? [], total: count ?? 0 };
}

export default async function OutreachQueuePage({ searchParams }: Props) {
  const status    = searchParams.status    ?? 'draft';
  const leadState = searchParams.leadState ?? '';
  const channel   = searchParams.channel   ?? '';
  const page      = Number(searchParams.page ?? 1);

  const [admin, counts, { records, total }] = await Promise.all([
    requireAdmin(),
    getCounts(),
    getQueue(status, leadState, channel, page),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Outreach Queue</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{counts.total} total messages</span>
      </div>

      {/* Metrics */}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Total in Queue</div>
          <div className="stat-value">{counts.total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Awaiting Approval</div>
          <div className="stat-value">{counts.draft}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Approved</div>
          <div className="stat-value">{counts.approved}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sent</div>
          <div className="stat-value">{counts.sent}</div>
        </div>
      </div>

      {/* Filters */}
      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select name="leadState" defaultValue={leadState}>
          <option value="">All States</option>
          <option value="PROSPECT">Prospect</option>
          <option value="COLD">Cold</option>
          <option value="VERIFIED">Verified</option>
          <option value="CONVERTED">Converted</option>
        </select>
        <select name="channel" defaultValue={channel}>
          <option value="">All Channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </select>
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      {/* Table with bulk actions */}
      <OutreachTable records={records as any[]} adminId={admin?.id ?? null} />

      {pages > 1 && (
        <div className="pagination">
          <span>Page {page} of {pages}</span>
          {page > 1 && (
            <a
              href={`?status=${status}&leadState=${leadState}&channel=${channel}&page=${page - 1}`}
              className="btn btn-ghost"
            >
              ← Prev
            </a>
          )}
          {page < pages && (
            <a
              href={`?status=${status}&leadState=${leadState}&channel=${channel}&page=${page + 1}`}
              className="btn btn-ghost"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </>
  );
}
