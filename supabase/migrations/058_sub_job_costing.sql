-- ===== 058_sub_job_costing.sql =====
-- A subcontractor running their own job needs to see whether they're MAKING
-- money, not just what they quoted. Materials already come from
-- material_purchases and hours from time_entries, but there was no rate to
-- turn hours into a labor cost. Optional per-project hourly rate (0 = unset,
-- in which case the UI shows hours only and leaves labor out of the cost).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS labor_rate numeric(12, 2) NOT NULL DEFAULT 0;
