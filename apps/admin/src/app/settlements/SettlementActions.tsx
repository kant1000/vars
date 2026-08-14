'use client';
// ============================================================
// VARS Admin — Settlement actions (client component)
// Confirms a queued subaccount settlement has been paid out from the
// Paystack dashboard. Uses server actions — no client-side service-role key.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markPayoutSettled } from './actions';

export default function SettlementActions({ payoutId }: { payoutId: string }) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await markPayoutSettled(payoutId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
      {error && <div style={{ color: 'var(--error)', fontSize: 12 }}>{error}</div>}
      <button
        className="btn btn-success"
        disabled={loading}
        onClick={confirm}
        title="Confirm the Paystack subaccount → bank transfer has been triggered and completed"
      >
        Mark settled
      </button>
    </div>
  );
}
