-- A sub saying their trade is running late, as a REPORT the GC decides on.
--
-- A delay moves dates, and through the links it moves the trades after it and
-- emails them. That is the GC's call - "a cascade is arithmetic; telling
-- somebody is a decision" - so a sub does not move anything. They say how many
-- days and why; the GC opens the same delay screen every other delay goes
-- through, pre-filled with what the sub said, and applies or dismisses it.
--
-- `pending` is where a report starts, and only the apply or the dismiss moves
-- it - each written by the code that does that act. One open report per line:
-- a second while the first is waiting is a correction to it, so the route
-- replaces rather than piling up two numbers for the GC to choose between.
--
-- CASCADE from the line and the job: a report about a line that no longer
-- exists is about nothing. The people are SET NULL with their names beside
-- them, because the record outlives the accounts.

CREATE TABLE IF NOT EXISTS schedule_delay_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  schedule_item_id uuid NOT NULL REFERENCES schedule_items (id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 365),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 4),
  reported_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  reported_by_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'dismissed')),
  decided_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_delay_reports_project ON schedule_delay_reports (project_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_delay_reports_open
  ON schedule_delay_reports (schedule_item_id) WHERE status = 'pending';
ALTER TABLE schedule_delay_reports ENABLE ROW LEVEL SECURITY;
