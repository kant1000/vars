// ============================================================
// VARS Admin — Bookings list
// Filter by status. View booking details. Issue manual refund.
// ============================================================
export const dynamic = 'force-dynamic';

import { adminClient } from '@/lib/supabase';
import { fmtPrice } from '@/lib/format';
import { BOOKING_STATUS } from '@vars/shared';

const PAGE_SIZE = 30;

interface Props {
  searchParams: { status?: string; page?: string; q?: string };
}

const STATUS_LIST = [
  'all',
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ON_WAY,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.SERVICE_RENDERED,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.EXPIRED,
  BOOKING_STATUS.DISPUTED,
];

async function getBookings(status: string, page: number, q: string) {
  const db = adminClient();
  let query = db
    .from('bookings')
    .select(`
      id, status, service_name, service_price_kobo,
      scheduled_at, created_at, cancelled_by,
      profiles(full_name),
      vendors(full_name)
    `)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`service_name.ilike.%${q}%`);

  const { data, count } = await query;
  return { bookings: data ?? [], total: count ?? 0 };
}

export default async function BookingsPage({ searchParams }: Props) {
  const status = searchParams.status ?? 'all';
  const page   = Number(searchParams.page ?? 1);
  const q      = searchParams.q ?? '';
  const { bookings, total } = await getBookings(status, page, q);
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Bookings</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{total} total</span>
      </div>

      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          {STATUS_LIST.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input name="q" type="text" placeholder="Search service…" defaultValue={q} />
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Customer</th>
              <th>Vendor</th>
              <th>Price</th>
              <th>Scheduled</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: '32px' }}>No bookings found.</td></tr>
            )}
            {bookings.map((b: any) => (
              <tr key={b.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{b.service_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{b.id.slice(0, 8)}…</div>
                </td>
                <td>{b.profiles?.full_name ?? '—'}</td>
                <td>{b.vendors?.full_name ?? '—'}</td>
                <td style={{ fontWeight: 700 }}>{fmtPrice(b.service_price_kobo)}</td>
                <td style={{ color: 'var(--text2)' }}>
                  {new Date(b.scheduled_at).toLocaleString('en-NG', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
                  })}
                </td>
                <td>
                  <span className={`badge badge-${
                    b.status === BOOKING_STATUS.COMPLETED ? 'completed' :
                    [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.EXPIRED].includes(b.status) ? 'cancelled' :
                    b.status === BOOKING_STATUS.DISPUTED ? 'rejected' :
                    b.status === BOOKING_STATUS.PENDING ? 'pending' : 'active'
                  }`}>
                    {b.status.replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pagination">
          <span>Page {page} of {pages}</span>
          {page > 1  && <a href={`?status=${status}&q=${q}&page=${page - 1}`} className="btn btn-ghost">← Prev</a>}
          {page < pages && <a href={`?status=${status}&q=${q}&page=${page + 1}`} className="btn btn-ghost">Next →</a>}
        </div>
      )}
    </>
  );
}
