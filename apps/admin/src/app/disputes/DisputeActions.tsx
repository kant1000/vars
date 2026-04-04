'use client';
// ============================================================
// VARS Admin — Dispute resolution actions (client component)
// Options: mark under_review, refund_user, pay_vendor, split.
// Calls Supabase REST + paystack-settle/release edge fns.
// ============================================================
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.NEXT_PUBLIC_ADMIN_SERVICE_KEY ?? '';

async function patchDispute(disputeId: string, patch: Record<string, any>) {
  await fetch(`${SUPABASE_URL}/rest/v1/disputes?id=eq.${disputeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

async function callEdgeFn(fnName: string, body: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export default function DisputeActions({
  disputeId, bookingId, currentStatus,
}: {
  disputeId: string;
  bookingId: string;
  currentStatus: string;
}) {
  const router  = useRouter();
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);

  const resolve = async (resolution: 'refund_user' | 'pay_vendor' | 'split') => {
    setLoading(true);
    // 1. Update dispute record
    await patchDispute(disputeId, {
      status: 'resolved',
      resolution,
      admin_notes: notes.trim() || null,
    });

    // 2. Trigger appropriate payment action
    if (resolution === 'refund_user') {
      await callEdgeFn('paystack-release', { booking_id: bookingId, trigger: 'admin_dispute' });
    } else if (resolution === 'pay_vendor') {
      await callEdgeFn('paystack-settle', { booking_id: bookingId, trigger: 'admin_dispute' });
    }
    // 'split' requires a custom manual Paystack operation — admin handles out-of-band

    setLoading(false);
    router.refresh();
  };

  const markUnderReview = async () => {
    setLoading(true);
    await patchDispute(disputeId, { status: 'under_review' });
    setLoading(false);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
