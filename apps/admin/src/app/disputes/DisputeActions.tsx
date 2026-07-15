'use client';
// ============================================================
// VARS Admin — Dispute resolution actions (client component)
// Options: mark under_review, refund_user, pay_vendor, split.
// Uses server actions — no client-side service-role key.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateDispute, callSettlementEdgeFn } from './actions';

export default function DisputeActions({
  disputeId, bookingId, currentStatus,
}: {
  disputeId: string;
  bookingId: string;
  currentStatus: string;
}) {
  const router  = useRouter();
  const [notes,   setNotes]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const resolve = async (resolution: 'refund_user' | 'pay_vendor' | 'split') => {
    setLoading(true);
    setError(null);
    try {
      // Move money first — only mark resolved if the payment action succeeds.
      // Reversing order (mark resolved then pay) leaves the dispute permanently
      // marked resolved with no money moved if the edge function call fails.
      if (resolution === 'refund_user') {
        await callSettlementEdgeFn('paystack-release', bookingId);
      } else if (resolution === 'pay_vendor') {
        await callSettlementEdgeFn('paystack-settle', bookingId);
      }
      // 'split' requires a custom manual Paystack operation — mark resolved immediately
      // so the admin queue clears; ops handles the actual payment out-of-band.

      await updateDispute(disputeId, {
        status:      'resolved',
        resolution,
        admin_notes: notes.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed — dispute NOT marked resolved. Check logs.');
    } finally {
      setLoading(false);
    }
    router.refresh();
  };

  const markUnderReview = async () => {
    setLoading(true);
    try { await updateDispute(disputeId, { status: 'under_review' }); }
    finally { setLoading(false); }
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && (
        <div style={{ color: 'var(--error)', fontSize: 12, padding: '6px 8px', background: 'var(--error-bg, #fff0f0)', borderRadius: 4 }}>
          {error}
        </div>
      )}
      <textarea
        placeholder="Admin notes (optional)…"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ fontSize: 13 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {currentStatus === 'open' && (
          <button className="btn btn-ghost" onClick={markUnderReview} disabled={loading}>
            Mark under review
          </button>
        )}
        <button
          className="btn btn-danger"
          onClick={() => resolve('refund_user')}
          disabled={loading}
          title="Full refund to customer — calls paystack-release"
        >
          Refund customer
        </button>
        <button
          className="btn btn-success"
          onClick={() => resolve('pay_vendor')}
          disabled={loading}
          title="Release payment to vendor — calls paystack-settle"
        >
          Pay vendor
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => resolve('split')}
          disabled={loading}
          title="Mark resolved as split — manual Paystack action required"
        >
          Split (manual)
        </button>
      </div>
    </div>
  );
}
