// ============================================================
// VARS Admin — Disputes list + resolution
// ============================================================
import { adminClient } from '@/lib/supabase';
import DisputeActions from './DisputeActions';

const PAGE_SIZE = 20;

interface Props {
  searchParams: { status?: string; page?: string };
}

async function getDisputes(status: string, page: number) {
  const db = adminClient();
  let query = db
    .from('disputes')
    .select(`
      id, status, resolution, reason, admin_notes, created_at,
      bookings(id, service_name, service_price_kobo, status,
        profiles(full_name),
        vendors(full_name)
      )
    `)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status !== 'all') query = query.eq('status', status);
  const { data, count } = await query;
  return { disputes: data ?? [], total: count ?? 0 };
}

function fmtPrice(kobo: number) {
  return `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
}

export default async function DisputesPage({ searchParams }: Props) {
  const status = searchParams.status ?? 'open';
  const page   = Number(searchParams.page ?? 1);
  const { disputes, total } = await getDisputes(status, page);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Disputes</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{total} total</span>
      </div>

      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          {['all','open','under_review','resolved'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      {disputes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '64px' }}>
          No {status === 'all' ? '' : status} disputes.
        </div>
      )}

      {disputes.map((d: any) => {
        const booking = d.bookings;
        return (
          <div key={d.id} className="detail" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <span className={`badge badge-${d.status === 'resolved' ? 'resolved' : d.status === 'under_review' ? 'active' : 'open'}`}>
                  {d.status.replace(/_/g, ' ')}
                </span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text2)' }}>
                  {new Date(d.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {d.resolution && (
                <span className={`badge ${d.resolution === 'refund_user' ? 'badge-pending' : d.resolution === 'pay_vendor' ? 'badge-verified' : 'badge-active'}`}>
                  Resolution: {d.resolution.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="kv">
              <span className="kv-label">Service</span>
              <span className="kv-value" style={{ fontWeight: 700 }}>{booking?.service_name ?? '—'}</span>

              <span className="kv-label">Customer</span>
              <span className="kv-value">{booking?.profiles?.full_name ?? '—'}</span>

              <span className="kv-label">Vendor</span>
              <span className="kv-value">{booking?.vendors?.full_name ?? '—'}</span>

              <span className="kv-label">Booking value</span>
              <span className="kv-value">{booking ? fmtPrice(booking.service_price_kobo) : '—'}</span>

              <span className="kv-label">Reason</span>
              <span className="kv-value" style={{ color: 'var(--text2)' }}>{d.reason}</span>

              {d.admin_notes && (
                <>
                  <span className="kv-label">Admin notes</span>
                  <span className="kv-value" style={{ color: 'var(--text2)' }}>{d.admin_notes}</span>
                </>
              )}
            </div>

            {d.status !== 'resolved' && (
              <DisputeActions disputeId={d.id} bookingId={booking?.id} currentStatus={d.status} />
            )}
          </div>
        );
      })}

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
