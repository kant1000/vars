'use client';
import { useState, useEffect, useCallback } from 'react';

interface Segment {
  service_type: string[];
  pioneer:      'all' | 'yes' | 'no';
  lead_state:   string[];
  converted:    'all' | 'yes' | 'no';
}

interface Content {
  subject:    string;
  heading:    string;
  body1:      string;
  body2:      string;
  cta_label:  string;
  cta_url:    string;
}

const SERVICE_LABELS: Record<string, string> = {
  hair_styling: 'Hair Styling',
  barbing:      'Barbing',
  makeovers:    'Makeovers',
  other:        'Other',
};

const STATE_LABELS: Record<string, string> = {
  COLD:     'Cold',
  VERIFIED: 'Verified',
};

const EMPTY_CONTENT: Content = {
  subject: '', heading: '', body1: '', body2: '', cta_label: '', cta_url: '',
};

export default function MarketingCompose() {
  const [segment, setSegment] = useState<Segment>({
    service_type: [],
    pioneer:      'all',
    lead_state:   [],
    converted:    'no',
  });
  const [content,    setContent]    = useState<Content>(EMPTY_CONTENT);
  const [count,      setCount]      = useState<number | null>(null);
  const [counting,   setCounting]   = useState(false);
  const [sending,    setSending]    = useState(false);
  const [result,     setResult]     = useState<{ sent?: number; failed?: number; error?: string } | null>(null);
  const [confirmed,  setConfirmed]  = useState(false);

  // ── Fetch recipient count whenever segment changes ───────────────────────────
  const fetchCount = useCallback(async (seg: Segment) => {
    setCounting(true);
    setCount(null);
    try {
      const params = new URLSearchParams();
      seg.service_type.forEach(t => params.append('service_type', t));
      if (seg.pioneer === 'yes')  params.set('pioneer', 'true');
      if (seg.pioneer === 'no')   params.set('pioneer', 'false');
      seg.lead_state.forEach(s => params.append('lead_state', s));
      if (seg.converted === 'yes') params.set('converted', 'true');
      if (seg.converted === 'no')  params.set('converted', 'false');

      const res  = await fetch(`/api/marketing/recipients?${params}`);
      const data = await res.json();
      setCount(data.count ?? 0);
    } catch {
      setCount(null);
    } finally {
      setCounting(false);
    }
  }, []);

  useEffect(() => { fetchCount(segment); }, [segment, fetchCount]);

  const toggleServiceType = (t: string) =>
    setSegment(s => ({
      ...s,
      service_type: s.service_type.includes(t)
        ? s.service_type.filter(x => x !== t)
        : [...s.service_type, t],
    }));

  const toggleLeadState = (st: string) =>
    setSegment(s => ({
      ...s,
      lead_state: s.lead_state.includes(st)
        ? s.lead_state.filter(x => x !== st)
        : [...s.lead_state, st],
    }));

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const segPayload: Record<string, unknown> = {};
      if (segment.service_type.length > 0) segPayload.service_type = segment.service_type;
      if (segment.pioneer === 'yes') segPayload.pioneer = true;
      if (segment.pioneer === 'no')  segPayload.pioneer = false;
      if (segment.lead_state.length > 0) segPayload.lead_state = segment.lead_state;
      if (segment.converted === 'yes') segPayload.converted = true;
      if (segment.converted === 'no')  segPayload.converted = false;

      const contentPayload: Record<string, string> = {
        subject: content.subject,
        heading: content.heading,
        body1:   content.body1,
      };
      if (content.body2.trim())     contentPayload.body2     = content.body2;
      if (content.cta_label.trim()) contentPayload.cta_label = content.cta_label;
      if (content.cta_url.trim())   contentPayload.cta_url   = content.cta_url;

      const res  = await fetch('/api/marketing/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ segment: segPayload, content: contentPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? 'Send failed' });
      } else {
        setResult({ sent: data.sent, failed: data.failed });
        if (data.sent > 0) {
          setContent(EMPTY_CONTENT);
          setConfirmed(false);
        }
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSending(false);
    }
  };

  const canSend = content.subject.trim() && content.heading.trim() && content.body1.trim() && (count ?? 0) > 0;

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', border: '1.5px solid',
        borderColor: active ? 'var(--blue)' : 'var(--border)',
        background:  active ? 'var(--blue)' : 'transparent',
        color:       active ? '#fff' : 'var(--text2)',
      }}
    >
      {label}
    </button>
  );

  const radio = (
    label: string,
    value: string,
    current: string,
    set: (v: 'all' | 'yes' | 'no') => void,
  ) => (
    <label key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
      <input type="radio" checked={current === value} onChange={() => set(value as 'all' | 'yes' | 'no')} />
      {label}
    </label>
  );

  const field = (
    label: string,
    key: keyof Content,
    placeholder: string,
    required = false,
    multiline = false,
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 2 }}>*</span>}
      </label>
      {multiline ? (
        <textarea
          value={content[key]}
          onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          style={{ fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
        />
      ) : (
        <input
          type="text"
          value={content[key]}
          onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
        />
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Segment ── */}
      <section style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Segment</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Service type — empty = all</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(SERVICE_LABELS).map(([k, v]) =>
                chip(v, segment.service_type.includes(k), () => toggleServiceType(k))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Pioneer status</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {radio('All', 'all', segment.pioneer, v => setSegment(s => ({ ...s, pioneer: v })))}
              {radio('Pioneers only', 'yes', segment.pioneer, v => setSegment(s => ({ ...s, pioneer: v })))}
              {radio('Non-pioneers only', 'no', segment.pioneer, v => setSegment(s => ({ ...s, pioneer: v })))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Lead state — empty = all</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(STATE_LABELS).map(([k, v]) =>
                chip(v, segment.lead_state.includes(k), () => toggleLeadState(k))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' }}>Converted</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {radio('Exclude converted', 'no',  segment.converted, v => setSegment(s => ({ ...s, converted: v })))}
              {radio('Include converted', 'all', segment.converted, v => setSegment(s => ({ ...s, converted: v })))}
              {radio('Converted only',    'yes', segment.converted, v => setSegment(s => ({ ...s, converted: v })))}
            </div>
          </div>

        </div>

        <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 13, fontWeight: 700, color: counting ? 'var(--text2)' : count === 0 ? 'var(--red)' : 'var(--blue)' }}>
          {counting ? 'Counting recipients…' : count === null ? '—' : `${count} recipient${count !== 1 ? 's' : ''}`}
        </div>
      </section>

      {/* ── Email content ── */}
      <section style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Email content</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {field('Subject line', 'subject', 'e.g. VARS opens to customers in August', true)}
          {field('Heading (shown large in email)', 'heading', 'e.g. Get ready for VARS this August', true)}
          {field('Body paragraph 1', 'body1', 'Main message…', true, true)}
          {field('Body paragraph 2 (optional)', 'body2', 'Additional context…', false, true)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field('CTA button label (optional)', 'cta_label', 'e.g. Complete your profile')}
            {field('CTA URL (optional)', 'cta_url', 'https://vars.app/activate')}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
            The email opens with "Hi {'{{first_name}}'}," personalised per lead. Leave CTA fields empty to omit the button.
          </p>
        </div>
      </section>

      {/* ── Send ── */}
      <section style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
        {canSend && !confirmed && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, fontSize: 13 }}>
            <strong>Ready to send to {count} recipient{count !== 1 ? 's' : ''}.</strong> This will deliver immediately when DELIVERY_LIVE is on. Confirm before sending.
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {canSend && !confirmed && (
            <button className="btn btn-primary" onClick={() => setConfirmed(true)}>
              Confirm send to {count} recipient{count !== 1 ? 's' : ''}
            </button>
          )}

          {confirmed && (
            <button
              className="btn btn-danger"
              disabled={sending}
              onClick={send}
            >
              {sending ? 'Sending…' : `Send now — ${count} recipient${count !== 1 ? 's' : ''}`}
            </button>
          )}

          {confirmed && !sending && (
            <button className="btn btn-ghost" onClick={() => setConfirmed(false)}>
              Cancel
            </button>
          )}

          {!canSend && (
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              {count === 0 ? 'No recipients match this segment.' : 'Fill in subject, heading, and body to continue.'}
            </span>
          )}

          {result && (
            <span style={{ fontSize: 13, fontWeight: 700, color: result.error ? 'var(--red)' : 'var(--green)' }}>
              {result.error
                ? `Error: ${result.error}`
                : `✓ ${result.sent} sent${result.failed ? ` · ${result.failed} failed` : ''}`}
            </span>
          )}
        </div>
      </section>

    </div>
  );
}
