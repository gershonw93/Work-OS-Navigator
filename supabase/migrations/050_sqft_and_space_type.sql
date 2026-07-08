-- ===== 050_sqft_and_space_type.sql =====
-- Track project square footage (interior under A/C, exterior under roof) and
-- let budget line items be classified interior/exterior so costs can be
-- broken down and totaled by space type.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS interior_sqft numeric(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exterior_sqft numeric(12,2);

ALTER TABLE budget_line_items ADD COLUMN IF NOT EXISTS space_type text CHECK (space_type IN ('interior', 'exterior'));
