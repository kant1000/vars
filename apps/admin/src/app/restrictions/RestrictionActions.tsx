'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { liftRestriction } from './actions';

export default function RestrictionActions({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    if (!window.confirm('Lift restriction for this vendor? Only do this after confirming payment.')) return;
    setLoading(true);
    setErr(null);
    try {
      await liftRestriction(vendorId);
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button className="btn btn-success" onClick={confirm} disabled={loading}>
        {loading ? 'Lifting…' : 'Confirm payment received — lift restriction'}
      </button>
      {err && <span style={{ fontSize: 12, color: '#dc2626' }}>{err}</span>}
    </div>
  );
}
