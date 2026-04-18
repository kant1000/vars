// ============================================================
// VARS Admin — Disputes list + resolution
// ============================================================
import { adminClient } from '@/lib/supabase';
import DisputeActions from './DisputeActions';
import { fmtPrice } from '@/lib/format';

const CATEGORY_LABEL: Record<string, { text: string; color: string }> = {
  vendor_no_show:        { text: 'Vendor didn\'t show up',      color: '#dc2626' },
  vendor_very_late:      { text: 'Vendor arrived very late',    color: '#d97706' },
  service_not_completed: { text: 'Service not completed',       color: '#d97706' },
  service_quality_poor:  { text: 'Poor service quality',        color: '#7c3aed' },
  wrong_service:         { text: 'Wrong service performed',     color: '#7c3aed' },
  other:                 { text: 'Other',                       color: '#6b7280' },
};

const PAGE_SIZE = 20;

interface Props {
  searchParams: { status?: string; page?: string };
}

async function getDisputes(status: string, page: number) {
  const db = adminClient();
  let query = db
    .from('disputes')
    .select(`
      id, status, resolution, reason, category, admin_notes, created_at,
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

/** How long ago the dispute was raised, and SLA urgency. */
function SlaTimer({ raisedAt }: { raisedAt: string }) {
  const hoursOpen = (Date.now() - new Date(raisedAt).getTime()) / (1000 * 60 * 60);
  const h = Math.floor(hoursOpen);
  const m = Math.floor((hoursOpen - h) * 60);

  // SLA: 24 hours. Warn at 18h, critical at 24h.
  const isWarning  = hoursOpen >= 18 && hoursOpen < 24;
  const isCritical = hoursOpen >= 24;

  const colour = isCritical ? '#dc2626' : isWarning ? '#d97706' : 'var(--text2)';
  const label  = isCritical
    ? `⚠ SLA breached — open ${h}h ${m}m`
    : isWarning
    ? `⏰ SLA warning — open ${h}h ${m}m`
    : `Open ${h}h ${m}m`;

  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: colour, marginLeft: 8 }}>
      {label}
    </span>
  );
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
            {d.category && (() => {
              const cat = CATEGORY_LABEL[d.category] ?? { text: d.category, color: '#6b7280' };
              return (
                <div style={{
                  display: 'inline-block', marginBottom: 12,
                  padding: '4px 12px', borderRadius: 6,
                  backgroundColor: cat.color + '18',
                  border: `1.5px solid ${cat.color}40`,
                  fontSize: 13, fontWeight: 700, color: cat.color,
                }}>
                  {cat.text}
                </div>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <span className={`badge badge-${d.status === 'resolved' ? 'resolved' : d.status === 'under_review' ? 'active' : 'open'}`}>
                  {d.status.replace(/_/g, ' ')}
                </span>
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text2)' }}>
                  {new Date(d.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {d.status !== 'resolved' && <SlaTimer raisedAt={d.created_at} />}
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
