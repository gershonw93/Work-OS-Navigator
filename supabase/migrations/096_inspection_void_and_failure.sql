-- ─────────────────────────────────────────────────────────────────────────────
-- Inspections: void instead of delete, a reason for a failure, and a status
-- column that means something again.
--
-- WHY VOID. A tester found that anybody could permanently delete an inspection.
-- For a product sold on records that hold up in a dispute, a clerk one click
-- from losing a compliance record is the wrong shape. Nothing is hard-deleted
-- now: `status = 'void'`, the row kept, filtered at read time - which is what
-- client invoices already do, and their comment is the doctrine: "Not delete.
-- A client already has this document, so it stays in the list with its number,
-- greyed out."
--
-- `voided_at` / `voided_by` go beyond that precedent on purpose. For an invoice
-- the number and the ledger carry the history; for a compliance record, WHO
-- voided it is the audit fact, and a read-only banner should not have to query
-- the activity log to render.
--
-- WHY THE CHECK IS BACK. Migration 041 ended with
--
--     ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
--
-- and never added a replacement. The column has been unconstrained free text
-- ever since, which is how `not_scheduled` and `pending_reinspection` came to
-- work despite never being declared - and equally how a typo'd status would
-- insert silently and read as "nothing outstanding". Production holds only
-- passed / requested / scheduled, so this goes on VALID rather than NOT VALID.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  -- Not `notes`. That column already carries three different things: what the
  -- user typed, what the AI read off the inspector's card, and the text
  -- appended into the failure notification. A fourth meaning would make
  -- "what keeps failing" unanswerable.
  ADD COLUMN IF NOT EXISTS failure_reason text;

COMMENT ON COLUMN inspections.voided_at IS
  'When this was voided. Voided rows are kept and filtered at read time; nothing here is ever hard-deleted.';
COMMENT ON COLUMN inspections.voided_by IS
  'Who voided it. On a compliance record this is the audit fact, not a convenience.';
COMMENT ON COLUMN inspections.failure_reason IS
  'Why it failed, required when status becomes failed. Its own column so it can be reported on.';

ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_status_check;
ALTER TABLE inspections ADD CONSTRAINT inspections_status_check
  CHECK (status IN (
    'not_scheduled',
    'requested',
    'scheduled',
    'passed',
    'failed',
    'pending_reinspection',
    'void'
  ));

-- The working list reads open inspections constantly and now filters voided
-- rows out of every one of those reads.
CREATE INDEX IF NOT EXISTS idx_inspections_project_status
  ON inspections (project_id, status);
