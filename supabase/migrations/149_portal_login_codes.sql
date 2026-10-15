-- A free login for a job's client, proved by their inbox.
--
-- "approvals must come with a free login". The portal link is a bearer token
-- that a GC may text, paste or forward, so it cannot be the thing that agrees
-- to spend money. A client approving a change order now signs in first, as the
-- address on the job's customer record, by a six-digit code sent to it - the
-- one proof that the person pressing Approve reads that inbox. No password to
-- forget: the code IS the login, and the session it starts stays in their
-- browser for next time.
--
-- Only the HASH of a code is stored, it lives ten minutes, it dies after five
-- wrong guesses, and it is good once. ON DELETE CASCADE: a code for a job that
-- no longer exists proves nothing.
CREATE TABLE IF NOT EXISTS portal_login_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_portal_login_codes_email ON portal_login_codes (lower(email), created_at DESC);
ALTER TABLE portal_login_codes ENABLE ROW LEVEL SECURITY;

-- Who approved, as a login rather than a typed name.
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_response_email text;
