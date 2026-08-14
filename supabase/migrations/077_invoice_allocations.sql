-- ===== 077_invoice_allocations.sql =====
-- One invoice, split across budget lines - at partial amounts.
--
-- Until now an invoice reached a budget line only through its SUBCONTRACT: the
-- line linked to that contract was where the money landed, and there was no way
-- to say otherwise. That is right for the common case (one sub, one trade, one
-- line) and wrong for the two that keep coming up:
--
--   * a supplier bill that crosses trades - lumber and windows on one invoice
--   * an invoice that only partly belongs to a line
--
-- So: allocations. An invoice may be split across as many lines as it needs,
-- each with its own amount.
--
-- SPLIT, NEVER OVERRIDE. This was the explicit instruction and the table shape
-- enforces it: there is no single budget_line_item_id on `invoices` that could
-- silently redirect a whole bill away from where its contract says it belongs.
-- An invoice either has allocations, which say exactly how it divides, or it
-- has none and falls back to its subcontract's line as before. Nothing is
-- migrated - every existing invoice keeps behaving exactly as it does today.
--
-- The rollup treats the two paths as mutually exclusive, so a bill cannot be
-- counted once through its allocations and again through its contract.

CREATE TABLE IF NOT EXISTS invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  budget_line_item_id uuid NOT NULL REFERENCES budget_line_items (id) ON DELETE CASCADE,
  /**
   * The slice of the invoice landing on this line. Does NOT have to add up to
   * the invoice total - a partly-allocated bill is a normal state, and the
   * remainder simply follows the old subcontract route.
   */
  amount numeric(15, 2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice
  ON invoice_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_allocations_line
  ON invoice_allocations (budget_line_item_id);

-- One row per line per invoice. Two slices of the same bill on the same line is
-- always a mistake, and it would make the totals impossible to reason about.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_allocation_line
  ON invoice_allocations (invoice_id, budget_line_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Markup per budget line.
--
-- The rate could only live on the project or on one invoice. Setting "permits
-- at cost, electrical at 15%" meant remembering to do it on every single
-- invoice as it arrived, forever. Now the LINE carries the answer and every
-- invoice landing on it follows, with the per-invoice override still winning
-- when one bill genuinely differs.
--
-- Precedence, most specific first:
--   invoice.markup_excluded / markup_pct  (this one bill)
--   line.markup_excluded / markup_pct     (this trade)
--   project.contractor_fee_pct            (the job)
--
-- NULL means "follow the level above". An explicit 0 means zero, and the two
-- are deliberately different: storing 0 for "unset" would stop the line
-- following a later change to the project rate.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS markup_pct numeric(6, 3);
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS markup_excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN budget_line_items.markup_pct IS
  'Cost-plus rate for this line, as a percent. NULL = follow the project rate.';
COMMENT ON COLUMN budget_line_items.markup_excluded IS
  'Everything on this line bills at cost, whatever the project rate says.';
