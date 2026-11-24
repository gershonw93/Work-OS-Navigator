# Sub company login + dispatch: decision 0 and the migration plan

Status: **PROPOSED, waiting for the owner.** Nothing in this file has been
applied. Section 6 of the spec (security prerequisites) shipped first, as the
spec asked; this is the plan for everything after it.

## What is true today (read from the live database, 2026-11-24)

| | companies | with people | holding a subcontract | owning jobs |
| --- | ---: | ---: | ---: | ---: |
| Subcontractor, signed up as its own company | 21 | 5 | **1** | 4 |
| Subcontractor, a row in some GC's Directory | 73 | 2 | 58 | 1 |
| Supplier, own company | 4 | 0 | 0 | 0 |
| Supplier, Directory row | 11 | 0 | 2 | 0 |

So the two halves of a sub's life never meet. The 58 subcontracts GCs have
written hang off **Directory rows** (`companies.added_by_company_id = <GC>`),
and a sub who signed up as his own business holds, in all but one case, none of
them. That is the whole of symptom 1:

- **Owner first, then a GC invite.** `/api/invite` (vendor) points
  `company_invites.company_id` at the GC's Directory row. On accept,
  `inviteMove` refuses because the person already has a company, and the invite
  sits pending for ever. Live: 1 such invite.
- **Invite first.** He has no company, so accept puts his profile INSIDE the
  GC's Directory row as `read_only`. He is now a guest in the GC's address book,
  not a business. Live: 2 people.
- **A second GC.** Its invite targets a different Directory row; he already
  belongs to the first one; refused. Always.

## Decision 0, as proposed

One real company per sub. Each GC's Directory row LINKS to it. Jobs stay
GC-owned; the sub reaches a GC job through the subcontract on that GC's
Directory row, followed across the link. Nothing is ever merged by name or
email. No multi-company membership (nobody has asked for one person holding
roles in two businesses yet).

### Schema (one additive migration, safe for the code running in production)

```sql
-- 169_directory_links.sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS linked_company_id uuid
    REFERENCES companies (id) ON DELETE SET NULL;   -- the sub's own company
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS linked_by uuid
    REFERENCES profiles (id) ON DELETE SET NULL;    -- who accepted the link

-- One Directory entry per GC per linked company: a second entry for the same
-- business in one GC's book is two places for one fact.
CREATE UNIQUE INDEX IF NOT EXISTS companies_one_link_per_gc
  ON companies (added_by_company_id, linked_company_id)
  WHERE linked_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_linked_company_id
  ON companies (linked_company_id) WHERE linked_company_id IS NOT NULL;
```

- **Why a column and not a link table:** a Directory row is already exactly one
  GC's record of one vendor. The link is a fact about that row, and the unique
  index gives "any number of GCs" for free (one row per GC).
- **`ON DELETE SET NULL`** both ways: the sub deleting his company leaves the
  GC's Directory row and its paid bills intact (migration 156's delete guard
  still applies); the GC deleting its row never touches the sub.
- **Not a `profiles` change.** Nobody's `company_id` moves. That is what makes
  the invite safe on every password reset (`invite/accept` runs on all of them).
- **The sub's company gets no `company_billing` row**, same as today: a sub is
  unmetered, per the billing rules in CLAUDE.md.

Current production code ignores the new columns, so the migration can be
applied before the code that reads them, per the "a migration is not staged"
rule.

### Code that has to follow the link (one reader, not twelve)

A new `lib/sub-companies.ts`: `subcontractCompanyIds(db, companyId)` returns the
caller's company plus every Directory row linked to it. Every place that today
asks "does a subcontract on this job carry MY company id" asks it instead:

- `lib/job-side.ts` (the `sub` side, and so `requirePermission` and `jobGate`)
- `lib/rfi-access.ts`, `lib/writes/compliance-access.ts`, `lib/writes/compliance-document.ts`
- `lib/calendar-load.ts` (a sub's won GC jobs on the calendar and the feed)
- `app/api/my-jobs/**` (the job list, a job, a delay report)
- `app/api/projects/[id]/invoices/route.ts` (a sub's own bill), lien waiver, subcontract billing
- `app/api/approvals`, `app/api/dashboard/activity`, `app/api/directory/[companyId]`
- notifications to "everybody at the awarded sub" (bid award, quote award, task
  assignment): `profiles.company_id` in that same set

A pin will walk `app/` and `lib/` for `from('subcontracts')` filtered on
`company_id` and require it to go through the reader, so the thirteenth does not
get written the old way.

### The invite, rewritten (spec item 1)

`POST /api/invite/accept`, vendor audience:

1. The person already has a company of type `subcontractor`/`supplier`: set the
   Directory row's `linked_company_id` to it (refuse if THAT GC already links
   another row to it - the unique index), stamp `linked_at`/`linked_by`, mark
   the invite accepted. **The profile is not touched.**
2. The person has no company yet: create his own company (name copied from the
   Directory row, type from it, no billing row), make him its admin, then link
   as in 1. He gets a business, not a guest seat in the GC's address book.
3. The person belongs to a GC (type `gc`): refuse and say so. A GC working as
   somebody else's sub is real, but it is a decision about multi-company, not a
   side effect of an invite.

Only an invite the person accepts creates a link. Nothing links on a matching
name or a matching address.

**Open question for the owner:** the 2 people already sitting inside a GC's
Directory row. Proposed: leave them working exactly as today (their
`company_id` IS the row, which the reader already includes) and offer a
"Make this your own company" step later. Moving them silently is the merge the
spec forbids.

## Spec 3-5, once 0 is decided (not started)

- `service_calls`: `company_id` (the sub's, CASCADE), customer, site address
  (through `lib/project-site.ts`'s rules), contact, issue, priority, status
  (`new | scheduled | en_route | on_site | done | invoiced`), `source`
  (`direct | gc_job`), `gc_project_id` (nullable, SET NULL), notes, photos.
  A GC reads a linked call through ONE narrow route returning status and dates
  only - never the sub's price or the sub's customer.
- `service_call_assignments`: call, crew profile, start/end, so the board can
  show conflicts. Assigning notifies through `notify()` with a new catalog type
  (`service_call_assigned`), so it can be switched off and rehearsed on the demo
  board.
- Crew field mode: assigned calls only, the existing punch with GPS
  (`lib/punch-location.ts`), done collects notes through the same blank-record
  guard as a daily log.

## What shipped already (spec 6, and the server half of spec 2)

See the commit. In short: every route under `/api/projects/<id>/` now asks
whether the caller is on that job, a sub gets only the menu's eight tabs on a GC
job, crew reach only their assigned jobs, and the award / bid-invite / lien
waiver / billing / log review / quote routes check the record as well as the
role. Pinned in `lib/__tests__/job-lane.ts`, mutation-checked.
