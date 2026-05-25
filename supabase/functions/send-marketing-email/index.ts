// ============================================================
// VARS — send-marketing-email
// Sends a bulk HTML marketing email to a segment of vendor leads.
// Segmentation is performed against vendor_leads in Supabase.
// Template is rendered per-lead (personalised first_name + unsubscribe URL).
// Delivery via Resend Batch API (100 per request).
//
// POST — requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Body:
// {
//   segment: {
//     service_type?: string | string[],   // 'hair_styling' | 'barbing' | 'makeovers' | 'other'
//     pioneer?:      boolean,
//     lead_state?:   string | string[],   // 'COLD' | 'VERIFIED'
//     converted?:    boolean,
//   },
//   content: {
//     subject:    string,
//     heading:    string,
//     body1:      string,
//     body2?:     string,
//     cta_label?: string,
//     cta_url?:   string,
//   }
// }
//
// Returns: { sent, failed, recipients }
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient }           from '../_shared/supabase.ts';
import { getFirstName }                from '../_shared/lead-copy.ts';
import { EMAIL_TEMPLATE }              from '../_shared/email-template.ts';

// ── Config ────────────────────────────────────────────────────────────────────

const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')           ?? '';
const RESEND_FROM          = 'VARS <hello@bookwithvars.com>';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const UNSUBSCRIBE_SECRET   = Deno.env.get('UNSUBSCRIBE_SECRET')        ?? '';
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')              ?? '';
const DELIVERY_LIVE        = Deno.env.get('DELIVERY_LIVE') === 'true';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fillTemplate(html: string, vars: Record<string, string>): string {
  let out = html;
  if (!vars.body_paragraph_2) {
    out = out.replace(/<!--P2_START-->[\s\S]*?<!--P2_END-->/g, '');
  }
  if (!vars.cta_label || !vars.cta_url) {
    out = out.replace(/<!--CTA_START-->[\s\S]*?<!--CTA_END-->/g, '');
  }
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}

async function makeUnsubToken(leadId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(UNSUBSCRIBE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(leadId));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sendBatch(
  emails: object[],
): Promise<{ sent: number; failed: number }> {
  if (!DELIVERY_LIVE) {
    console.log(`[send-marketing-email] stub — would send ${emails.length} emails`);
    return { sent: emails.length, failed: 0 };
  }

  const res = await fetch('https://api.resend.com/emails/batch', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emails),
  });

  if (!res.ok) {
    console.error('[send-marketing-email] Resend batch error:', res.status, await res.text());
    return { sent: 0, failed: emails.length };
  }

  const data = (await res.json()) as { data?: unknown[] };
  return { sent: data.data?.length ?? emails.length, failed: 0 };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth — service role key required
  if (SUPABASE_SERVICE_KEY) {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
      return errorResponse('Unauthorized', 401);
    }
  }

  let body: {
    segment?: {
      service_type?: string | string[];
      pioneer?:      boolean;
      lead_state?:   string | string[];
      converted?:    boolean;
    };
    content?: {
      subject:    string;
      heading:    string;
      body1:      string;
      body2?:     string;
      cta_label?: string;
      cta_url?:   string;
    };
  } = {};

  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { segment = {}, content } = body;

  if (!content?.subject?.trim() || !content?.heading?.trim() || !content?.body1?.trim()) {
    return errorResponse('content.subject, heading, and body1 are required', 400);
  }

  // ── Query leads ─────────────────────────────────────────────────────────────
  const db = createAdminClient();
  let query = db
    .from('vendor_leads')
    .select('id, full_name, email, pioneer, service_type, lead_state')
    .eq('email_unsubscribed', false);

  if (segment.service_type !== undefined) {
    const types = Array.isArray(segment.service_type)
      ? segment.service_type
      : [segment.service_type];
    query = query.in('service_type', types);
  }
  if (segment.pioneer !== undefined) {
    query = query.eq('pioneer', segment.pioneer);
  }
  if (segment.lead_state !== undefined) {
    const states = Array.isArray(segment.lead_state)
      ? segment.lead_state
      : [segment.lead_state];
    query = query.in('lead_state', states);
  }
  if (segment.converted !== undefined) {
    query = query.eq('converted', segment.converted);
  }

  const { data: leads, error: dbErr } = await query;
  if (dbErr) return errorResponse('DB error: ' + dbErr.message, 500);
  if (!leads?.length) {
    return jsonResponse({ sent: 0, failed: 0, recipients: 0 });
  }

  // ── Render + batch send ──────────────────────────────────────────────────────
  let totalSent   = 0;
  let totalFailed = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const chunk  = leads.slice(i, i + BATCH_SIZE);
    const emails = await Promise.all(
      chunk.map(async (lead) => {
        const firstName = getFirstName(lead.full_name ?? '');
        const token     = await makeUnsubToken(lead.id);
        const unsubUrl  = `${SUPABASE_URL}/functions/v1/unsubscribe-lead?id=${lead.id}&t=${token}`;

        const html = fillTemplate(EMAIL_TEMPLATE, {
          first_name:       firstName,
          heading:          content.heading,
          body_paragraph_1: content.body1,
          body_paragraph_2: content.body2 ?? '',
          cta_label:        content.cta_label ?? '',
          cta_url:          content.cta_url   ?? '',
          unsubscribe_url:  unsubUrl,
        });

        const textFallback = [
          `Hi ${firstName},`,
          '',
          content.body1,
          ...(content.body2 ? ['', content.body2] : []),
          ...(content.cta_label && content.cta_url ? ['', `${content.cta_label}: ${content.cta_url}`] : []),
          '',
          `Unsubscribe: ${unsubUrl}`,
        ].join('\n');

        return {
          from:    RESEND_FROM,
          to:      [lead.email],
          subject: content.subject,
          html,
          text:    textFallback,
          headers: {
            'List-Unsubscribe':      `<mailto:unsubscribe@bookwithvars.com?subject=unsubscribe>, <${unsubUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      }),
    );

    const { sent, failed } = await sendBatch(emails);
    totalSent   += sent;
    totalFailed += failed;
  }

  console.log(
    `[send-marketing-email] done — recipients: ${leads.length}, sent: ${totalSent}, failed: ${totalFailed}, live: ${DELIVERY_LIVE}`,
  );
  return jsonResponse({ sent: totalSent, failed: totalFailed, recipients: leads.length });
});
