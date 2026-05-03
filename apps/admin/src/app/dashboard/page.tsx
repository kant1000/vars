// ============================================================
// VARS Admin — Dashboard overview
// Shows key platform stats fetched server-side.
// ============================================================
export const dynamic = 'force-dynamic';

import { adminClient } from '@/lib/supabase';

interface SystemAlert {
  id: string;
  job_name: string;
  last_failed_at: string;
  error_message: string | null;
}

async function getAlerts(): Promise<SystemAlert[]> {
  const db = adminClient();
  const { data } = await db
    .from('system_alerts')
    .select('id, job_name, last_failed_at, error_message')
    .order('last_failed_at', { ascending: false });
  return (data ?? []) as SystemAlert[];
}

async function getStats() {
  const db = adminClient();
  const [vendors, bookings, disputes, revenue] = await Promise.all([
    db.from('vendors').select('id, kyc_status', { count: 'exact', head: false }),
    db.from('bookings').select('id, status, service_price_kobo', { count: 'exact', head: false }),
    db.from('disputes').select('id, status', { count: 'exact', head: false }),
    db.from('payout_history').select('amount_kobo').eq('status', 'success'),
  ]);

  const vendorData    = vendors.data    ?? [];
  const bookingData   = bookings.data   ?? [];
  const disputeData   = disputes.data   ?? [];
  const payoutData    = revenue.data    ?? [];

  const totalVendors    = vendorData.length;
  const pendingKyc      = vendorData.filter((v) => v.kyc_status === 'pending').length;
  const verifiedVendors = vendorData.filter((v) => v.kyc_status === 'verified').length;

  const totalBookings   = bookingData.length;
  const activeBookings  = bookingData.filter((b) => ['pending','accepted','vendor_on_way','vendor_arrived','service_rendered'].includes(b.status)).length;
  const completedBookings = bookingData.filter((b) => b.status === 'completed').length;

  const openDisputes    = disputeData.filter((d) => d.status === 'open').length;

  // VARS revenue = 20% of completed booking values
  const completedRevKobo = bookingData
    .filter((b) => b.status === 'completed')
    .reduce((s: number, b: any) => s + (b.service_price_kobo ?? 0), 0);
  const varsRevenueKobo = Math.round(completedRevKobo * 0.2);

  return {
    totalVendors, pendingKyc, verifiedVendors,
    totalBookings, activeBookings, completedBookings,
    openDisputes,
    varsRevenue: `₦${Math.round(varsRevenueKobo / 100).toLocaleString('en-NG')}`,
  };
}

export default async function DashboardPage() {
  const [stats, alerts] = await Promise.all([getStats(), getAlerts()]);

  const STATS = [
    { label: 'Total vendors',      value: stats.totalVendors,      color: 'var(--blue)'  },
    { label: 'Pending KYC',        value: stats.pendingKyc,        color: 'var(--amber)' },
    { label: 'Verified vendors',   value: stats.verifiedVendors,   color: 'var(--green)' },
    { label: 'Total bookings',     value: stats.totalBookings,     color: 'var(--text)'  },
    { label: 'Active bookings',    value: stats.activeBookings,    color: 'var(--blue)'  },
    { label: 'Completed bookings', value: stats.completedBookings, color: 'var(--green)' },
    { label: 'Open disputes',      value: stats.openDisputes,      color: 'var(--red)'   },
    { label: 'VARS revenue',       value: stats.varsRevenue,       color: 'var(--green)' },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {alerts.length > 0 && (
        <div style={{
          marginBottom: 24,
          borderRadius: 10,
          border: '1px solid #f87171',
          backgroundColor: '#fff1f1',
          padding: '14px 18px',
        }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 8, fontSize: 14 }}>
            ⚠ {alerts.length} cron job{alerts.length > 1 ? 's' : ''} failing
          </div>
          {alerts.map((a) => (
            <div key={a.id} style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 4 }}>
              <strong>{a.job_name}</strong>
              {' — '}last failed{' '}
              {new Date(a.last_failed_at).toLocaleString('en-NG', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
              })}
              {a.error_message && (
                <span style={{ color: '#9a3412', marginLeft: 6 }}>({a.error_message})</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="stats">
        {STATS.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <p style={{ color: 'var(--text2)', fontSize: 13 }}>
        Use the sidebar to manage vendors, bookings, and disputes.
      </p>
    </>
  );
}
