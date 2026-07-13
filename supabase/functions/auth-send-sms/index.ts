// ============================================================
// VARS — auth-send-sms (Supabase Auth hook)
// Replaces Supabase's default SMS sending for phone OTP auth.
// Delivers the OTP via 360dialog (WhatsApp) instead of SMS.
// Configured in: Supabase Dashboard → Authentication → Hooks → Send SMS
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
        type: 'text',
        text: { body: `Your VARS login code is: *${otp}*\n\nExpires in 10 minutes. Do not share this with anyone.` },
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
