// ============================================================
// VARS — auth-send-email (Supabase Auth hook)
// Replaces Supabase's default email sending for all auth events.
// On every OTP/magic-link trigger:
//   1. Sends the code to the user's email via Resend
//   2. Looks up their phone from vendor_leads (or vendors table)
//      and sends the same code to WhatsApp via 360dialog
// Configured in: Supabase Dashboard → Authentication → Hooks → Send Email
// ============================================================

import { createAdminClient } from '../_shared/supabase.ts';

const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')      ?? '';
const RESEND_FROM         = 'VARS <no-reply@bookwithvars.com>';
const DIALOG360_API_KEY   = Deno.env.get('DIALOG360_API_KEY')   ?? '';
const DIALOG360_BASE_URL  = Deno.env.get('DIALOG360_BASE_URL')  ?? 'https://waba-v2.360dialog.io';
const HOOK_SECRET         = Deno.env.get('AUTH_HOOK_SECRET')    ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!HOOK_SECRET || auth !== `Bearer ${HOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: {
    user: { id: string; email?: string };
    email_data: {
      token: string;
      token_hash: string;
      redirect_to: string;
      email_action_type: string;
      site_url: string;
    };
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { user, email_data } = body;
  const email      = user.email ?? '';
  const otp        = email_data.token;
  const actionType = email_data.email_action_type;

  // ── Build email content ───────────────────────────────────

  let subject: string;
  let text: string;

  if (actionType === 'recovery') {
    subject = `Your VARS reset code: ${otp}`;
    text    = `Your VARS password reset code is: ${otp}\n\nExpires in 10 minutes. If you did not request this, ignore this message.`;
  } else {
    subject = `Your VARS code: ${otp}`;
    text    = `Your VARS login code is: ${otp}\n\nExpires in 10 minutes. Do not share this with anyone.`;
  }

  // ── Send email via Resend ─────────────────────────────────

  if (RESEND_API_KEY && email) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: RESEND_FROM, to: [email], subject, text }),
      });
      if (!res.ok) {
        console.error('[auth-send-email] Resend error:', await res.text());
      } else {
        const data = await res.json();
        console.log('[auth-send-email] Email sent:', data.id, '→', email);
      }
    } catch (err) {
      console.error('[auth-send-email] Email send failed:', err);
    }
  } else {
    console.warn('[auth-send-email] Resend not configured or no email — skipping email');
  }

  // ── Look up phone and send WhatsApp ──────────────────────

  if (DIALOG360_API_KEY && email) {
    try {
      const db = createAdminClient();
      let phone: string | null = null;

      // Check vendor_leads first (covers leads + pre-onboarding vendors)
      const { data: lead } = await db
        .from('vendor_leads')
        .select('phone')
        .eq('email', email)
        .maybeSingle();
      phone = lead?.phone ?? null;

      // Fall back to vendors table for fully onboarded vendors
      if (!phone && user.id) {
        const { data: vendor } = await db
          .from('vendors')
          .select('phone_number')
          .eq('id', user.id)
          .maybeSingle();
        phone = vendor?.phone_number ?? null;
      }

      if (phone) {
        const waText = actionType === 'recovery'
          ? `Your VARS reset code is: *${otp}*\n\nExpires in 10 minutes. Do not share this with anyone.`
          : `Your VARS login code is: *${otp}*\n\nExpires in 10 minutes. Do not share this with anyone.`;

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
            text: { body: waText },
          }),
        });
        if (!res.ok) {
          console.error('[auth-send-email] WhatsApp error:', await res.text());
        } else {
          const data = await res.json();
          console.log('[auth-send-email] WhatsApp sent:', data.messages?.[0]?.id, '→', phone);
        }
      } else {
        console.log('[auth-send-email] No phone found for', email, '— WhatsApp skipped');
      }
    } catch (err) {
      console.error('[auth-send-email] WhatsApp lookup/send failed:', err);
    }
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
