-- MORE THAN ONE PERSON ON A TASK, AND A RECORD OF WHO FINISHED IT.
--
-- Asked for together, and they are the same subject: the moment a task can
-- have three people on it, "completed" stops meaning "the assignee did it"
-- and starts needing a name against it.
--
-- ONE TASK, N PEOPLE. Not one task per person - a punch item is one thing to
-- be done, and splitting it would make "is it done" three questions. Any
-- assignee can complete it; `completed_by` records which one did. Where a
-- SPECIFIC person has to put their name to it, that is the signoff flow
-- (`signoff_requested_at` / `signoff_signed_by`), which already exists and is
-- a different act.

-- ── Who is on a task ────────────────────────────────────────────────────────
--
-- THE ONE HOME for that fact. `project_tasks.assigned_to_*` were the home
-- before this and are backfilled below; app code stops reading them.
--
-- The three shapes mirror what a single assignee could already be: somebody on
-- the job roster, a whole company (a sub), or a bare name typed in for
-- somebody with no account - 104 of the 134 live tasks are that last kind, so
-- it is the common case and not an edge.
CREATE TABLE IF NOT EXISTS project_task_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,

  -- CASCADE on the task, SET NULL on the person: an assignment is a fact
  -- about that task alone and goes with it, but a record of who was on a job
  -- has to outlive their removal from the roster - which is exactly when
  -- somebody asks who was supposed to do this. `name` is kept alongside for
  -- that reason, so the row still answers after the id is gone.
  member_id UUID REFERENCES project_team_members (id) ON DELETE SET NULL,
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  name TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON project_task_assignees (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_member ON project_task_assignees (member_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_company ON project_task_assignees (company_id);

-- THE SAME PERSON MUST NOT BE ADDED TWICE. Three partial indexes rather than
-- one constraint, because the three shapes are distinct and NULL never equals
-- NULL - a plain UNIQUE across all four columns would happily take the same
-- name twice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_assignee_member
  ON project_task_assignees (task_id, member_id) WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_assignee_company
  ON project_task_assignees (task_id, company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_assignee_name
  ON project_task_assignees (task_id, lower(btrim(name)))
  WHERE member_id IS NULL AND company_id IS NULL AND btrim(coalesce(name, '')) <> '';

ALTER TABLE project_task_assignees ENABLE ROW LEVEL SECURITY;

-- ── Who finished it ─────────────────────────────────────────────────────────
--
-- `completed_at` has been written since the status move started deriving it,
-- but nothing has ever recorded WHO - so a finished task knew when and not by
-- whom, which is unanswerable a month later and is the whole point of asking.
--
-- SET NULL on the profile and a name kept beside it, for the same reason as
-- above: the record has to outlive the account, and that is exactly when the
-- question arrives.
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles (id) ON DELETE SET NULL;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS completed_by_name TEXT;

-- ── Backfill, so nothing that is assigned today becomes unassigned ──────────
--
-- Idempotent: the WHERE NOT EXISTS makes a re-run a no-op rather than a
-- duplicate. Only rows that actually name somebody are copied - a task with
-- all three columns null was never assigned and must not gain an empty row.
INSERT INTO project_task_assignees (task_id, member_id, company_id, name)
SELECT t.id, t.assigned_to_member_id, t.assigned_to_company_id, NULLIF(btrim(t.assigned_to_name), '')
FROM project_tasks t
WHERE (t.assigned_to_member_id IS NOT NULL
    OR t.assigned_to_company_id IS NOT NULL
    OR NULLIF(btrim(t.assigned_to_name), '') IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM project_task_assignees a WHERE a.task_id = t.id);

-- `assigned_to_*` are deliberately LEFT ON THE TABLE and simply stop being
-- read. Dropping a column in the same change that stops using it means a
-- rollback of the deploy meets a schema that cannot serve the old code.
