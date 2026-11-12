-- 166: Project Management - a PRIVATE board per person, per job.
--
-- Every row is keyed on `owner_id`, the profile it belongs to. Nothing here is
-- company data: two people on one job each have their own columns and cards,
-- and no role, admin included, reads another person's. The routes run on the
-- service role and filter every query on the caller's own id
-- (lib/project-management-server.ts, pinned in project-management.ts).
--
-- Service role only: RLS on, no policies. So the anon and authenticated keys
-- cannot read these tables at all, whatever a route does.
--
-- Both foreign keys CASCADE: a board is a fact about one person on one job and
-- means nothing once either is gone.
--
-- `position` is an INTEGER, not numeric - PostgREST quotes numerics.
-- `completed_at` is written by the route when a card moves into a column
-- marked `is_done`, never taken from a request.

CREATE TABLE IF NOT EXISTS pm_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  is_done     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One name per board. Also the gate that stops two first visits seeding the
-- starter columns twice: the second insert fails whole and re-reads.
CREATE UNIQUE INDEX IF NOT EXISTS pm_columns_name_uniq ON pm_columns (owner_id, project_id, lower(name));

CREATE TABLE IF NOT EXISTS pm_cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  column_id     uuid NOT NULL REFERENCES pm_columns (id) ON DELETE CASCADE,
  title         text NOT NULL,
  notes         text,
  due_date      date,
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  labels        jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist     jsonb NOT NULL DEFAULT '[]'::jsonb,
  link_type     text,
  link_id       uuid,
  link_label    text,
  position      integer NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_cards_board_idx ON pm_cards (owner_id, project_id);
CREATE INDEX IF NOT EXISTS pm_cards_due_idx ON pm_cards (owner_id, due_date);

ALTER TABLE pm_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_cards ENABLE ROW LEVEL SECURITY;
