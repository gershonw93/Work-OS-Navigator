-- Link a budget line to a subcontract so its Committed/Actual auto-populate:
--   committed = subcontract contract amount
--   actual    = sum of that subcontract's paid invoices
-- When subcontract_id is null, the stored committed_amount/actual_amount are used.

ALTER TABLE budget_line_items
  ADD COLUMN subcontract_id UUID REFERENCES subcontracts (id) ON DELETE SET NULL;

CREATE INDEX idx_budget_line_items_subcontract_id ON budget_line_items (subcontract_id);
