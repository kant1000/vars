// ============================================================
// VARS Admin — Settlements
// Vendor subaccount → bank transfers are triggered manually from the
// Paystack dashboard (settlement_schedule = manual, see paystack-settle's
// header comment). Before this page, the only record that a payout was
// due sat in a console.log — this surfaces payout_history rows still
// queued so ops has somewhere to work from, plus a way to confirm once
// the transfer is done.
// ============================================================
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { fmtPrice } from '@/lib/format';
import SettlementActions from './SettlementActions';

const PAGE_SIZE = 30;

interface Props {
  searchParams: { status?: string; page?: string };
}

async function getPayouts(status: string, page: number) {
  const db = adminClient();
  let query = db
    .from('payout_history')
    .select(`
      id, vendor_amount_kobo, vars_commission_kobo, status, settled_at, created_at,
      bookings(id, service_name),
      vendors(full_name, paystack_subaccount_code)
    `, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && status !== 'all') query = query.eq('status', status);
  const { data, count } = await query;
  return { payouts: data ?? [], total: count ?? 0 };
}

export default async function SettlementsPage({ searchParams }: Props) {
  const admin = await requireAdmin();
  if (!admin) redirect('/login');

  const status = searchParams.status ?? 'settlement_queued';
  const page   = Number(searchParams.page ?? 1);
  const { payouts, total } = await getPayouts(status, page);
  const pages = Math.ceil(total / PAGE_SIZE);
  const queuedTotalKobo = payouts.reduce((sum: number, p: any) => sum + (p.vendor_amount_kobo ?? 0), 0);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settlements</h1>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{total} total</span>
      </div>

      <form className="filters" method="GET">
        <select name="status" defaultValue={status}>
          {['settlement_queued', 'success', 'failed', 'pending', 'all'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">Filter</button>
      </form>

      {status === 'settlement_queued' && payouts.length > 0 && (
        <div style={{ color: 'var(--text2)', fontSize: 13, margin: '12px 0' }}>
          ₦{fmtPrice(queuedTotalKobo)} queued across {payouts.length} payout(s) on this page
        </div>
      )}

      {payouts.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '64px' }}>
          No {status === 'all' ? '' : status.replace(/_/g, ' ')} payouts.
        </div>
      )}

      {payouts.map((p: any) => (
        <div key={p.id} className="detail" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="kv">
            <span className="kv-label">Vendor</span>
            <span className="kv-value" style={{ fontWeight: 700 }}>{p.vendors?.full_name ?? '—'}</span>

            <span className="kv-label">Subaccount</span>
            <span className="kv-value">{p.vendors?.paystack_subaccount_code ?? 'Not set'}</span>

            <span className="kv-label">Service</span>
            <span className="kv-value">{p.bookings?.service_name ?? '—'}</span>

            <span className="kv-label">Vendor amount</span>
            <span className="kv-value" style={{ fontWeight: 700 }}>₦{fmtPrice(p.vendor_amount_kobo)}</span>

            <span className="kv-label">VARS commission</span>
            <span className="kv-value">₦{fmtPrice(p.vars_commission_kobo)}</span>

            <span className="kv-label">Queued since</span>
            <span className="kv-value">
              {new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>

            {p.settled_at && (
              <>
                <span className="kv-label">Settled</span>
                <span className="kv-value">
                  {new Date(p.settled_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            )}
          </div>
          {p.status === 'settlement_queued' && <SettlementActions payoutId={p.id} />}
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
