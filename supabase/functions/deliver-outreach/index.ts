// ============================================================
// VARS — deliver-outreach
// Picks up approved records from vendor_lead_outreach and
// delivers them via the appropriate channel.
//
// STUBBED: Set DELIVERY_LIVE=true in Supabase secrets when
// providers are configured. Until then, calls are logged only.
//
// Channels supported: whatsapp, email
// SMS channel exists in schema but is NOT CURRENTLY USED —
// reserved for future reactivation. No SMS records are created
// by vendor_lead_tick().
// Providers: Termii (whatsapp), Resend (email)
//
// Call via POST — no body required.
// Optional body: { lead_id: string } to deliver only for one lead.
// Optional body: { record_id: string } to deliver one specific record.
//
// Should be called by a scheduled cron or by the admin "Send Now"
// button once providers are wired up.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';
import {
  getFirstName,
  welcomeEmailHtmlParts,
  reengagementEmailHtmlParts,
  goLiveEmailHtmlParts,
  type HtmlEmailParts,
} from '../_shared/lead-copy.ts';
import { EMAIL_TEMPLATE } from '../_shared/email-template.ts';

// ── Provider config ───────────────────────────────────────────────────────────

const DELIVERY_LIVE      = Deno.env.get('DELIVERY_LIVE') === 'true';

const TERMII_API_KEY     = Deno.env.get('TERMII_API_KEY')   ?? '';
const TERMII_SENDER_ID   = Deno.env.get('TERMII_SENDER_ID') ?? '';
const TERMII_BASE_URL    = Deno.env.get('TERMII_BASE_URL')  ?? 'https://v3.api.termii.com';

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')   ?? '';
const RESEND_FROM        = 'VARS <hello@bookwithvars.com>';

const UNSUBSCRIBE_SECRET = Deno.env.get('UNSUBSCRIBE_SECRET') ?? '';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? '';

// Require the delivery secret to be set — absent secret = open endpoint.
// Use DELIVERY_LIVE=false (stub mode) for safe local testing, not an absent secret.
const DELIVER_SECRET = Deno.env.get('DELIVER_OUTREACH_SECRET') ?? '';
if (!DELIVER_SECRET) {
  throw new Error('[deliver-outreach] DELIVER_OUTREACH_SECRET is not set — configure in Supabase secrets');
}

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

// ── Provider stubs / implementations ─────────────────────────────────────────

