-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A DATE MOVED, AND WHAT IT USED TO BE.
--
-- Reported as a question with two halves: "How do I currently delay a sub? And
-- will it actually push off anyone dependent?" The second half is answered.
-- The first was not: you delay a sub by opening the line and typing a later end
-- date, and NOTHING records that it was a delay, why, or what the dates were
-- before. A slip, a correction and a pull-forward are indistinguishable the
-- moment the dialog closes.
--
-- WHY A TABLE AND NOT A baseline_start / baseline_end PAIR ON schedule_items.
-- Two columns would be null on almost every row, would answer only the NET
-- question, and a SECOND delay would overwrite the first - so "why has this
-- moved three times" would have no answer, which is exactly the question a
-- three-times-moved line provokes. This is append-only; `baselineOf` reads the
-- OLDEST row's `from` pair and falls back to the line's own dates.
--
-- AND schedule_shift_notices CANNOT SERVE AS THIS LOG, though it looks
-- adjacent. It is written only when a moved line has a subcontract WITH a
-- company on it - so a milestone, a placeholder, or a line whose sub has no
-- company record writes nothing at all, and the history would be incomplete by
-- construction rather than by accident. Two names near each other is the smell;
-- what WRITES the table is the question.
--
-- NO shift_days COLUMN. It is daysBetween(from_start, to_start). A stored copy
-- of arithmetic goes stale silently on the first edit that does not update it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schedule_date_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- CASCADE: the row is a fact about this job alone.
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

  -- CASCADE: this row records a LINE's movement and is unreadable without the
  -- line. Deliberately unlike demo_notification_log, which is SET NULL because
  -- it is evidence that a real person was contacted and the question arrives
  -- after the account is gone. That obligation here is already carried by
  -- schedule_shift_notices, which keeps its own SET NULL. This table is the
  -- PLAN's history, not the CONTACT record.
  schedule_item_id UUID NOT NULL REFERENCES schedule_items (id) ON DELETE CASCADE,

  -- WHAT KIND OF MOVE THIS WAS. The whole point of the feature: without this a
  -- slip and a re-plan are one shape.
  --   delay    somebody says the work is running late
  --   replan   somebody decided differently; no blame, no reason required
  --   cascade  a consequence - something upstream moved and this followed
  kind TEXT NOT NULL CHECK (kind IN ('delay', 'replan', 'cascade')),
  reason TEXT,

  from_start DATE NOT NULL,
  from_end   DATE NOT NULL,
  to_start   DATE NOT NULL,
  to_end     DATE NOT NULL,

  -- SET NULL: the row still reads without it ("something upstream moved"), and
  -- the line it names can be deleted on its own.
  caused_by_item_id UUID REFERENCES schedule_items (id) ON DELETE SET NULL,

  -- SET NULL: a record of work outlives the attribution, matching
  -- schedule_dependencies.created_by and schedule_shift_notices.sent_by.
  changed_by UUID REFERENCES profiles (id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A DELAY WITH NO REASON IS THE THING THIS EXISTS TO PREVENT. Six weeks later
  -- "it moved four days" is not an answer; "the concrete truck no-showed" is.
  -- A replan carries no such obligation - deciding differently needs no excuse.
  CONSTRAINT schedule_date_changes_delay_has_reason
    CHECK (kind <> 'delay' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_schedule_date_changes_item
  ON schedule_date_changes (schedule_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_schedule_date_changes_project
  ON schedule_date_changes (project_id);

-- RLS on with NO policy, the same shape as schedule_dependencies and
-- schedule_shift_notices: reached only through the service-role client in the
-- API routes, which gate on `schedule` permissions before they read or write.
ALTER TABLE schedule_date_changes ENABLE ROW LEVEL SECURITY;
