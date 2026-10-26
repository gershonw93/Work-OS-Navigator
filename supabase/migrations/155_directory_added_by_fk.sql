-- 155: Directory ownership gets the constraint it never had.
--
-- companies.added_by_company_id is what makes a Directory entry a GC's (its
-- private record ABOUT a sub or supplier), and every fence in the app reads it
-- - Directory edits, vendor invites, award and store matching. It was added by
-- hand, outside any migration. It had no index and no not-self check; it DID
-- have a foreign key, which no migration file showed (see below).
-- Step 1 of docs/proposals/sub-company-link.md, the groundwork for linking a
-- GC's entry to the sub's real company. Additive; no row changes.
--
-- Checked on production before writing (Oct 26, 2026): no orphaned values and
-- no row pointing at itself, so the constraint applies without touching data.

-- Declared here so a fresh environment has it; a no-op where it exists.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS added_by_company_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_added_by_company_id_fkey') THEN
    -- SET NULL, to match production. This constraint turned out to EXIST
    -- already on the live database (added by hand, like the column), so the
    -- guard skipped it when 155 ran and production kept SET NULL. A fresh
    -- environment gets the same rule rather than a different one. Whether it
    -- should be CASCADE is an open question: SET NULL leaves a deleted
    -- company's entries looking like businesses with their own account.
    ALTER TABLE companies
      ADD CONSTRAINT companies_added_by_company_id_fkey
      FOREIGN KEY (added_by_company_id) REFERENCES companies (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_added_by_not_self') THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_added_by_not_self CHECK (added_by_company_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_added_by ON companies (added_by_company_id);
