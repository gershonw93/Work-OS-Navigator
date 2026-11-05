-- 161: A township's reply lands on the permit.
--
-- "Email it" sent the permit set with the GC as the reply-to, so the answer -
-- the corrections letter, the approved permit - came back to a personal inbox
-- and had to be carried into SyteNav by hand. The 250-email thread this whole
-- feature exists to replace was still being written, one reply at a time.
--
-- Each permit gets its own reply address, permit-<reply_token>@<REPLY_DOMAIN>.
-- A RANDOM TOKEN, never the permit or project id: ids appear in URLs and
-- screenshots, and anybody holding one could post mail onto the permit.
-- Minted the first time the permit is emailed; NULL until then.

ALTER TABLE permits ADD COLUMN IF NOT EXISTS reply_token text;
CREATE UNIQUE INDEX IF NOT EXISTS permits_reply_token ON permits (reply_token) WHERE reply_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS permit_inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A reply is a fact about this permit alone.
  permit_id uuid NOT NULL REFERENCES permits (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

  -- The Message-ID header. SendGrid retries a POST it did not get a 2xx for;
  -- a retry must not land the same reply twice. The unique index is the gate.
  message_id text,
  from_email text,
  from_name text,
  subject text,
  -- Plain text only. HTML from outside the company is never rendered.
  text_body text,
  -- [{ name, url, type, size }], uploaded to the permits bucket.
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),

  -- The copy sent on to the person who emailed the township, so the reply
  -- still reaches their inbox. Written only on a confirmed send.
  forwarded_to text,
  forwarded_at timestamptz,

  -- What AI made of it, for "Their answer" to start from - never applied on
  -- its own. pending | ready | none (not an answer) | skipped (out of scans)
  -- | failed.
  suggestion jsonb,
  suggestion_status text NOT NULL DEFAULT 'pending'
    CHECK (suggestion_status IN ('pending', 'ready', 'none', 'skipped', 'failed')),
  -- Set when a person records an answer from it, so it is not offered twice.
  used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS permit_inbound_emails_message ON permit_inbound_emails (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permit_inbound_emails_permit ON permit_inbound_emails (permit_id, received_at);

ALTER TABLE permit_inbound_emails ENABLE ROW LEVEL SECURITY;
