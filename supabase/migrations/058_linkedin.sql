-- ===== 058_linkedin.sql =====
-- LinkedIn company-page auto-posting. Per-company OAuth connection (same shape
-- as QuickBooks) plus a post queue: compose in Settings > Integrations, post
-- now or schedule, and the cron publishes whatever is due. All access is
-- service-role from the API layer; RLS stays on with no policy (deny to the
-- public anon key). Tokens live here and never touch the client.

CREATE TABLE IF NOT EXISTS linkedin_connections (
  company_id uuid PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
  org_urn text,                           -- urn:li:organization:<id> (null until picked)
  org_name text,
  access_token text NOT NULL,
  refresh_token text,                     -- only issued to apps approved for refresh
  access_expires_at timestamptz,          -- access token ~60d
  refresh_expires_at timestamptz,         -- refresh token ~365d
  scope text,
  status text NOT NULL DEFAULT 'connected', -- 'connected' | 'needs_org' | 'expired' | 'revoked'
  connected_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE linkedin_connections ENABLE ROW LEVEL SECURITY;

-- Short-lived state tokens for the OAuth handshake (CSRF + which company).
CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state text PRIMARY KEY,
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE linkedin_oauth_states ENABLE ROW LEVEL SECURITY;

-- The post queue + history. 'scheduled' rows with scheduled_at <= now() are
-- published by /api/cron/linkedin-posts; 'posted'/'failed' stay as history.
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',   -- 'draft' | 'scheduled' | 'posted' | 'failed'
  scheduled_at timestamptz,
  posted_at timestamptz,
  linkedin_post_urn text,                 -- urn:li:share:... once published
  error text,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_company ON linkedin_posts (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_due ON linkedin_posts (status, scheduled_at);
