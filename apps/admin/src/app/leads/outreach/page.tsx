// ============================================================
// VARS Admin — Lead Outreach Queue
// Review, edit, approve, and send queued outreach messages.
// ============================================================
export const dynamic = 'force-dynamic';

import { adminClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import OutreachActions from './OutreachActions';

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
    _error:   total.error?.message ?? null,
  };
}

async function debugProbe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'MISSING';
  let raw: any = null;
  let fetchErr: any = null;
  try {
    const res = await fetch(`${url}/rest/v1/vendor_lead_outreach?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const body = await res.text();
    raw = { status: res.status, statusText: res.statusText, body: body.slice(0, 300) };
  } catch (e: any) {
    fetchErr = { name: e?.name, message: e?.message, cause: String(e?.cause) };
  }
  return { url, keyPresent: !!key, keyPrefix: key.slice(0, 20), raw, fetchErr };
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

  const [admin, counts, { records, total }, probe] = await Promise.all([
    requireAdmin(),
    getCounts(),
    getQueue(status, leadState, channel, page),
    debugProbe(),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Outreach Queue</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{counts.total} total messages</span>
      </div>

      {/* DEBUG — remove after diagnosis */}
      <pre style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 8, fontSize: 11, marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify({ probe, countsError: counts._error }, null, 2)}
      </pre>

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

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>Email</th>
              <th>Type</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Message</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                  No messages in queue
                </td>
              </tr>
            )}
            {(records as any[]).map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.vendor_leads.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.vendor_leads.lead_state}</div>
                </td>
                <td style={{ fontSize: 12 }}>{r.vendor_leads.email}</td>
                <td>
                  <span className="badge badge-pending">{r.message_type}</span>
                </td>
                <td style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>{r.channel}</td>
                <td>
                  <span className={`badge badge-${r.status}`}>{r.status}</span>
                </td>
                <td style={{ fontSize: 12 }}>
                  <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.message_body}
                  </div>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </td>
                <td>
                  <OutreachActions record={r} adminId={admin?.id ?? null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
