// ============================================================
// VARS — Resend Contacts helper
// Upserts a vendor lead as a contact in the Resend audience.
// Fire-and-forget — errors are logged, never thrown to caller.
// ============================================================

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')     ?? '';
const RESEND_AUDIENCE_ID = Deno.env.get('RESEND_AUDIENCE_ID') ?? '';

export async function upsertResendContact(params: {
  email:         string;
  firstName:     string;
  lastName:      string;
  unsubscribed?: boolean;
}): Promise<void> {
  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) return;

  try {
    const res = await fetch(
      `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email:        params.email,
          first_name:   params.firstName,
          last_name:    params.lastName,
          unsubscribed: params.unsubscribed ?? false,
        }),
      },
    );
    if (!res.ok) {
      console.error('[resend-contacts] upsert failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[resend-contacts] upsert error:', err);
  }
}
