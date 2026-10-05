-- ===== 124_account_deletion_requests.sql =====
-- A request to delete an account, made from INSIDE the app.
--
-- WHY. Apple (App Store rule 5.1.1(v)) requires that anybody with an account
-- can start deleting it from inside the app, and Settings -> Danger Zone had a
-- "Delete Company Account" button that sent DELETE to /api/settings - a method
-- that route has never had - so it always answered "Failed to delete account".
-- Deletion is carried out by us within 30 days (see /delete-account); this is
-- the in-app door to that, and the record that the request was made.
--
-- THE ROW IS THE RECORD. "When did they ask, and what for" is the question that
-- arrives later, and an email in one inbox cannot answer it for anybody else.

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL, not CASCADE: the request has to outlive the account it asked to
  -- delete - that is exactly when somebody asks whether it was carried out.
  profile_id uuid REFERENCES profiles (id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  -- Copied at the time, because the profile and company rows are about to go.
  email text NOT NULL,
  name text,
  company_name text,
  -- 'self' = this person's login; 'company' = the whole company account.
  scope text NOT NULL CHECK (scope IN ('self', 'company')),
  -- 'open' is the state a request starts in: received, not yet carried out.
  -- Only a person closing it moves it on.
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- ONE OPEN REQUEST PER PERSON PER SCOPE. A double press, or a second tab, must
-- not send support two emails about one request - the same rule as any button
-- that really sends.
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_open
  ON account_deletion_requests (profile_id, scope) WHERE status = 'open';
