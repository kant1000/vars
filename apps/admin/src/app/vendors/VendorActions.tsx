'use client';
// ============================================================
// VARS Admin — Vendor action buttons (client component)
// Approve / Reject KYC, toggle VARS Choice badge.
// Uses server actions — no client-side service-role key.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateVendor } from './actions';

export default function VendorActions({ vendor }: { vendor: any }) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  const act = async (patch: Record<string, unknown>) => {
    setLoading(true);
    try { await updateVendor(vendor.id, patch); }
    finally { setLoading(false); }
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
