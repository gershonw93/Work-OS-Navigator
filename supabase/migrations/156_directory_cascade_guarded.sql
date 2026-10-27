-- 156: A GC's Directory goes with the GC - and nothing that is not the GC's
-- goes with it.
--
-- The owner's decision (Oct 27, 2026): deleting a company deletes the
-- Directory entries in its book (companies.added_by_company_id ON DELETE
-- CASCADE), instead of leaving them owner-less - an owner-less entry looks
-- exactly like a business with its own account (20 such rows today).
--
-- A plain cascade was checked against production first and would have
-- destroyed things that belong to somebody else, because a Directory entry is
-- not only the GC's record:
--   - 5 people sign in UNDER a GC's Directory entry (invited before they had
--     an account), and profiles.company_id is ON DELETE CASCADE.
--   - 3 subcontracts on OTHER companies' jobs name a GC's entry (left by the
--     award route's old name match, fixed in #659), and subcontracts cascade
--     into the sub's bills, pay apps and schedule lines.
-- So the cascade ships with a guard that runs on EVERY door that deletes a
-- company - the app, the platform console or raw SQL - and refuses, naming
-- why, rather than taking either of those with it. A cascade fires the guard
-- for each entry it removes, so deleting a GC whose book holds such an entry
-- is refused as a whole.

CREATE OR REPLACE FUNCTION companies_delete_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only a Directory entry is guarded. A company deleting itself takes its own
  -- staff with it; that is what deleting an account means.
  IF OLD.added_by_company_id IS NULL THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE company_id = OLD.id) THEN
    RAISE EXCEPTION 'Directory entry % has people signed in under it; deleting it would delete their accounts', OLD.id
      USING ERRCODE = 'P0001', HINT = 'directory_entry_has_people';
  END IF;
  IF EXISTS (
    SELECT 1 FROM subcontracts s JOIN projects p ON p.id = s.project_id
     WHERE s.company_id = OLD.id
       AND OLD.added_by_company_id IS DISTINCT FROM p.gc_company_id
       AND OLD.added_by_company_id IS DISTINCT FROM p.created_by_company_id
  ) OR EXISTS (
    SELECT 1 FROM compliance_documents d JOIN projects p ON p.id = d.project_id
     WHERE d.company_id = OLD.id
       AND OLD.added_by_company_id IS DISTINCT FROM p.gc_company_id
       AND OLD.added_by_company_id IS DISTINCT FROM p.created_by_company_id
  ) THEN
    RAISE EXCEPTION 'Directory entry % is named on another company''s job; deleting it would delete their records', OLD.id
      USING ERRCODE = 'P0001', HINT = 'directory_entry_on_other_job';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_companies_delete_guard ON companies;
CREATE TRIGGER trg_companies_delete_guard
  BEFORE DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_delete_guard();

-- The guard first, then the cascade it protects.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_added_by_company_id_fkey;
ALTER TABLE companies
  ADD CONSTRAINT companies_added_by_company_id_fkey
  FOREIGN KEY (added_by_company_id) REFERENCES companies (id) ON DELETE CASCADE;
