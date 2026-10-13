-- Personal tokens for the SyteNav MCP server (/api/mcp), so Claude can read a
-- person's jobs with exactly that person's permissions.
--
-- WHY A TABLE AND NOT `profiles.calendar_token`'s shape: a person may connect
-- more than one client (Claude Desktop on the office machine, Claude Code on a
-- laptop) and must be able to cut one off without the other. Each row is one
-- connection, named by the person who made it.
--
-- ONLY THE HASH IS STORED. The token is shown once, at creation; a database
-- read cannot hand anybody a working credential. `token_prefix` is the first
-- few characters, kept so the screen can tell two tokens apart.
--
-- REVOKED, NOT DELETED: `revoked_at` keeps the record of a connection that
-- existed, which is the question that arrives after something odd happened.
--
-- CASCADE on the profile: a token is a fact about one person's access and
-- nothing else. A deleted account's tokens must stop working with it.
--
-- RLS on with no policies: only the service role (the routes) reads this.

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  token_prefix  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_profile ON mcp_tokens (profile_id);

ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
