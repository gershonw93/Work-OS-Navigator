-- Sign in with SyteNav, for Claude: OAuth 2.1 for the MCP server (/api/mcp).
--
-- Phase 1 needed a token pasted into a config file. This lets somebody add
-- SyteNav in Claude by URL: Claude registers itself (oauth_clients), sends the
-- person to SyteNav's Allow page, gets back a one-time code (oauth_codes), and
-- swaps it for a token. THE TOKEN IS AN mcp_tokens ROW, the same kind Phase 1
-- makes - so it reads with the same permissions, shows on the same Settings
-- card and is revoked by the same button. A login is a second way to MINT a
-- connection, not a second kind of connection.
--
-- ONLY HASHES ARE STORED - client secrets, codes, access and refresh tokens.
--
-- oauth_clients is written by an unauthenticated endpoint (that is what dynamic
-- client registration is), so it holds nothing but what a client says about
-- itself; it grants nothing until a signed-in person presses Allow.
--
-- CASCADE throughout: a code or a token is a fact about one person's access to
-- one client and means nothing once either is gone.
--
-- RLS on with no policies: only the service role (the routes) reads these.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id                   text PRIMARY KEY,
  client_secret_hash          text,
  client_name                 text,
  redirect_uris               text[] NOT NULL,
  token_endpoint_auth_method  text NOT NULL DEFAULT 'none',
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_created ON oauth_clients (created_at);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash       text PRIMARY KEY,
  client_id       text NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  resource        text,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- A token minted by a login expires (an hour) and is renewed with a refresh
-- token (rotated on every use, good for 90 days of not being used). A personal
-- token from Phase 1 has neither: NULL means it does not expire.
ALTER TABLE mcp_tokens
  ADD COLUMN IF NOT EXISTS oauth_client_id     text REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expires_at          timestamptz,
  ADD COLUMN IF NOT EXISTS refresh_hash        text UNIQUE,
  ADD COLUMN IF NOT EXISTS refresh_expires_at  timestamptz;

ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes ENABLE ROW LEVEL SECURITY;
