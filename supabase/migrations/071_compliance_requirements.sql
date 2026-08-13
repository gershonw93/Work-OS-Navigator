-- ===== 071_compliance_requirements.sql =====
-- Which compliance documents a given vendor actually has to produce.
--
-- Until now this was hardcoded off the company type: a supplier needed a W-9,
-- everyone else needed COI + license + W-9 + workers' comp. Real vendors do not
-- fit that. A one-man sub with no employees has no workers' comp to give, and a
-- trade that is not licensed in the state has no license - and both sat as
-- "Missing" forever, dragging the job's compliance status red over a document
-- that was never coming.
--
-- A row here overrides the default for one document type. project_id NULL means
-- "this vendor, on every job"; set means just that job, and wins over the
-- company-wide row.

CREATE TABLE IF NOT EXISTS compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  type text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  /** Why it was waived - "no employees", "not licensed in NJ". */
  note text,
  updated_by uuid REFERENCES profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per vendor+type company-wide, and one per vendor+type per job.
-- Partial indexes because NULL project_id would not otherwise collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_req_company
  ON compliance_requirements (company_id, type) WHERE project_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_req_project
  ON compliance_requirements (company_id, project_id, type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compliance_req_company ON compliance_requirements (company_id);
