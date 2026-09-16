-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule dependencies: what waits for what, and what moves when one moves.
--
-- Three things a schedule line never carried:
--
--   trade              A line has only ever known its dates and, when a sub is
--                      awarded, a subcontract. A PLACEHOLDER ("sheetrock, dates
--                      TBD") has existed since 006 made subcontract_id nullable,
--                      but with nothing except free-text `label` it could not
--                      say what trade it was holding a slot for - so nothing
--                      could depend on it by name. The trade is the thing a
--                      dependency is really about, so it lives on the line.
--
--   progress_pct       NULLABLE ON PURPOSE, unlike budget_line_items.progress_pct
--                      which is NOT NULL DEFAULT 0. "Nobody has said how far
--                      along this is" and "it has not started" are different
--                      facts, and a progress GATE compared against a default
--                      zero stays shut for ever while looking like it works.
--                      NULL means unknown; the app falls back to the linked
--                      subcontract's budget lines and, failing that, says so.
--
--   dates_overridden_at
--                      Set when a human edits a cascaded line's dates by hand.
--                      Future cascades skip that line and REPORT the skip -
--                      moving somebody's deliberate date because an upstream
--                      trade slipped is how a schedule stops being believed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS trade TEXT;
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2);
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS dates_overridden_at TIMESTAMPTZ;

ALTER TABLE schedule_items DROP CONSTRAINT IF EXISTS schedule_items_progress_pct_range;
ALTER TABLE schedule_items ADD CONSTRAINT schedule_items_progress_pct_range
  CHECK (progress_pct IS NULL OR (progress_pct >= 0 AND progress_pct <= 100));

-- One row per "this line waits for that line".
--
-- It points at a LINE, not at a trade, which is what lets a trade have phases:
-- Electrical rough-in and Electrical finish are two lines, and "drywall follows
-- rough-in" names exactly one of them.
CREATE TABLE IF NOT EXISTS schedule_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

  -- Both sides CASCADE: a dependency is a fact about two lines and means
  -- nothing once either is gone. The UI warns and lists dependents before a
  -- delete; this is the floor under that, not a substitute for it.
  task_id             UUID NOT NULL REFERENCES schedule_items (id) ON DELETE CASCADE,
  predecessor_task_id UUID NOT NULL REFERENCES schedule_items (id) ON DELETE CASCADE,

  -- Null means "just the dates". A number means the predecessor must also be
  -- that far along before this line is considered free to start.
  min_predecessor_progress NUMERIC(5, 2),

  -- Clear days between the predecessor ending and this line starting.
  lag_days INTEGER NOT NULL DEFAULT 0,

  -- The person outlives the attribution, so SET NULL rather than CASCADE.
  created_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT schedule_dependencies_not_self CHECK (task_id <> predecessor_task_id),
  CONSTRAINT schedule_dependencies_progress_range
    CHECK (min_predecessor_progress IS NULL
           OR (min_predecessor_progress >= 0 AND min_predecessor_progress <= 100)),
  CONSTRAINT schedule_dependencies_lag_sane CHECK (lag_days >= 0 AND lag_days <= 365)
);

-- One link per pair. Without this a double-submit is two identical dependencies
-- and the cascade counts the same push twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_dependencies_pair
  ON schedule_dependencies (task_id, predecessor_task_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dependencies_project ON schedule_dependencies (project_id);
CREATE INDEX IF NOT EXISTS idx_schedule_dependencies_pred ON schedule_dependencies (predecessor_task_id);

-- Every email we sent a sub about their dates moving.
--
-- The spec asks for the send to be logged on the task. A row per send rather
-- than a timestamp on the line, because one line can move more than once and a
-- column that only remembers the last one cannot answer "did we tell them about
-- the September slip".
CREATE TABLE IF NOT EXISTS schedule_shift_notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  schedule_item_id UUID REFERENCES schedule_items (id) ON DELETE CASCADE,

  -- A record of what we told somebody outlives their company row.
  company_id UUID REFERENCES companies (id) ON DELETE SET NULL,
  sent_to TEXT NOT NULL,

  kind TEXT NOT NULL DEFAULT 'shift' CHECK (kind IN ('shift', 'unblocked')),
  old_start DATE, old_end DATE,
  new_start DATE, new_end DATE,
  reason TEXT,

  -- Null until a send is CONFIRMED. A default of now() would be the row
  -- claiming an email went out because somebody opened the review screen.
  sent_at TIMESTAMPTZ,
  send_error TEXT,

  sent_by UUID REFERENCES profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_shift_notices_item ON schedule_shift_notices (schedule_item_id);
CREATE INDEX IF NOT EXISTS idx_schedule_shift_notices_project ON schedule_shift_notices (project_id);

ALTER TABLE schedule_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_shift_notices ENABLE ROW LEVEL SECURITY;
