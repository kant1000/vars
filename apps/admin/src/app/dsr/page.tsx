// ============================================================
// VARS Admin — Data Subject Requests (NDPA 2023 / GAID 2025)
// 30-day response deadline. Warn at 7 days remaining, critical when overdue.
// ============================================================
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import DsrActions from './DsrActions';
import DsrNewForm from './DsrNewForm';

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<string, string> = {
  access:           'Access',
  rectification:    'Rectification',
  erasure:          'Erasure (right to be forgotten)',
  restriction:      'Restriction of processing',
  portability:      'Data portability',
  objection:        'Objection',
  withdraw_consent: 'Withdraw consent',
  other:            'Other',
};

const STATUS_BADGE: Record<string, string> = {
  open:        'badge-open',
  in_progress: 'badge-active',
  completed:   'badge-verified',
  rejected:    'badge-resolved',
  withdrawn:   'badge-resolved',
};

interface Props {
  searchParams: { status?: string; page?: string };
}

async function getDsrs(status: string, page: number) {
  const db = adminClient();
  let query = db
    .from('data_subject_requests')
    .select('*', { count: 'exact' })
    .order('deadline_at', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status !== 'all') query = query.eq('status', status);
  const { data, count } = await query;
  return { dsrs: data ?? [], total: count ?? 0 };
}

function DeadlineTimer({ deadlineAt, status }: { deadlineAt: string; status: string }) {
  if (status === 'completed' || status === 'rejected' || status === 'withdrawn') return null;

  const msLeft  = new Date(deadlineAt).getTime() - Date.now();
  const daysLeft = msLeft / (1000 * 60 * 60 * 24);

  const isOverdue  = daysLeft < 0;
  const isUrgent   = daysLeft >= 0 && daysLeft < 7;

  const colour = isOverdue ? '#dc2626' : isUrgent ? '#d97706' : 'var(--text2)';
  const label  = isOverdue
    ? `⚠ Overdue by ${Math.ceil(Math.abs(daysLeft))}d`
    : isUrgent
    ? `⏰ ${Math.ceil(daysLeft)}d remaining`
    : `${Math.ceil(daysLeft)}d remaining`;

  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: colour, marginLeft: 8 }}>
      {label}
    </span>
  );
}

export default async function DsrPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  if (!admin) redirect('/login');

  const status = searchParams.status ?? 'open';
  const page   = Number(searchParams.page ?? 1);
  const { dsrs, total } = await getDsrs(status, page);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Data Subject Requests</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{total} total · 30-day NDPA deadline</span>
      </div>

      <DsrNewForm />

      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          {['all','open','in_progress','completed','rejected','withdrawn'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      {dsrs.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '64px' }}>
          No {status === 'all' ? '' : status.replace(/_/g, ' ')} requests.
        </div>
      )}

      {dsrs.map((d: any) => (
        <div key={d.id} className="detail" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span className={`badge ${STATUS_BADGE[d.status] ?? 'badge-open'}`}>
                {d.status.replace(/_/g, ' ')}
              </span>
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text2)' }}>
                {new Date(d.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <DeadlineTimer deadlineAt={d.deadline_at} status={d.status} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              Deadline: {new Date(d.deadline_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <div className="kv">
            <span className="kv-label">Request type</span>
            <span className="kv-value" style={{ fontWeight: 700 }}>
              {TYPE_LABEL[d.request_type] ?? d.request_type}
            </span>

            <span className="kv-label">Requester type</span>
            <span className="kv-value">{d.requester_type}</span>

            {d.requester_name && (
              <>
                <span className="kv-label">Name</span>
                <span className="kv-value">{d.requester_name}</span>
              </>
            )}

            {d.requester_email && (
              <>
                <span className="kv-label">Email</span>
                <span className="kv-value">
                  <a href={`mailto:${d.requester_email}`}>{d.requester_email}</a>
                </span>
              </>
            )}

            {d.user_id && (
              <>
                <span className="kv-label">User ID</span>
                <span className="kv-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.user_id}</span>
              </>
            )}

            {d.details && (
              <>
                <span className="kv-label">Details</span>
                <span className="kv-value" style={{ color: 'var(--text2)' }}>{d.details}</span>
              </>
            )}

            <span className="kv-label">Logged by</span>
            <span className="kv-value">{d.inserted_by}</span>

            {d.resolution_notes && (
              <>
                <span className="kv-label">Resolution notes</span>
                <span className="kv-value" style={{ color: 'var(--text2)' }}>{d.resolution_notes}</span>
              </>
            )}

            {d.resolved_at && (
              <>
                <span className="kv-label">Resolved</span>
                <span className="kv-value">
                  {new Date(d.resolved_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            )}
          </div>

          <DsrActions dsrId={d.id} currentStatus={d.status} adminUserId={admin.id} />
        </div>
      ))}

      {pages > 1 && (
        <div className="pagination">
          <span>Page {page} of {pages}</span>
          {page > 1     && <a href={`?status=${status}&page=${page - 1}`} className="btn btn-ghost">← Prev</a>}
          {page < pages && <a href={`?status=${status}&page=${page + 1}`} className="btn btn-ghost">Next →</a>}
        </div>
      )}
    </>
  );
}
