-- ===== 112_google_contacts_import.sql =====
-- Google Contacts import, and the staging area it lands in.
--
-- WHY A STAGING AREA AND NOT THE DIRECTORY. Asked for in those words: "They
-- land in a separate staging area, not auto-mixed into the directory." A phone
-- book is not a trade directory - it holds your dentist, your brother-in-law
-- and four numbers for the same electrician. Merging it straight into the
-- Directory would bury the subs you actually work with under everyone you have
-- ever met, and there is no undo for that.
--
-- So: contacts land here, you label them and assign them to a job, and only
-- what you choose ever reaches `companies`.

-- ── the connection, one per company ─────────────────────────────────────────
-- Mirrors quickbooks_connections: the tokens are the company's, not a person's,
-- so the import survives whoever set it up leaving.
CREATE TABLE IF NOT EXISTS google_connections (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  google_email text,                        -- which Google account is linked
  access_token text NOT NULL,
  refresh_token text,                       -- absent when Google declines to re-issue one
  access_expires_at timestamptz,
  scope text,
  status text NOT NULL DEFAULT 'connected', -- 'connected' | 'expired' | 'revoked'
  -- SET NULL, not CASCADE: the connection is the COMPANY's and has to outlive
  -- the account that made it. Losing the whole import because somebody left is
  -- the failure this column exists to avoid.
  connected_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

-- CSRF for the handshake, same shape as the QuickBooks one.
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_oauth_states ENABLE ROW LEVEL SECURITY;

-- ── the staging area ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_contact_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  -- Google's own id for the person. The unique index below is what makes a
  -- re-sync an UPDATE rather than a second copy of your whole phone book.
  resource_name text NOT NULL,
  name text,
  email text,
  phone text,
  organization text,          -- their company, per Google
  job_title text,
  -- What YOU decided they are. Null until somebody says.
  contact_type text,          -- 'subcontractor' | 'supplier' | 'delivery' | 'inspector' | 'other'
  trade text,
  assigned_project_id uuid REFERENCES projects (id) ON DELETE SET NULL,
  -- 'staged' until it is dealt with; 'imported' once it becomes a directory
  -- contact; 'dismissed' for the dentist.
  status text NOT NULL DEFAULT 'staged',
  -- What it became, so a second sync cannot re-offer somebody you already
  -- filed, and so the trail back exists.
  company_record_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  imported_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE google_contact_imports ENABLE ROW LEVEL SECURITY;

-- ONE ROW PER PERSON PER COMPANY. Without this, syncing twice doubles the
-- staging area and the second pass looks like 400 new contacts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_contact_imports_unique
  ON google_contact_imports (company_id, resource_name);

CREATE INDEX IF NOT EXISTS idx_google_contact_imports_company_status
  ON google_contact_imports (company_id, status);
