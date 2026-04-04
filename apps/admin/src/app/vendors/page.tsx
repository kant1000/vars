// ============================================================
// VARS Admin — Vendors list
// Filter by kyc_status. Approve / reject vendors.
// Toggle VARS Choice badge.
// ============================================================
import { adminClient } from '@/lib/supabase';
import VendorActions from './VendorActions';

const PAGE_SIZE = 30;

interface Props {
  searchParams: { status?: string; page?: string; q?: string };
}

async function getVendors(status: string, page: number, q: string) {
  const db = adminClient();
  let query = db
    .from('vendors')
    .select('id, full_name, phone_number, kyc_status, avg_rating, total_reviews, badge_vars_choice, badge_top_rated, created_at, is_online')
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status !== 'all') query = query.eq('kyc_status', status);
  if (q) query = query.ilike('full_name', `%${q}%`);

  const { data, count } = await query;
  return { vendors: data ?? [], total: count ?? 0 };
}

export default async function VendorsPage({ searchParams }: Props) {
  const status = searchParams.status ?? 'pending';
  const page   = Number(searchParams.page ?? 1);
  const q      = searchParams.q ?? '';
  const { vendors, total } = await getVendors(status, page, q);
  const pages = Math.ceil(total / PAGE_SIZE);

  const KYC_TABS = ['all', 'pending', 'verified', 'rejected'];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Vendors</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{total} total</span>
      </div>

      {/* Filters */}
      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          {KYC_TABS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <input name="q" type="text" placeholder="Search by name…" defaultValue={q} />
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>KYC status</th>
              <th>Rating</th>
              <th>Online</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: '32px' }}>No vendors found.</td></tr>
            )}
            {vendors.map((v: any) => (
              <tr key={v.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{v.full_name}</div>
                  {v.badge_vars_choice && <span className="badge badge-active" style={{ marginTop: 2 }}>VARS Choice</span>}
                  {v.badge_top_rated  && <span className="badge badge-verified" style={{ marginTop: 2, marginLeft: 4 }}>Top Rated</span>}
                </td>
                <td>{v.phone_number}</td>
                <td>
                  <span className={`badge badge-${v.kyc_status}`}>{v.kyc_status}</span>
                </td>
                <td>
                  {v.avg_rating > 0
                    ? `★ ${Number(v.avg_rating).toFixed(1)} (${v.total_reviews})`
                    : '—'}
                </td>
                <td>{v.is_online ? '🟢' : '⚫'}</td>
                <td style={{ color: 'var(--text2)' }}>
                  {new Date(v.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td><VendorActions vendor={v} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pagination">
          <span>Page {page} of {pages}</span>
          {page > 1 && <a href={`?status=${status}&q=${q}&page=${page - 1}`} className="btn btn-ghost">← Prev</a>}
          {page < pages && <a href={`?status=${status}&q=${q}&page=${page + 1}`} className="btn btn-ghost">Next →</a>}
        </div>
      )}
    </>
  );
}
