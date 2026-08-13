-- ===== 075_client_invoice_link.sql =====
-- A link the client can open, with no account.
--
-- The invoice printed and saved as a PDF, which still leaves you attaching a
-- file to an email. Same token-link pattern as the project portal, RFIs, bid
-- requests, compliance requests and file shares: one URL, no login, opens on a
-- phone.
--
-- Deliberately NOT emailed from here - there is no transactional email provider
-- configured, and a "send" button that silently does nothing is worse than a
-- copy button that plainly works. Copy the link, or open it in your own mail
-- client, until email lands.

ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invoices_token
  ON client_invoices (token) WHERE token IS NOT NULL;
