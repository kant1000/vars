'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SERVICE_LABELS: Record<string, string> = {
  hair_styling: 'Hair Styling',
  barbing:      'Barbing',
  makeovers:    'Makeovers',
  other:        'Other',
};

interface Props { adminId: string | null; }

export default function ComposePanel({ adminId }: Props) {
  const router = useRouter();
  const [open,        setOpen]        = useState(false);
  const [serviceType, setServiceType] = useState('');
  const [channel,     setChannel]     = useState('whatsapp');
  const [body,        setBody]        = useState('');
  const [leadCount,   setLeadCount]   = useState<number | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [sent,        setSent]        = useState<number | null>(null);

  const fetchCount = async (st: string) => {
    if (!st) { setLeadCount(null); return; }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/vendor_leads?service_type=eq.${st}&converted=eq.false&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
    );
    const range = res.headers.get('content-range');
    const total = range ? parseInt(range.split('/')[1], 10) : null;
    setLeadCount(total);
  };

  const handleServiceChange = (val: string) => {
    setServiceType(val);
    setSent(null);
    fetchCount(val);
  };

  const queue = async () => {
    if (!serviceType || !body.trim()) return;
    setLoading(true);
    setSent(null);

    // Fetch lead IDs for this service type
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/vendor_leads?service_type=eq.${serviceType}&converted=eq.false&select=id,full_name`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const leads: { id: string; full_name: string }[] = await res.json();

    if (!leads.length) { setLoading(false); return; }

    const now = new Date().toISOString();
    const records = leads.map(l => ({
      lead_id:          l.id,
      state_from:       'CUSTOM',
      message_type:     'custom',
      channel,
      message_template: 'CUSTOM_ADMIN',
      message_body:     body,
      status:           'approved',
      approved_by:      adminId,
      approved_at:      now,
    }));

    await fetch(`${SUPABASE_URL}/rest/v1/vendor_lead_outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(records),
    });

    setSent(leads.length);
    setBody('');
    setLoading(false);
    router.refresh();
  };

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'none', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--text)' }}
      >
        <span>Compose custom message for a segment</span>
        <span style={{ color: 'var(--text2)', fontSize: 18 }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Service type</label>
              <select
                value={serviceType}
                onChange={e => handleServiceChange(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                <option value="">Select…</option>
                {Object.entries(SERVICE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              {leadCount !== null && (
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{leadCount} leads</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Channel</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 280 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={3}
                placeholder="Type your message…"
                style={{ fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-primary"
              disabled={loading || !serviceType || !body.trim()}
              onClick={queue}
            >
              {loading ? 'Queuing…' : leadCount !== null ? `Queue ${leadCount} approved messages` : 'Queue messages'}
            </button>
            {sent !== null && (
              <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>
                ✓ {sent} messages queued as approved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
