'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function patchOutreach(id: string, patch: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_lead_outreach?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

async function markLeadOutreach(leadId: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/vendor_leads?id=eq.${leadId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_outreach: new Date().toISOString() }),
  });
}

interface Props {
  record:  any;
  adminId: string | null;
}

export default function OutreachActions({ record, adminId }: Props) {
  const router  = useRouter();
  const [editing,  setEditing]  = useState(false);
  const [body,     setBody]     = useState<string>(record.message_body);
  const [channel,  setChannel]  = useState<string>(record.channel);
  const [loading,  setLoading]  = useState(false);

  const act = async (patch: Record<string, unknown>) => {
    setLoading(true);
    await patchOutreach(record.id, patch);
    setLoading(false);
    setEditing(false);
    router.refresh();
  };

  if (record.status === 'draft') {
    if (editing) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            style={{ fontSize: 12, fontFamily: 'monospace', minWidth: 240 }}
          />
          <button
            className="btn btn-success"
            disabled={loading}
            onClick={() => act({
              status:       'approved',
              channel,
              message_body: body,
              approved_by:  adminId,
              approved_at:  new Date().toISOString(),
            })}
          >
            {loading ? 'Saving…' : 'Approve'}
          </button>
          <button className="btn btn-ghost" disabled={loading} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="btn btn-primary" onClick={() => setEditing(true)}>
          Edit & Approve
        </button>
        <button
          className="btn btn-danger"
          disabled={loading}
          onClick={() => act({ status: 'blocked' })}
        >
          {loading ? 'Saving…' : 'Reject'}
        </button>
      </div>
    );
  }

  if (record.status === 'approved') {
    return (
      <button
        className="btn btn-success"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          await patchOutreach(record.id, {
            status:              'sent',
            sent_at:             new Date().toISOString(),
            provider_message_id: `phase-a-${record.id}`,
          });
          await markLeadOutreach(record.lead_id);
          setLoading(false);
          router.refresh();
        }}
      >
        {loading ? 'Sending…' : 'Send Now'}
      </button>
    );
  }

  if (record.status === 'sent' && record.response_status) {
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 700 }}>{record.response_status}</div>
        {record.response_text && (
          <div style={{ color: 'var(--text2)', marginTop: 2 }}>{record.response_text}</div>
        )}
      </div>
    );
  }

  return null;
}
