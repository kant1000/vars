'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateDsr } from './actions';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open:        ['in_progress', 'completed', 'rejected', 'withdrawn'],
  in_progress: ['completed', 'rejected', 'withdrawn'],
};

export default function DsrActions({ dsrId, currentStatus, adminUserId }: {
  dsrId: string;
  currentStatus: string;
  adminUserId: string;
}) {
  const router = useRouter();
  const [notes,   setNotes]   = useState('');
  const [loading, setLoading] = useState(false);

  const next = STATUS_TRANSITIONS[currentStatus] ?? [];
  if (next.length === 0) return null;

  const moveTo = async (status: string) => {
    setLoading(true);
    try {
      await updateDsr(dsrId, {
        status,
        resolution_notes: notes.trim() || undefined,
        ...(status === 'completed' || status === 'rejected' || status === 'withdrawn'
          ? { resolved_at: new Date().toISOString(), resolved_by: adminUserId }
          : {}),
      });
    } finally {
      setLoading(false);
    }
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      <textarea
        placeholder="Resolution notes (required for completed / rejected)"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ fontSize: 13 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {next.includes('in_progress') && (
          <button className="btn btn-ghost" onClick={() => moveTo('in_progress')} disabled={loading}>
            Mark in progress
          </button>
        )}
        {next.includes('completed') && (
          <button className="btn btn-success" onClick={() => moveTo('completed')} disabled={loading}>
            Mark completed
          </button>
        )}
        {next.includes('rejected') && (
          <button className="btn btn-danger" onClick={() => moveTo('rejected')} disabled={loading}>
            Reject
          </button>
        )}
        {next.includes('withdrawn') && (
          <button className="btn btn-ghost" onClick={() => moveTo('withdrawn')} disabled={loading}>
            Mark withdrawn
          </button>
        )}
      </div>
    </div>
  );
}