async function sendWhatsApp(to: string, body: string): Promise<string> {
  if (!DELIVERY_LIVE) {
    console.log('[deliver-outreach] WhatsApp stub →', to, ':', body.slice(0, 80));
    return `stub-wa-${Date.now()}`;
  }

  const res = await fetch(`${TERMII_BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TERMII_API_KEY,
      to,
      from:    TERMII_SENDER_ID,
      sms:     body,
      type:    'plain',
      channel: 'whatsapp',
    }),
  });

  if (!res.ok) throw new Error(`Termii WhatsApp error: ${await res.text()}`);
  const data = await res.json();
  return data.message_id as string;
}

// NOT CURRENTLY USED — reserved for future SMS reactivation.
// vendor_lead_tick() does not generate sms channel records.
async function sendSms(to: string, body: string): Promise<string> {
  if (!DELIVERY_LIVE) {
    console.log('[deliver-outreach] SMS stub →', to, ':', body.slice(0, 80));
    return `stub-sms-${Date.now()}`;
  }

  const res = await fetch(`${TERMII_BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TERMII_API_KEY,
      to,
      from:    TERMII_SENDER_ID,
      sms:     body,
      type:    'plain',
      channel: 'generic',
    }),
  });

  if (!res.ok) throw new Error(`Termii SMS error: ${await res.text()}`);
  const data = await res.json();
  return data.message_id as string;
}

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  unsubUrl?: string,
): Promise<string> {
  if (!DELIVERY_LIVE) {
    console.log('[deliver-outreach] Email stub →', to, '| Subject:', subject, html ? '(html)' : '(text-only)');
    return `stub-email-${Date.now()}`;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    RESEND_FROM,
      to:      [to],
      subject,
      text,
      ...(html ? { html } : {}),
      ...(unsubUrl ? {
        headers: {
          'List-Unsubscribe':      `<mailto:unsubscribe@bookwithvars.com?subject=unsubscribe>, <${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      } : {}),
    }),
  });

  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const isCronCall   = req.headers.get('x-vars-cron-secret') === Deno.env.get('CRON_SECRET');
  const isManualCall = (req.headers.get('Authorization') ?? '') === `Bearer ${DELIVER_SECRET}`;
  if (!isCronCall && !isManualCall) {
    return errorResponse('Unauthorized', 401);
  }

  let body: { lead_id?: string; record_id?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Empty body is fine
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  // Build query — optionally scope to one lead or one record
  let query = db
    .from('vendor_lead_outreach')
    .select('id, lead_id, channel, message_body, message_template, message_type, vendor_leads!inner(email, phone, full_name, service_type, pioneer, email_unsubscribed)')
    .eq('status', 'approved')
    .order('approved_at', { ascending: true })
    .limit(50);

  if (body.record_id) {
    query = query.eq('id', body.record_id);
  } else if (body.lead_id) {
    query = query.eq('lead_id', body.lead_id);
  }

  const { data: records, error: fetchErr } = await query;

  if (fetchErr) return errorResponse('DB fetch error: ' + fetchErr.message, 500);
  if (!records?.length) return jsonResponse({ delivered: 0, failed: 0 });

  let delivered = 0;
  let failed    = 0;

  for (const record of records) {
    const lead = record.vendor_leads as {
      email:             string;
      phone:             string;
      full_name:         string;
      service_type:      string;
      pioneer:           boolean;
      email_unsubscribed: boolean;
    } | null;
    if (!lead) {
      console.warn('[deliver-outreach] No lead for record', record.id);
      continue;
    }

    try {
      let providerId: string;

      if (record.channel === 'whatsapp') {
        providerId = await sendWhatsApp(lead.phone, record.message_body);

      } else if (record.channel === 'sms') {
        // NOT CURRENTLY USED — reserved for future SMS reactivation
        providerId = await sendSms(lead.phone, record.message_body);

      } else if (record.channel === 'email') {

        // Belt-and-braces guard: skip if lead has unsubscribed since this
        // record was approved. The tick won't create new records but existing
        // approved ones could still be in the queue.
        if (lead.email_unsubscribed) {
          console.warn('[deliver-outreach] Skipping email for unsubscribed lead, blocking record', record.id);
          await db.from('vendor_lead_outreach').update({ status: 'blocked' }).eq('id', record.id);
          continue;
        }

        // Generate a real unsubscribe URL for this lead
        const unsubUrl = UNSUBSCRIBE_SECRET && SUPABASE_URL
          ? `${SUPABASE_URL}/functions/v1/unsubscribe-lead?id=${record.lead_id}&t=${await makeUnsubToken(record.lead_id)}`
          : '';

        const firstName = getFirstName(lead.full_name ?? '');
        let subject     = record.message_template;
        let html: string | undefined;

        let parts: HtmlEmailParts | null = null;
        let ctaLabel = '';
        let ctaUrl   = '';

        if (record.message_type === 'welcome_email') {
          parts    = welcomeEmailHtmlParts(lead.full_name, lead.service_type, lead.pioneer, 0);
          ctaLabel = 'Join VARS';
          ctaUrl   = 'https://bookwithvars.com';
        } else if (record.message_type === 'go_live') {
          parts    = goLiveEmailHtmlParts();
          ctaLabel = 'Open VARS';
          ctaUrl   = 'https://bookwithvars.com';
        } else if (record.message_type === 'reengagement_email' || record.message_type === 'reengagement') {
          parts    = reengagementEmailHtmlParts(lead.full_name, lead.service_type, lead.pioneer);
          ctaLabel = 'Complete your profile';
          ctaUrl   = 'https://bookwithvars.com';
        } else {
          console.error('[deliver-outreach] Unknown email message_type:', record.message_type, '— record', record.id, 'skipped');
          continue;
        }

        subject = parts.heading;
        html    = fillTemplate(EMAIL_TEMPLATE, {
          first_name:       firstName,
          heading:          parts.heading,
          body_paragraph_1: parts.body1,
          body_paragraph_2: parts.body2,
          cta_label:        ctaLabel,
          cta_url:          ctaUrl,
          unsubscribe_url:  unsubUrl,
        });

        providerId = await sendEmail(lead.email, subject, record.message_body, html, unsubUrl);

      } else {
        console.warn('[deliver-outreach] Unknown channel:', record.channel, '— record', record.id, 'skipped');
        continue;
      }

      await db.from('vendor_lead_outreach').update({
        status:              'sent',
        sent_at:             now,
        provider_message_id: providerId,
      }).eq('id', record.id);

      // Stamp last_outreach only for phone-based channels.
      // Email is a parallel channel — delivering an email must not reset the
      // WhatsApp cadence clock, or the intro CTE (last_outreach IS NULL) never fires.
      if (record.channel !== 'email') {
        await db.from('vendor_leads').update({ last_outreach: now }).eq('id', record.lead_id);
      }

      delivered++;
    } catch (err) {
      console.error('[deliver-outreach] Failed for record', record.id, err);
      await db.from('vendor_lead_outreach').update({
        status:         'failed',
        provider_error: err instanceof Error ? err.message : String(err),
      }).eq('id', record.id);
      failed++;
    }
  }

  console.log(`[deliver-outreach] done — delivered: ${delivered}, failed: ${failed}, live: ${DELIVERY_LIVE}`);
  return jsonResponse({ delivered, failed, live: DELIVERY_LIVE });
});
