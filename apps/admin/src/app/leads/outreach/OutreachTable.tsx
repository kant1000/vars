'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import OutreachActions from './OutreachActions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function patchMany(ids: string[], patch: Record<string, unknown>) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vendor_lead_outreach?id=in.(${ids.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }
  );
  return res.ok;
}

interface Props {
  records: any[];
  adminId: string | null;
}

export default function OutreachTable({ records, adminId }: Props) {
  const router = useRouter();
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkChannel, setBulkChannel] = useState('whatsapp');
  const [loading,     setLoading]     = useState(false);

  const draftIds        = records.filter(r => r.status === 'draft').map(r => r.id);
  const allDraftsSelected = draftIds.length > 0 && draftIds.every(id => selected.has(id));

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(Array.from(prev)); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(allDraftsSelected ? new Set() : new Set(draftIds));

  const bulkAct = async (patch: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setLoading(true);
    await patchMany(Array.from(selected), patch);
    setSelected(new Set());
    setLoading(false);
    router.refresh();
  };

  return (
    <>
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '10px 16px', marginBottom: 12,
          background: 'var(--blue-lt)', border: '1px solid var(--blue)', borderRadius: 'var(--radius)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)' }}>
            {selected.size} selected
          </span>
          <select
            value={bulkChannel}
            onChange={e => setBulkChannel(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid var(--blue)', borderRadius: 6, fontSize: 13 }}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
          <button
            className="btn btn-success"
            disabled={loading}
            onClick={() => bulkAct({
              status:      'approved',
              channel:     bulkChannel,
              approved_by: adminId,
              approved_at: new Date().toISOString(),
            })}
          >
            {loading ? 'Saving…' : `Approve ${selected.size}`}
          </button>
          <button
            className="btn btn-danger"
            disabled={loading}
            onClick={() => bulkAct({ status: 'blocked' })}
          >
            {loading ? 'Saving…' : `Reject ${selected.size}`}
          </button>
          <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allDraftsSelected}
                  onChange={toggleAll}
                  disabled={draftIds.length === 0}
                  title="Select all drafts"
                />
              </th>
              <th>Lead</th>
              <th>Email</th>
              <th>Type</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Message</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                  No messages in queue
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center' }}>
                  {r.status === 'draft' && (
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  )}
                </td>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.vendor_leads.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.vendor_leads.lead_state}</div>
                </td>
                <td style={{ fontSize: 12 }}>{r.vendor_leads.email}</td>
                <td>
                  <span className="badge badge-pending">{r.message_type}</span>
                </td>
                <td style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase' }}>{r.channel}</td>
                <td>
                  <span className={`badge badge-${r.status}`}>{r.status}</span>
                </td>
                <td style={{ fontSize: 12 }}>
                  <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.message_body}
                  </div>
                </td>
                <td style={{ color: 'var(--text2)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </td>
                <td>
                  <OutreachActions record={r} adminId={adminId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
