'use client';
// ============================================================
// VARS Admin — Vendor action buttons (client component)
// Approve / Reject KYC, toggle VARS Choice badge, suspend/unsuspend.
// Uses server actions — no client-side service-role key.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  overrideApproveVendor,
  resetVendorKyc,
  clearSettlementHold,
  clearCancellationFlag,
  toggleVarsChoiceBadge,
  suspendVendor,
  unsuspendVendor,
} from './actions';

export default function VendorActions({ vendor }: { vendor: any }) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const act = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {error && (
        <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {/* Youverify auto-approves clean passes — admin only sees rejected/flagged cases.
            Manual override available if Youverify was incorrect or context warrants it. */}
        {vendor.kyc_status === 'rejected' && (
          <>
            <button
              className="btn btn-success"
              disabled={loading}
              onClick={() => act(() => overrideApproveVendor(vendor.id))}
              title="Override Youverify rejection — manually approve this vendor"
            >
              Override & approve
            </button>
            <button
              className="btn btn-ghost"
              disabled={loading}
              onClick={() => act(() => resetVendorKyc(vendor.id))}
              title="Send vendor back to re-submit KYC"
            >
              Reset KYC
            </button>
          </>
        )}
        {vendor.settlement_on_hold && (
          <button
            className="btn btn-danger"
            disabled={loading}
            onClick={() => act(() => clearSettlementHold(vendor.id))}
            title="Clear settlement hold — blocked while disputes are open/under review"
          >
            Clear settlement hold
          </button>
        )}
        {vendor.cancellation_flagged && (
          <button
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => act(() => clearCancellationFlag(vendor.id))}
            title="Acknowledge and clear the cancellation flag"
          >
            Clear flag
          </button>
        )}
        <button
          className={`btn ${vendor.badge_vars_choice ? 'btn-ghost' : 'btn-primary'}`}
          disabled={loading}
          onClick={() => act(() => toggleVarsChoiceBadge(vendor.id, vendor.badge_vars_choice))}
          title="Toggle VARS Choice badge"
        >
          {vendor.badge_vars_choice ? '★ Remove Choice' : '☆ VARS Choice'}
        </button>
        {vendor.is_suspended ? (
          <button
            className="btn btn-success"
            disabled={loading}
            onClick={() => act(() => unsuspendVendor(vendor.id))}
            title="Restore vendor visibility in discovery and bookings"
          >
            Unsuspend
          </button>
        ) : (
          <button
            className="btn btn-danger"
            disabled={loading}
            onClick={() => act(() => suspendVendor(vendor.id))}
            title="Hide vendor from discovery and block new bookings"
          >
            Suspend
          </button>
        )}
      </div>
    </div>
  );
}
