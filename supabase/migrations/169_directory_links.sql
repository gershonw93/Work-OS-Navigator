-- 169: A sub is one real company, and each GC's Directory entry LINKS to it.
--
-- The owner's decision (Nov 24, 2026, docs/sub-company-plan.md). Until now a
-- GC's subcontract named the GC's own Directory row, and an invited sub was
-- put INSIDE that row - so he was a guest in one GC's address book, a second
-- GC's invite was refused because he already belonged to the first, and a sub
-- who had signed up as his own business could not be invited at all (21 such
-- companies, one of them holding a single subcontract).
--
-- Now the Directory row stays the GC's record of the vendor, and points at the
-- sub's own company. The sub reaches the GC's job through the subcontract on
-- that row, across the link (lib/sub-companies.ts). Nobody's profile moves to
-- make a link, and nothing ever links on a matching name or address - only an
-- invite the person accepted.
--
-- ADDITIVE ONLY: the code running in production reads none of these columns.

-- The sub's own company. SET NULL both ways round: the sub closing his account
-- leaves the GC's row and its paid bills alone; the GC's row going never
-- touches the sub.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linked_company_id uuid
  REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linked_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linked_by uuid
  REFERENCES profiles (id) ON DELETE SET NULL;

-- A row cannot be linked to itself (the same shape as companies_added_by_not_self).
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_linked_not_self;
ALTER TABLE companies ADD CONSTRAINT companies_linked_not_self
  CHECK (linked_company_id IS DISTINCT FROM id);

-- One entry per GC per linked company: two entries for one business in one
-- GC's book is two places for one fact.
CREATE UNIQUE INDEX IF NOT EXISTS companies_one_link_per_gc
  ON companies (added_by_company_id, linked_company_id)
  WHERE linked_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_linked_company_id_idx
  ON companies (linked_company_id) WHERE linked_company_id IS NOT NULL;

-- THE LIGHT ACCOUNT. A sub invited by a GC gets his own company at once, so a
-- second GC can link to it and nothing ever has to move - but he did not ask
-- to run a business in SyteNav, so it starts limited to the GC work: no
-- customers of his own and no jobs of his own until he chooses "Run your own
-- jobs" (`upgraded_at`). Default false: every company that exists today is
-- whatever it already was.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS invited_only boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS upgraded_at timestamptz;

-- WHO THE INVITE WAS FOR, remembered on the row. /api/invite already takes an
-- `audience`; the accept route had to guess it from the target company. Null
-- on old rows, which accept still infers the old way.
ALTER TABLE company_invites ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE company_invites DROP CONSTRAINT IF EXISTS company_invites_audience_check;
ALTER TABLE company_invites ADD CONSTRAINT company_invites_audience_check
  CHECK (audience IS NULL OR audience IN ('team', 'vendor'));
-- When a vendor invite was answered, and how. 'declined' is a status now.
ALTER TABLE company_invites ADD COLUMN IF NOT EXISTS answered_at timestamptz;
