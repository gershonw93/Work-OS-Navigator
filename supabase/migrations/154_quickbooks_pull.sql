-- QuickBooks two-way, phase 1: changes made IN QuickBooks to records SyteNav
-- sent come back (lib/quickbooks-pull.ts). Off by default, per company.

-- The switch, and where the daily Change Data Capture read picks up from.
-- Turning it on sets the cursor to "now": history is never imported.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS qbo_pull_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS qbo_pull_since timestamptz;

-- A payment recorded in QuickBooks against a SyteNav invoice arrives as a
-- client payment. `origin` says where it was entered; its qbo_id is set on
-- arrival, which is what keeps the push from sending it straight back.
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'sytenav';

-- A void, delete or amount change made in QuickBooks FLAGS the SyteNav row;
-- it never deletes or rewrites it. A money record silently disappearing is
-- worse than one that is out of date. Cleared by an admin, or by the person
-- deleting / editing the row to match.
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_external_state text;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_external_note text;
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS qbo_external_at timestamptz;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS qbo_external_state text;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS qbo_external_note text;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS qbo_external_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qbo_external_state text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qbo_external_note text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qbo_external_at timestamptz;

-- Which way a sync-log row went: SyteNav -> QuickBooks, or back.
ALTER TABLE quickbooks_sync_log ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'push';

-- Every change QuickBooks tells us about, written BEFORE it is acted on.
-- The unique key makes a retried webhook, or the same change seen by both the
-- webhook and the daily read, a no-op. ON DELETE CASCADE: a fact about that
-- company alone.
CREATE TABLE IF NOT EXISTS quickbooks_inbound_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES companies (id) ON DELETE CASCADE,
  realm_id     text NOT NULL,
  environment  text NOT NULL,
  entity       text NOT NULL,
  qbo_id       text NOT NULL,
  operation    text NOT NULL,
  last_updated text NOT NULL DEFAULT '',
  source       text NOT NULL DEFAULT 'webhook',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'applied', 'ignored', 'error')),
  message      text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (realm_id, environment, entity, qbo_id, operation, last_updated)
);
ALTER TABLE quickbooks_inbound_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_qbo_inbound_pending ON quickbooks_inbound_events (status, received_at);
CREATE INDEX IF NOT EXISTS idx_qbo_inbound_company ON quickbooks_inbound_events (company_id, received_at DESC);
