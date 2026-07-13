'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createManualDsr } from './actions';

const REQUEST_TYPES = [
  'access', 'rectification', 'erasure', 'restriction',
  'portability', 'objection', 'withdraw_consent', 'other',
];

export default function DsrNewForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;
    setLoading(true);
    setError('');
    try {
      await createManualDsr(new FormData(formRef.current));
      formRef.current.reset();
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create DSR');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-ghost" onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        + Log manual DSR (email / phone request)
      </button>
    );
  }

  return (
    <div className="detail" style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>Log manual data subject request</div>
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select name="requester_type" required defaultValue="">
            <option value="" disabled>Requester type</option>
            {['customer','vendor','external','admin'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select name="request_type" required defaultValue="">
            <option value="" disabled>Request type</option>
            {REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <input name="requester_name"  type="text"  placeholder="Requester name"  style={{ fontSize: 13 }} />
        <input name="requester_email" type="email" placeholder="Requester email" style={{ fontSize: 13 }} />
        <textarea name="details" rows={3} placeholder="Details of the request…" style={{ fontSize: 13 }} />
        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Create DSR'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
