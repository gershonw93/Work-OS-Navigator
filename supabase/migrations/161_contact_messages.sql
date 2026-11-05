-- 161: The public contact form keeps what it was sent.
--
-- /contact used to build a mailto: link on submit. With no mail app set up -
-- most webmail users, every locked-down office PC - that does nothing at all:
-- no error, no message, no email, and the visitor believes they wrote to us.
-- The form now posts to /api/contact, which writes the message HERE before it
-- emails info@ - so a message SendGrid refused is still a message we have, and
-- `emailed_at` says which ones never reached the inbox.
--
-- `visitor` is an HMAC of the IP (the help-answer pattern): enough to cap one
-- sender per hour, useless for anything else, and no IP is stored.
-- Service role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  email       text NOT NULL,
  company     text,
  message     text NOT NULL,
  visitor     text NOT NULL,
  emailed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS contact_messages_visitor_idx ON contact_messages (visitor, created_at DESC);
CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at DESC);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
