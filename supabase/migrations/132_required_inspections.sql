-- Which inspections a job needs, decided up front, and the inspection types a
-- company uses beyond the built-in list.
--
-- A REQUIRED INSPECTION IS NOT AN `inspections` ROW. `not_scheduled` there
-- means "asked for, nobody booking it" - it counts as to-book, notifies the
-- schedulers and needs a date. A septic final six months out has been asked
-- for by nobody, so the list lives here and where each item stands is DERIVED
-- from the inspection rows of the same type (lib/inspection-types.ts).

CREATE TABLE IF NOT EXISTS project_required_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A fact about this job alone; it goes with the job.
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  -- 'manual' | 'model' - where the line came from, so a model update can find
  -- the lines it put there and leave hand-added ones alone.
  source text NOT NULL DEFAULT 'manual',
  -- Who added it outlives them.
  created_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_required_inspection_type
  ON project_required_inspections (project_id, lower(type));
ALTER TABLE project_required_inspections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inspection_type_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A company's own vocabulary; it goes with the company.
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspection_type_option
  ON inspection_type_options (company_id, lower(name));
ALTER TABLE inspection_type_options ENABLE ROW LEVEL SECURITY;
