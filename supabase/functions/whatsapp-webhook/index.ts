// ============================================================
// VARS — whatsapp-webhook
// Minimal receiver for 360dialog delivery callbacks (inbound messages +
// outbound status receipts). Payload shape follows the WhatsApp Cloud API
// webhook format that 360dialog proxies:
//   { entry: [{ changes: [{ value: { messages?: [...], statuses?: [...] } }] }] }
//
// Before this function existed, 360dialog had no webhook URL to deliver
// to and every attempt 404'd (confirmed 283x/24h via query_logs). This
// just persists events to whatsapp_webhook_events for ops visibility —
// no automated processing reads the table yet.
//
// No signature verification: 360dialog's webhook delivery for this
// account isn't configured with a shared secret. If one is added later
// (custom header via the 360dialog dashboard), check it here before
// trusting the payload.
// ============================================================

import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const supabase = createAdminClient();

  try {
    const entries = (payload.entry as Array<Record<string, unknown>>) ?? [];
    let stored = 0;

    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
      for (const change of changes) {
        const value = (change.value as Record<string, unknown>) ?? {};

        const messages = (value.messages as Array<Record<string, unknown>>) ?? [];
        for (const msg of messages) {
          const { error } = await supabase.from('whatsapp_webhook_events').insert({
            event_type: 'inbound_message',
            wa_message_id: (msg.id as string) ?? null,
            from_number: (msg.from as string) ?? null,
            body: (msg.text as Record<string, unknown> | undefined)?.body as string ?? null,
            raw_payload: msg,
          });
          if (error) console.error('whatsapp-webhook: failed to store inbound message', error);
          else stored++;
        }

        const statuses = (value.statuses as Array<Record<string, unknown>>) ?? [];
        for (const status of statuses) {
          const { error } = await supabase.from('whatsapp_webhook_events').insert({
            event_type: 'status_receipt',
            wa_message_id: (status.id as string) ?? null,
            from_number: (status.recipient_id as string) ?? null,
            status: (status.status as string) ?? null,
            raw_payload: status,
          });
          if (error) console.error('whatsapp-webhook: failed to store status receipt', error);
          else stored++;
        }
      }
    }

    console.log(`whatsapp-webhook: stored ${stored} event(s)`);
    return jsonResponse({ stored });
  } catch (err) {
    console.error('whatsapp-webhook error:', err);
    // Non-2xx so 360dialog retries delivery — inserts above are not deduped,
    // so a retried delivery may double-store; acceptable for a raw event log.
    return errorResponse('Internal error', 500);
  }
});
