-- ===== 058_linkedin.sql =====
-- LinkedIn business-page auto-posting - a single, platform-wide connection
-- managed only by the platform owner (super admin) from /admin. This is NOT a
-- per-company feature: there is exactly one connected page for the whole app.
-- All access is service-role from the API layer; RLS stays on with no policy
-- (deny to the public anon key). Tokens live here and never touch the client.

-- Singleton connection: the CHECK pins it to a single row (id = 1).
CREATE TABLE IF NOT EXISTS linkedin_connection (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
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
ALTER TABLE linkedin_connection ENABLE ROW LEVEL SECURITY;

-- Short-lived state tokens for the OAuth handshake (CSRF; created only by the
-- super-admin-gated connect route, so it's the trust anchor for the callback).
CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state text PRIMARY KEY,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE linkedin_oauth_states ENABLE ROW LEVEL SECURITY;

-- The post queue + history. 'scheduled' rows with scheduled_at <= now() are
-- published by /api/cron/linkedin-posts; 'posted'/'failed' stay as history.
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_created ON linkedin_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_due ON linkedin_posts (status, scheduled_at);
