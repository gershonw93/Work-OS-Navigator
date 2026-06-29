-- The app uses richer company/contact types (supplier, inspector, worker, other)
-- in the Directory and elsewhere, but the original CHECK only allowed gc/subcontractor,
-- so saving those types errored. Expand it.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_type_check
  CHECK (type IN ('gc', 'subcontractor', 'supplier', 'inspector', 'worker', 'other'));
