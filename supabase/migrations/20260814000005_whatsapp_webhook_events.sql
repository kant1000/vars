-- ============================================================
-- Migration: whatsapp_webhook_events
--
-- Minimal receiver table for 360dialog webhook deliveries (the
-- whatsapp-webhook edge function). Was previously unhandled —
-- 360dialog was posting to a URL with no function behind it,
-- producing a 404 on every delivery attempt (confirmed via
-- query_logs, 283x/24h). This table gives the receiver somewhere
-- to persist inbound messages and outbound delivery-status receipts
-- for later ops visibility; no automated processing reads it yet.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL, -- 'inbound_message' | 'status_receipt'
  wa_message_id   text,
  from_number     text,
  status          text,       -- sent | delivered | read | failed (status_receipt only)
  body            text,       -- message text (inbound_message only)
  raw_payload     jsonb       NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_wa_message_id
  ON whatsapp_webhook_events (wa_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_received_at
  ON whatsapp_webhook_events (received_at DESC);

-- No public RLS policies — only service role (the edge function) writes here.
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
