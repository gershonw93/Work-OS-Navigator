-- ===== 045_access_requests.sql =====
-- Gated signup: the public /signup page becomes a Request Access form. The
-- platform owner reviews requests in /admin and approves them, which mints an
-- invite token; only a valid token unlocks the real account-creation form.

CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company_name text,
  company_type text,            -- gc | subcontractor
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  invite_token text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_email ON access_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_token ON access_requests (invite_token) WHERE invite_token IS NOT NULL;
