-- ===== 051_pay_applications.sql =====
-- AIA-style Applications for Payment (G702 / G703) for commercial progress
-- billing and bank draws.
--
-- A pay_application is one billing period against a Schedule of Values.
--   subcontract_id IS NULL  -> the GC bills the owner/bank for the whole contract
--   subcontract_id IS SET   -> a subcontractor bills the GC for their scope
-- Each pay_application_line mirrors one G703 continuation-sheet row; the
-- "previous / this period / stored" columns are carried forward from prior
-- applications for the same schedule-of-values line.

CREATE TABLE IF NOT EXISTS pay_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  subcontract_id uuid REFERENCES subcontracts (id) ON DELETE CASCADE,
  application_number integer NOT NULL DEFAULT 1,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'certified', 'funded', 'rejected')),
  retainage_pct numeric(6, 3) NOT NULL DEFAULT 10,
  notes text,
  certified_by text,
  submitted_at timestamptz,
  certified_at timestamptz,
  funded_at timestamptz,
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_applications_project ON pay_applications (project_id);
CREATE INDEX IF NOT EXISTS idx_pay_applications_subcontract ON pay_applications (subcontract_id);

CREATE TABLE IF NOT EXISTS pay_application_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_application_id uuid NOT NULL REFERENCES pay_applications (id) ON DELETE CASCADE,
  budget_line_item_id uuid REFERENCES budget_line_items (id) ON DELETE SET NULL,
  cost_code text,
  description text NOT NULL DEFAULT '',
  scheduled_value numeric(14, 2) NOT NULL DEFAULT 0,
  previous_completed numeric(14, 2) NOT NULL DEFAULT 0,
  this_period numeric(14, 2) NOT NULL DEFAULT 0,
  materials_stored numeric(14, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pay_application_lines_app ON pay_application_lines (pay_application_id);
