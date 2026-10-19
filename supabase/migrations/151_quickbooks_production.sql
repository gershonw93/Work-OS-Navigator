-- QuickBooks on production: one file per account, files never mix, tokens
-- at rest encrypted.
--
-- THE FILE A COMPANY'S QUICKBOOKS IDS BELONG TO. Every qbo_id on a customer,
-- bill, invoice or payment is an id in ONE QuickBooks file (a realm, in one
-- environment). Nothing recorded which, so connecting a different file - the
-- production company after the sandbox one - would have sent sandbox ids to
-- the real books: "already synced" for records that are not there, and voids
-- aimed at whatever happens to carry that number in the new file. The company
-- now remembers its file, and a callback for a different one is refused until
-- somebody deliberately starts fresh. Kept on `companies`, not on the
-- connection row, because a disconnect deletes the connection and keeps the
-- ids (so reconnecting the SAME file recognises what it already has).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS qbo_realm_id text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS qbo_environment text;
-- Start fresh on a new file: transactions recorded before this are not pushed
-- by the backlog sync, so a new file is not flooded with history the
-- bookkeeper already holds (or that belonged to a sandbox).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS qbo_sync_from timestamptz;

UPDATE companies co SET qbo_realm_id = c.realm_id, qbo_environment = c.environment
  FROM quickbooks_connections c
 WHERE c.company_id = co.id AND co.qbo_realm_id IS NULL;

-- A SUB'S VENDOR ID IS PER FILE, NOT PER SUB. `companies.qbo_vendor_id` sat on
-- the SUB's row, which every GC they work for shares, so the vendor id one
-- GC's push created in their file was reused in the next GC's file. Keyed on
-- the file instead. The 14 existing ids were all created in the one file that
-- has ever been connected, and are copied across against it.
CREATE TABLE IF NOT EXISTS quickbooks_vendor_links (
  realm_id          text NOT NULL,
  environment       text NOT NULL,
  vendor_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  qbo_vendor_id     text NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, environment, vendor_company_id)
);
ALTER TABLE quickbooks_vendor_links ENABLE ROW LEVEL SECURITY;

INSERT INTO quickbooks_vendor_links (realm_id, environment, vendor_company_id, qbo_vendor_id, synced_at)
SELECT c.realm_id, c.environment, v.id, v.qbo_vendor_id, coalesce(v.qbo_vendor_synced_at, now())
  FROM companies v
 CROSS JOIN (SELECT realm_id, environment FROM quickbooks_connections LIMIT 1) c
 WHERE v.qbo_vendor_id IS NOT NULL
   AND (SELECT count(*) FROM quickbooks_connections) = 1
ON CONFLICT DO NOTHING;
COMMENT ON COLUMN companies.qbo_vendor_id IS 'DEPRECATED (151): read nothing from it - quickbooks_vendor_links is per file.';

-- ONE FILE, ONE SYTENAV ACCOUNT. Two accounts pushing into one file would each
-- believe they own its customers and both push the same job's money.
CREATE UNIQUE INDEX IF NOT EXISTS uq_quickbooks_connections_realm
  ON quickbooks_connections (realm_id, environment);

-- Refresh health, so "survives a day" is a fact on the card and not a hope.
ALTER TABLE quickbooks_connections ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;
ALTER TABLE quickbooks_connections ADD COLUMN IF NOT EXISTS last_refresh_error text;

-- What "start fresh" cleared, kept: the ids are meaningless in the new file,
-- but "which QuickBooks record was this in the old one" is a question somebody
-- asks the day after. ON DELETE CASCADE: a fact about that company alone.
CREATE TABLE IF NOT EXISTS quickbooks_id_archive (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  realm_id     text,
  environment  text,
  entity_table text NOT NULL,
  entity_id    uuid NOT NULL,
  qbo_ids      jsonb NOT NULL,
  archived_by  uuid REFERENCES profiles (id) ON DELETE SET NULL,
  archived_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE quickbooks_id_archive ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_qbo_id_archive_company ON quickbooks_id_archive (company_id, archived_at DESC);
