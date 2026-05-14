'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface Lead {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  lead_state: string;
  hasPending: boolean;
}

const STATE_COLOUR: Record<string, string> = {
  PROSPECT: '#92400E',
  COLD:     '#1E40AF',
  VERIFIED: '#166534',
  CONVERTED:'#374151',
};
const STATE_BG: Record<string, string> = {
  PROSPECT: '#FEF3C7',
  COLD:     '#DBEAFE',
  VERIFIED: '#DCFCE7',
  CONVERTED:'#F3F4F6',
};

export default function ComposePanel({ adminId }: { adminId: string | null }) {
  const router = useRouter();
  const [open,        setOpen]        = useState(false);
  const [serviceType, setServiceType] = useState('');
  const [channel,     setChannel]     = useState('whatsapp');
  const [body,        setBody]        = useState('');
  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [fetching,    setFetching]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState<string | null>(null);

  const loadLeads = async (st: string) => {
    setLeads([]);
    setSelected(new Set());
    setResult(null);
    if (!st) return;
    setFetching(true);

    const [leadsRes, pendingRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/vendor_leads?service_type=eq.${st}&converted=eq.false&select=id,full_name,email,phone,lead_state&order=full_name.asc`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/vendor_lead_outreach?status=in.(draft,approved)&select=lead_id`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
      ),
    ]);

    const rawLeads: Omit<Lead, 'hasPending'>[] = await leadsRes.json();
    const pendingRows: { lead_id: string }[]   = await pendingRes.json();
    const pendingSet = new Set(pendingRows.map(r => r.lead_id));

    const enriched = rawLeads.map(l => ({ ...l, hasPending: pendingSet.has(l.id) }));
    setLeads(enriched);
    // Pre-select only leads without a pending message
    setSelected(new Set(enriched.filter(l => !l.hasPending).map(l => l.id)));
    setFetching(false);
  };

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const noPending  = leads.filter(l => !l.hasPending);
  const allSelected = noPending.length > 0 && noPending.every(l => selected.has(l.id));
  const toggleAll  = () =>
    setSelected(allSelected ? new Set() : new Set(noPending.map(l => l.id)));

  const queue = async () => {
    const targets = leads.filter(l => selected.has(l.id));
    if (!targets.length || !body.trim()) return;
    setLoading(true);
    setResult(null);

    const now = new Date().toISOString();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_lead_outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(targets.map(l => ({
        lead_id:          l.id,
        state_from:       'CUSTOM',
        message_type:     'custom',
        channel,
        message_template: 'CUSTOM_ADMIN',
        message_body:     body,
        status:           'approved',
        approved_by:      adminId,
        approved_at:      now,
      }))),
    });

    if (res.ok) {
      const skipped = leads.filter(l => l.hasPending && !selected.has(l.id)).length;
      setResult(`✓ ${targets.length} messages queued as approved${skipped ? ` · ${skipped} skipped (already have pending)` : ''}`);
      setBody('');
      setSelected(new Set());
      router.refresh();
    } else {
      setResult('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 20 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'none', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--text)' }}
      >
        <span>Compose message for segment</span>
        <span style={{ color: 'var(--text2)', fontSize: 18 }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Compose controls */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Service type</label>
              <select
                value={serviceType}
                onChange={e => { setServiceType(e.target.value); loadLeads(e.target.value); }}
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              >
                <option value="">Select…</option>
                <option value="hair_styling">Hair Styling</option>
                <option value="barbing">Barbing</option>
                <option value="makeovers">Makeovers</option>
                <option value="other">Other</option>
              </select>
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

            <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={2}
                placeholder="Type your message…"
                style={{ fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Lead table */}
          {fetching && (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading leads…</div>
          )}

          {!fetching && leads.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {leads.length} leads · {noPending.length} available · {leads.length - noPending.length} have pending messages
              </div>
              <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36, textAlign: 'center' }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                      </th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>State</th>
                      <th>Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(l => (
                      <tr key={l.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(l.id)}
                            onChange={() => toggle(l.id)}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{l.full_name}</td>
                        <td style={{ fontSize: 12 }}>{l.email}</td>
                        <td style={{ fontSize: 12 }}>{l.phone}</td>
                        <td>
                          <span style={{
                            display: 'inline-flex', padding: '2px 8px', borderRadius: 6,
                            fontSize: 11, fontWeight: 700,
                            background: STATE_BG[l.lead_state] ?? '#F3F4F6',
                            color: STATE_COLOUR[l.lead_state] ?? '#374151',
                          }}>
                            {l.lead_state}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: l.hasPending ? 'var(--amber)' : 'var(--text2)' }}>
                          {l.hasPending ? '⚠ pending' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  disabled={loading || selected.size === 0 || !body.trim()}
                  onClick={queue}
                >
                  {loading ? 'Queuing…' : `Queue for ${selected.size} lead${selected.size !== 1 ? 's' : ''}`}
                </button>
                {result && (
                  <span style={{ fontSize: 13, color: result.startsWith('✓') ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                    {result}
                  </span>
                )}
              </div>
            </>
          )}

          {!fetching && serviceType && leads.length === 0 && (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>No unconverted leads in this category.</div>
          )}
        </div>
      )}
    </div>
  );
}
