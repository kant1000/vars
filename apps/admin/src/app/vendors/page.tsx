// ============================================================
// VARS Admin — Vendors list
// Filter by kyc_status. Approve / reject vendors.
// Toggle VARS Choice badge.
// ============================================================
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
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
    .select('id, full_name, phone_number, kyc_status, avg_rating, total_reviews, badge_vars_choice, badge_top_rated, created_at, is_online, cancellation_flagged, settlement_on_hold, profile_image_url, profile_image_raw_url')
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status !== 'all') query = query.eq('kyc_status', status);
  if (q) query = query.ilike('full_name', `%${q}%`);

  const { data, count } = await query;
  const vendors = data ?? [];

  // profile_image_raw_url is now a storage path in the private vendor-identity-raw bucket.
  // Generate short-lived signed URLs server-side so the admin can view audit images
  // without exposing the raw biometric data publicly.
  const rawPaths = vendors
    .map((v: any) => v.profile_image_raw_url)
    .filter((p: string | null) => typeof p === 'string' && !p.startsWith('http'));

  const signedUrlMap: Record<string, string> = {};
  if (rawPaths.length > 0) {
    const { data: signed } = await db.storage
      .from('vendor-identity-raw')
      .createSignedUrls(rawPaths, 3600);
    for (const entry of signed ?? []) {
      if (entry.signedUrl) signedUrlMap[entry.path] = entry.signedUrl;
    }
  }

  // Vendors whose raw URL is already a full http URL (migrated before this change)
  // are left as-is so the audit image still renders.
  const vendorsWithSignedRaw = vendors.map((v: any) => ({
    ...v,
    profile_image_raw_signed: v.profile_image_raw_url?.startsWith('http')
      ? v.profile_image_raw_url
      : (signedUrlMap[v.profile_image_raw_url] ?? null),
  }));

  return { vendors: vendorsWithSignedRaw, total: count ?? 0 };
}

export default async function VendorsPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  if (!admin) redirect('/login');

  // Default to 'rejected' — Youverify auto-approves clean passes, so admin only needs
  // to see flagged/rejected KYC cases. Switch to 'all' or 'verified' via filters.
  const status = searchParams.status ?? 'rejected';
  const page   = Number(searchParams.page ?? 1);
  const q      = searchParams.q ?? '';
  const { vendors, total } = await getVendors(status, page, q);
  const pages = Math.ceil(total / PAGE_SIZE);

  const KYC_TABS = ['rejected', 'all', 'pending', 'verified'];

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
              <th>Identity</th>
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
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text2)', padding: '32px' }}>No vendors found. Youverify auto-approves clean passes — only flagged or rejected cases appear here by default.</td></tr>
            )}
            {vendors.map((v: any) => (
              <tr key={v.id}>
                <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                  {v.profile_image_url ? (
                    <img
                      src={v.profile_image_url}
                      alt="Profile"
                      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>Not set</span>
                  )}
                  {v.profile_image_raw_signed ? (
                    <div style={{ marginTop: 6 }}>
                      <img
                        src={v.profile_image_raw_signed}
                        alt="Liveness capture (audit)"
                        style={{ width: 40, height: 56, objectFit: 'cover', display: 'block', borderRadius: 4 }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginTop: 2 }}>Audit</span>
                    </div>
                  ) : null}
                </td>
                <td>
                  <div style={{ fontWeight: 700 }}>{v.full_name}</div>
                  {v.badge_vars_choice    && <span className="badge badge-active" style={{ marginTop: 2 }}>VARS Choice</span>}
                  {v.badge_top_rated      && <span className="badge badge-verified" style={{ marginTop: 2, marginLeft: 4 }}>Top Rated</span>}
                  {v.cancellation_flagged && <span className="badge badge-pending" style={{ marginTop: 2, marginLeft: 4 }}>⚠ Cancellations</span>}
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
