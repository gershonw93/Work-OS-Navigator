-- ===== 065_file_shares.sql =====
-- Sending documents OUT had no home. Compliance requests pull documents IN
-- from a sub, the client portal is read-only and permanent, and everything else
-- was "download it, attach it to an email, hope the attachment isn't too big".
--
-- The case that surfaced it: a GC pulling permits sends the expeditor a set of
-- plans and forms, and the expeditor sends the approved permit back. That is a
-- two-way exchange with someone who will never have an account.
--
-- Same shape as every other outside-party link in the app: a token, no account,
-- and a record of what was sent and when it was opened.

CREATE TABLE IF NOT EXISTS file_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  -- Optional: a share can be about one job, or just company paperwork.
  project_id uuid REFERENCES projects (id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL,

  name text NOT NULL,
  message text,
  -- Snapshot of what was sent: [{ name, url, type, size }]. Denormalised on
  -- purpose - the recipient must still see exactly what you sent even if the
  -- file is later renamed, re-filed, or deleted on your side.
  files jsonb NOT NULL DEFAULT '[]'::jsonb,

  recipient_name text,
  recipient_email text,

  -- Whether the recipient can send documents back on the same link.
  allow_upload boolean NOT NULL DEFAULT true,
  upload_prompt text,

  status text NOT NULL DEFAULT 'sent',   -- sent | viewed | responded
  expires_at timestamptz,
  revoked_at timestamptz,

  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  responded_at timestamptz
);

-- What came back. Kept separate from the sent snapshot so "they replied" is a
-- fact about the share rather than a mutation of what you sent.
CREATE TABLE IF NOT EXISTS file_share_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid REFERENCES file_shares (id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  size_bytes bigint,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_shares_company ON file_shares (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_shares_project ON file_shares (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_shares_token ON file_shares (token);
CREATE INDEX IF NOT EXISTS idx_file_share_uploads_share ON file_share_uploads (share_id);
