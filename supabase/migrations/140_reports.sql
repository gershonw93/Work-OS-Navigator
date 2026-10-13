-- ===== 140_reports.sql =====
-- The Reports tab: a report's SETTINGS can be saved, and a report can be
-- SHARED as a link.
--
-- saved_reports holds settings, never numbers: a saved "This month, every
-- job" has to mean this month next month, so it is re-run every time it is
-- opened. CASCADE on the company - a saved report is a fact about that company
-- alone. SET NULL on the author: the report outlives the account that made it.
--
-- report_shares holds a SNAPSHOT - the finished report as it read when it was
-- shared. Deliberately not live: a developer or a sub holding a link must see
-- what the sender chose to send, not whatever the job says next week, and
-- never a section the sender could not see themselves. The token is the
-- credential (no account on the other end), so it can be turned off
-- (revoked_at) and it records when it was first opened (viewed_at), the same
-- shape as file_shares.
--
-- Both are reached only through service-role API routes, so RLS is on with
-- no policies: nothing in a browser reads these tables directly.

CREATE TABLE IF NOT EXISTS saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  config jsonb NOT NULL,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_reports_company ON saved_reports (company_id, updated_at DESC);
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES saved_reports (id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  title text NOT NULL,
  snapshot jsonb NOT NULL,
  config jsonb NOT NULL,
  recipient_name text,
  recipient_email text,
  message text,
  emailed_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_report_shares_company ON report_shares (company_id, created_at DESC);
ALTER TABLE report_shares ENABLE ROW LEVEL SECURITY;
