// ============================================================
// VARS — auth-send-sms (Supabase Auth hook)
// Replaces Supabase's default SMS sending for phone OTP auth.
// Delivers the OTP via 360dialog (WhatsApp) instead of SMS.
// Configured in: Supabase Dashboard → Authentication → Hooks → Send SMS
//
// Sends a Meta-approved AUTHENTICATION-category HSM template
// (template name below), not free text — business-initiated WhatsApp
// messages are rejected otherwise. Authentication templates are mostly
// Meta-authored: "vars_login_otp" body is fixed by Meta as
// "{{1}} is your verification code." — custom phrasing isn't allowed
// for this category. The "Copy Code" button is mandatory in 360dialog's
// Authentication flow (couldn't be turned off), so the send payload
// includes a matching `button` component alongside the body — both
// carry the same OTP value. Per Meta's WhatsApp Cloud API docs for
// copy-code authentication buttons: sub_type "copy_code", parameter
// type "coupon_code". If sends start failing with a button/component
// shape error, double check this against 360dialog's own API reference,
// since this wasn't verified against a live send.
// ============================================================

const DIALOG360_API_KEY  = Deno.env.get('DIALOG360_API_KEY')  ?? '';
const DIALOG360_BASE_URL = Deno.env.get('DIALOG360_BASE_URL') ?? 'https://waba-v2.360dialog.io';
const HOOK_SECRET        = Deno.env.get('AUTH_HOOK_SECRET')   ?? '';

// Standard Webhooks signature verification (https://www.standardwebhooks.com)
async function verifySignature(req: Request, body: string): Promise<boolean> {
  const webhookId        = req.headers.get('webhook-id')        ?? '';
  const webhookTimestamp = req.headers.get('webhook-timestamp') ?? '';
  const webhookSignature = req.headers.get('webhook-signature') ?? '';
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const b64 = HOOK_SECRET.replace(/^v1,whsec_/, '');
  const keyBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );

  const signed = `${webhookId}.${webhookTimestamp}.${body}`;
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return webhookSignature.split(' ').some(s => s === `v1,${computed}`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  if (!HOOK_SECRET || !(await verifySignature(req, rawBody))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: {
    user: { id: string; phone: string };
    sms: { otp: string };
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawPhone = body.user?.phone ?? '';
  const phone    = rawPhone.replace(/^\+/, '');
  const otp      = body.sms?.otp   ?? '';

  if (!phone || !otp) {
    console.error('[auth-send-sms] Missing phone or otp in payload');
    return new Response(JSON.stringify({ error: 'Missing phone or otp' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!DIALOG360_API_KEY) {
    console.error('[auth-send-sms] DIALOG360_API_KEY not set');
    return new Response(JSON.stringify({ error: 'Provider not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(`${DIALOG360_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': DIALOG360_API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name:     'vars_login_otp',
          language: { code: 'en' },
          components: [
            {
              type:       'body',
              parameters: [{ type: 'text', text: otp }],
            },
            {
              type:       'button',
              sub_type:   'copy_code',
              index:      '0',
              parameters: [{ type: 'coupon_code', coupon_code: otp }],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[auth-send-sms] 360dialog error:', errText);
      return new Response(JSON.stringify({ error: 'WhatsApp delivery failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    console.log('[auth-send-sms] WhatsApp OTP sent:', data.messages?.[0]?.id, '→', phone);
  } catch (err) {
    console.error('[auth-send-sms] WhatsApp send failed:', err);
    return new Response(JSON.stringify({ error: 'Delivery failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
