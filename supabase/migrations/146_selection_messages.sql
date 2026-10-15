-- Questions on a selection, between the client (on their portal link) and the
-- GC (on the Selections board). One thread per selection.
--
-- `side` says who wrote it; the client has no account, so `author_id` is only
-- ever set for the GC side, and the client's name is whatever they typed on
-- their link (or the job's client name).
--
-- ON DELETE CASCADE on the selection and the project: a question about a
-- selection that no longer exists is a fact about nothing. SET NULL on the
-- author: the conversation outlives the account that wrote half of it.
CREATE TABLE IF NOT EXISTS selection_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id  uuid NOT NULL REFERENCES project_selections (id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  side          text NOT NULL CHECK (side IN ('client', 'gc')),
  author_id     uuid REFERENCES profiles (id) ON DELETE SET NULL,
  author_name   text,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_messages_selection ON selection_messages (selection_id, created_at);
CREATE INDEX IF NOT EXISTS idx_selection_messages_project_client ON selection_messages (project_id, created_at) WHERE side = 'client';

ALTER TABLE selection_messages ENABLE ROW LEVEL SECURITY;
