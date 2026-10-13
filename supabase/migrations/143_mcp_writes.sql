-- Claude can ADD records, with permission asked for separately (phase 3).
--
-- READING AND WRITING ARE DIFFERENT CONSENTS. Every connection made before
-- this said, on its own Allow page, "it cannot change anything in SyteNav" -
-- so `can_write` defaults FALSE and no existing connection gains a power it
-- was never given. A person turns it on: a tick on the Allow page, a tick when
-- making a token, or the switch on the Settings card.
--
-- `mcp_actions` is two things at once:
--   - THE RECORD. Every write Claude makes, with the person and the connection
--     it came through - "who entered this bill" is the question that arrives
--     six weeks later, and the activity feed only covers project records.
--   - THE GATE against a retried call creating a second copy. A model that did
--     not see the answer will ask again; the same tool with the same arguments
--     on the same day hands back the first result instead of a duplicate bill.
--     The unique index is the claim, written BEFORE the record is created.
--
-- SET NULL on the token and the profile: the record has to outlive the
-- connection being revoked and the account being deleted, which is exactly
-- when somebody asks who made it.

ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS can_write boolean NOT NULL DEFAULT false;
ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS can_write boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS mcp_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id         uuid REFERENCES mcp_tokens (id) ON DELETE SET NULL,
  profile_id       uuid REFERENCES profiles (id) ON DELETE SET NULL,
  tool             text NOT NULL,
  idempotency_key  text NOT NULL UNIQUE,
  project_id       uuid,
  record_id        text,
  result           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_actions_profile ON mcp_actions (profile_id, created_at DESC);

ALTER TABLE mcp_actions ENABLE ROW LEVEL SECURITY;
