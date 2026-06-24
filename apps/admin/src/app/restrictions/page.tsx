// ============================================================
// VARS Admin — Vendor restrictions queue
// Shows vendors with is_restricted = true.
// Vendors in the "Awaiting review" section have tapped "I've paid"
// (restriction_repayment_claimed_at is not null).
// Admin confirms payment and lifts the restriction here.
// ============================================================
export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import RestrictionActions from './RestrictionActions';

function fmtNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function getRestrictedVendors() {
  const db = adminClient();
  const { data } = await db
    .from('vendors')
    .select('id, full_name, phone_number, email, restriction_amount_owed_kobo, restriction_reason, restriction_repayment_claimed_at, created_at')
    .eq('is_restricted', true)
    .order('restriction_repayment_claimed_at', { ascending: true, nullsFirst: false });
  return data ?? [];
}

export default async function RestrictionsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/login');

  const vendors = await getRestrictedVendors();
  const claimedRepayment = vendors.filter((v) => v.restriction_repayment_claimed_at != null);
  const awaitingClaim    = vendors.filter((v) => v.restriction_repayment_claimed_at == null);

  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Vendor restrictions</h1>
      <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 24 }}>
        {vendors.length} restricted vendor{vendors.length !== 1 ? 's' : ''} —{' '}
        {claimedRepayment.length} awaiting review
      </p>

      {claimedRepayment.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12, color: '#16a34a' }}>
            Awaiting review — vendor has tapped &quot;I&apos;ve paid&quot;
          </h2>
          {claimedRepayment.map((v) => (
            <div key={v.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{v.full_name}</strong>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                    {v.phone_number} · {v.email}
                  </div>
                  <div style={{ fontSize: 13, color: '#dc2626', marginTop: 6, fontWeight: 700 }}>
                    Owes: {fmtNaira(v.restriction_amount_owed_kobo ?? 0)}
                  </div>
                  {v.restriction_reason && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      Reason: {v.restriction_reason}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                    Claimed repayment: {fmtDateTime(v.restriction_repayment_claimed_at!)}
                  </div>
                </div>
                <div style={{ minWidth: 260 }}>
                  <RestrictionActions vendorId={v.id} />
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                    Ask vendor to include their phone number as reference.{' '}
                    Verify transfer on VARS bank statement before lifting.
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {awaitingClaim.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12, marginTop: 24, color: '#d97706' }}>
            Restricted — not yet claimed repayment
          </h2>
          {awaitingClaim.map((v) => (
            <div key={v.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong>{v.full_name}</strong>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                    {v.phone_number} · {v.email}
                  </div>
                  <div style={{ fontSize: 13, color: '#dc2626', marginTop: 6, fontWeight: 700 }}>
                    Owes: {fmtNaira(v.restriction_amount_owed_kobo ?? 0)}
                  </div>
                  {v.restriction_reason && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                      Reason: {v.restriction_reason}
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 260 }}>
                  <RestrictionActions vendorId={v.id} />
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                    Only lift if you have confirmed payment independently.
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {vendors.length === 0 && (
        <div style={{ color: 'var(--text2)', fontSize: 14, paddingTop: 24 }}>
          No restricted vendors — all clear.
        </div>
      )}
    </>
  );
}
