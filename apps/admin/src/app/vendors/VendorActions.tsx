'use client';
// ============================================================
// VARS Admin — Vendor action buttons (client component)
// Approve / Reject KYC, toggle VARS Choice badge.
// Uses Next.js Server Actions via form POST.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY  = process.env.NEXT_PUBLIC_ADMIN_SERVICE_KEY ?? ''; // set in .env.local

async function updateVendor(vendorId: string, patch: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendors?id=eq.${vendorId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export default function VendorActions({ vendor }: { vendor: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const act = async (patch: Record<string, any>) => {
    setLoading(true);
    await updateVendor(vendor.id, patch);
    setLoading(false);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {/* Youverify auto-approves clean passes — admin only sees rejected/flagged cases.
          Manual override available if Youverify was incorrect or context warrants it. */}
      {vendor.kyc_status === 'rejected' && (
        <>
          <button
            className="btn btn-success"
            disabled={loading}
            onClick={() => act({ kyc_status: 'verified', is_active: true })}
            title="Override Youverify rejection — manually approve this vendor"
          >
            Override & approve
          </button>
          <button
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => act({ kyc_status: 'pending' })}
            title="Send vendor back to re-submit KYC"
          >
            Reset KYC
          </button>
        </>
      )}
      {vendor.cancellation_flagged && (
        <button
          className="btn btn-ghost"
          disabled={loading}
          onClick={() => act({ cancellation_flagged: false })}
          title="Acknowledge and clear the cancellation flag"
        >
          Clear flag
        </button>
      )}
      <button
        className={`btn ${vendor.badge_vars_choice ? 'btn-ghost' : 'btn-primary'}`}
        disabled={loading}
        onClick={() => act({ badge_vars_choice: !vendor.badge_vars_choice })}
        title="Toggle VARS Choice badge"
      >
        {vendor.badge_vars_choice ? '★ Remove Choice' : '☆ VARS Choice'}
      </button>
    </div>
  );
}
