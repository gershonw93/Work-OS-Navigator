-- ===== 062_soft_costs.sql =====
-- Every budget category today is a trade (Plumbing, Framing, Concrete), so
-- there was nowhere to record the costs a GC carries before and around the
-- physical work: plans, permit fees, builders risk, survey, loan interest,
-- contingency. Those are soft costs, and they belong in the same budget so
-- the job total is the real total.
--
-- 'hard' is the default so every existing line keeps its current meaning.

ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'hard';

ALTER TABLE budget_template_items
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'hard';

CREATE INDEX IF NOT EXISTS idx_budget_line_items_cost_type
  ON budget_line_items (project_id, cost_type);
