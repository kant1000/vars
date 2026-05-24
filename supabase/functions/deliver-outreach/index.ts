// ============================================================
// VARS — deliver-outreach
// Picks up approved records from vendor_lead_outreach and
// delivers them via the appropriate channel.
//
// STUBBED: Set DELIVERY_LIVE=true in Supabase secrets when
// providers are configured. Until then, calls are logged only.
//
// Channels supported: whatsapp, sms, email
// Providers: Termii (whatsapp + sms), Resend (email)
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

// ── Provider config ───────────────────────────────────────────────────────────

const DELIVERY_LIVE    = Deno.env.get('DELIVERY_LIVE') === 'true';

const TERMII_API_KEY   = Deno.env.get('TERMII_API_KEY')   ?? '';
const TERMII_SENDER_ID = Deno.env.get('TERMII_SENDER_ID') ?? '';
const TERMII_BASE_URL  = Deno.env.get('TERMII_BASE_URL')  ?? 'https://api.ng.termii.com';

const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')   ?? '';
const RESEND_FROM      = 'VARS <hello@bookwithvars.com>';

// Simple secret so only authorised callers can trigger delivery
const DELIVER_SECRET        = Deno.env.get('DELIVER_OUTREACH_SECRET') ?? '';

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

async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  if (!DELIVERY_LIVE) {
    console.log('[deliver-outreach] Email stub →', to, '| Subject:', subject);
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

  // Require secret header if configured
  if (DELIVER_SECRET) {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${DELIVER_SECRET}`) {
      return errorResponse('Unauthorized', 401);
    }
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
    .select('id, lead_id, channel, message_body, message_template, vendor_leads!inner(email, phone)')
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
    const lead = record.vendor_leads as { email: string; phone: string } | null;
    if (!lead) {
      console.warn('[deliver-outreach] No lead for record', record.id);
      continue;
    }

    try {
      let providerId: string;

      if (record.channel === 'whatsapp') {
        providerId = await sendWhatsApp(lead.phone, record.message_body);

      } else if (record.channel === 'sms') {
        providerId = await sendSms(lead.phone, record.message_body);

      } else if (record.channel === 'email') {
        // For email channel: message_template holds the subject, message_body holds the text.
        // This convention is set by vendor-register-lead and any future email-channel insertions.
        providerId = await sendEmail(lead.email, record.message_template, record.message_body);

      } else {
        console.warn('[deliver-outreach] Unknown channel:', record.channel, 'for record', record.id);
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
