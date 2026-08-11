

-- ===== 069_selection_options_and_ordering.sql =====
-- Selections, after watching someone actually use one.
--
-- Three things were missing.
--
-- 1. You cannot choose a paint color from a text label. A selection is a VISUAL
--    decision - a swatch, a photo, a link to the product page. Options carried a
--    name and a price and nothing to look at.
--
-- 2. "Vendor" was one free-text box doing two different jobs. The BRAND is the
--    client's business (Kohler costs more than the builder-grade one, and that
--    is the whole reason there is a choice). The SUPPLIER is yours, and it needs
--    to be a real contact from the Directory because that is who the order goes
--    to. Splitting them.
--
-- 3. A decision that is chosen and never ordered is still a decision nobody
--    acted on. Ordering now records who it went to, for how much, and against
--    which budget line.

-- What the client is looking at
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS color_hex text;
ALTER TABLE selection_options ADD COLUMN IF NOT EXISTS model_number text;

-- Who you buy it from. Free-text `vendor` stays as a fallback for a supplier
-- who was never added to the Directory.
ALTER TABLE selection_options
  ADD COLUMN IF NOT EXISTS vendor_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;

-- Ordering
ALTER TABLE project_selections
  ADD COLUMN IF NOT EXISTS supplier_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS expected_delivery date;
ALTER TABLE project_selections
  ADD COLUMN IF NOT EXISTS material_purchase_id uuid REFERENCES material_purchases (id) ON DELETE SET NULL;

-- A client asking to change something already ordered. Not a silent edit - it
-- is a request, and somebody has to answer it.
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS change_requested_at timestamptz;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS change_request_note text;

CREATE INDEX IF NOT EXISTS idx_project_selections_change_requested
  ON project_selections (project_id) WHERE change_requested_at IS NOT NULL;

-- A selection that goes over its allowance raises a change order. That change
-- order has to land on the SAME budget line the allowance came out of, or the
-- overage is real money floating free of the budget it belongs to.
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_change_orders_budget_line
  ON change_orders (budget_line_item_id) WHERE budget_line_item_id IS NOT NULL;

-- Where the client can go and look at the whole range. One link per selection,
-- not per option - "here is the color chart" is a single fact about the
-- category, and repeating it on every row would be noise.
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS reference_url text;
ALTER TABLE project_selections ADD COLUMN IF NOT EXISTS reference_label text;
