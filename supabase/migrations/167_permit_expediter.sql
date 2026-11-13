-- 167: a permit can go through an expediter, and a lot survey has a home.
--
-- "you email the expediter the files and they reply back with what needs to
-- change ... once they hit ready for submitting it goes to the next permit
-- field". The expediter files with the DOB on the GC's behalf, so the
-- back-and-forth is still the permit's own rounds - only the address changes.
--
-- WHO is one column. Whether they are HIRED is not a column at all: it is
-- whether the job has a subcontract with that company, which is also the row
-- that carries their fee into Budget, their bills and QuickBooks. A second
-- "hired_on" here would be a second home for that fact.
ALTER TABLE permits ADD COLUMN IF NOT EXISTS expediter_company_id uuid
  REFERENCES companies (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS permits_expediter_company_id_idx ON permits (expediter_company_id);

-- The land survey of the lot is a drawing, and every party asks for it with
-- the plans: a Plans tab type rather than a new place to keep files.
ALTER TABLE project_plans DROP CONSTRAINT IF EXISTS project_plans_plan_type_check;
ALTER TABLE project_plans ADD CONSTRAINT project_plans_plan_type_check
  CHECK (plan_type IN ('architectural', 'structural', 'mep', 'civil', 'landscape', 'survey', 'other'));
