# One real sub company, linked from each GC's Directory (proposal)

Status (Oct 26, 2026): **the `directory_links` table design is APPROVED by the
owner; section 6 has SHIPPED (with migration 155, the FK). Steps 2-6 of the
build order are not built yet.** Still open: decisions 2 and 3 in section 5
(the sub's read-only bill history, and which compliance copies a GC keeps).

The decision this implements (the owner's, Oct 2026):

- A subcontractor is ONE real company. Its owner and crew stay in it.
- Each GC's Directory entry for that sub LINKS to it. The GC keeps its own
  entry - its private notes, its own spelling of the name, its contact
  overrides, its insurance status - and never writes to the sub's company.
- GC jobs stay GC-owned. A sub reaches a GC job through the specific
  subcontract (the engagement), never by becoming a member of the GC.
- Nothing is ever merged or overwritten because a NAME or an EMAIL matched.
- Multi-company memberships are a separate question, not part of this.

---

## 1. What the schema holds today (verified against the code and the live database)

### People and companies

| Thing | Where it lives | Notes |
|---|---|---|
| A person | `profiles` (id = auth user) | ONE `company_id`, NOT NULL, `ON DELETE CASCADE`. No memberships table. |
| A role | `profiles.role` + `permission_overrides` | Resolved by `actorForUser`; company type plays no part on the server. |
| A GC | `companies` row, `type = 'gc'` | Owns projects (`projects.gc_company_id`, `created_by_company_id`). |
| A sub's own account | `companies` row, `type = 'subcontractor'`, `added_by_company_id IS NULL` | Made by `complete-signup`. |
| A GC's Directory entry for a sub | `companies` row, `added_by_company_id = <GC>` | THE SAME TABLE as a real company. That is the root of the problem. |
| Pending team / vendor invite | `company_invites` (`company_id`, `email`, `role`, `status`) | For a vendor, `company_id` is the GC's Directory row. |

`companies.added_by_company_id` and `projects.created_by_company_id` are NOT in
any numbered migration (they were added by hand). On the live database the
column DID carry a foreign key, `ON DELETE SET NULL`, that no file recorded -
this doc first said it had none, which was read off the migration files rather
than the database. 155 added the missing index and a not-self check and kept
the SET NULL. **Consequence:** deleting a company leaves its Directory entries
with no owner, and an entry with no owner looks exactly like a business with
its own account. 20 vendor rows today have no owner, no people and no
subcontracts - almost certainly such orphans or legacy rows.

### How a sub's person gets into a company - three doors, all into the GC's row

1. **Vendor invite** (`/api/invite`, `audience: 'vendor'`): the invite names the
   GC's Directory row; `invite/accept` puts the person in it as `read_only`.
2. **Account from a bid link** (`/api/bid/[token]/account`): the person is
   upserted into the invite's company, or a GC Directory row matched by
   `contact_email`, or a new Directory row - always `read_only`, always inside
   the GC's book.
3. **Public signup** (`/api/complete-signup`): joins ANY company whose
   `contact_email` matches, across the whole table, as **admin**.
   `settings/route.ts` has the same fallback for a profile with no company
   (exact email, any company).

Doors 1-2 give the sub nobody who can administer anything. Door 3 can make a
stranger the admin of a GC's Directory row.

### What a sub's records point at

| Record | Column | Points at today | Live count |
|---|---|---|---|
| Subcontract | `subcontracts.company_id` (NOT NULL, CASCADE) | The GC's Directory row (124 of 126) | 126 |
| Sub bill | `invoices.company_id` (SET NULL) + `subcontract_id` | The Directory row | 120 on Directory rows |
| Compliance doc | `compliance_documents.company_id` (NOT NULL, CASCADE) | The Directory row | 85 on Directory rows, 0 on real sub companies |
| Bid invite | `bid_invites.vendor_company_id` (SET NULL) | Usually the Directory row | 79, 9 with no company |
| QuickBooks vendor | `quickbooks_vendor_links.vendor_company_id` | The Directory row, per QBO file | |
| Task assignee | `project_task_assignees.company_id` | The Directory row | |

**This is good news for the link.** Every GC-side record already points at
the GC's own entry. None of it has to move: the link is resolved at READ time
on the sub's side, and the GC's books, QuickBooks vendor ids and history stay
exactly where they are.

### Live data that rules out matching by name or email

From read-only counts on the production database (Oct 26, 2026):

- 107 vendor company rows: 82 Directory entries, 25 with no `added_by` (5 of
  them have people; 20 have nobody and are legacy).
- **12 vendor names appear in more than one company's book. 15 contact
  emails appear on more than one row.** Auto-linking on either would have
  joined the wrong businesses.
- 2 duplicate names inside a single GC's own book.
- 3 Directory entries were added by a company that is NOT a GC - a sub keeps
  a book of its own suppliers and sub-subs. So "GC" in `directory_links` means
  "the company whose book this entry is in", whatever its type, and a sub can
  sit on both ends of different links.
- The FK in step 1 applies cleanly: no orphaned and no self-referencing
  `added_by_company_id` today.
- 2 people sit inside a GC's Directory row today (invite-first case).
- 1 pending invite is stuck because its person already belongs to another
  company - the exact owner-first failure.

### Every code path that would have to follow a link

Found by a full sweep (file list in the PR). Grouped by what they ask:

- **"Is this sub on this job"** - `jobSide` (job-access.ts), `rfiSide`,
  `companyOnJob` (compliance), `my-jobs/[projectId]`, schedule delay reports.
  All compare `subcontracts.company_id = actor.companyId`.
- **"What is mine across jobs"** - `my-jobs`, `my-bids`
  (`bid_invites.vendor_company_id`), `approvals`, `dashboard/stats`,
  `dashboard/activity`, `directory` (GCs I work for), `canUseThread` (bid
  messages).
- **"Who at the sub gets told"** - award, sub-bill approved/sent/paid, bid
  invites and reminders, schedule shifts and unblocks, task assignment,
  compliance expiry. All `profiles.company_id = <vendor company>`.
- **Writes onto a vendor row** - Directory edit (already fenced to
  `added_by = me`), subcontract edit (fenced in #660), award backfill (fenced
  in #659).
- **Name/email matches still live** - complete-signup and settings (email,
  any company), material purchase (`ilike(name)` across all companies,
  unescaped), bid-account (email inside the GC's book - safe), MCP and search
  (inside the book - safe).

---

## 2. Proposed migration (summary - full SQL in `sub-company-link.sql`)

1. **`companies.added_by_company_id` gets its foreign key and index**
   (production already had this FK as `ON DELETE SET NULL`, unrecorded in any
   migration; 155 kept it and added the rest), with a guard that it never points at itself. Cheap and independent.
2. **`directory_links`** - one row per (GC Directory entry -> real sub
   company), with its whole lifecycle:
   `directory_company_id`, `gc_company_id`, `sub_company_id`,
   `status` (`pending` | `active` | `declined` | `revoked`),
   `invited_email`, `token_hash`, `invited_by`, `created_at`,
   `accepted_by`, `accepted_at`, `ended_by`, `ended_at`, `end_reason`.
   - A table, not a `linked_company_id` column, because ending a relationship
     has to leave a record (who, when, why) - the same rule as
     `demo_notification_log` and comps.
   - Unique: one LIVE link per Directory entry; one LIVE link per
     (GC, sub company) - so a GC with two entries for the same business must
     pick one, and the second is refused with a reason rather than silently
     double-linked.
   - A trigger refuses a link whose `sub_company_id` is a Directory entry
     itself, or whose Directory entry is not the GC's - **and one whose
     `sub_company_id` has nobody signed in to it.** "No owner" is not proof of
     a real business (see the SET NULL orphans above); "an account belongs to
     it" is, and the link is accepted by that account anyway.
3. **`sub_company_ids(actor_company uuid)`** - a STABLE SQL function: the
   actor's own company plus every Directory entry with an ACTIVE link to it.
   Mirrored by one TypeScript reader, `vendorIdentity()` in a new
   `lib/vendor-identity.ts`, which every path in the list above calls instead
   of comparing to `actor.companyId`.
4. **`engagement_crew`** - (`subcontract_id`, `profile_id`, `added_by`) - who
   from the sub's company works a given GC job. Written only by the sub's own
   admin/manager, only for profiles in their own company, only on a
   subcontract that resolves to them. This is what lets "crew sees assigned
   work only" hold on GC jobs (today nothing can assign them).
5. **Compliance ownership column**: `compliance_documents.uploaded_by_company_id`
   so a document the SUB files is theirs (stored on the real company) while
   the GC's copy-on-file stays on the Directory entry. Reads union the two
   for the GC, scoped to the link.

No row is rewritten by the migration. No existing subcontract, bill, document
or invite changes owner. The two people currently inside GC Directory rows
are left where they are and offered the move (section 5) - a migration does
not decide which business somebody works for.

---

## 3. Permission model

**The actor does not change.** One person, one company, one role, resolved by
`actorForUser` as today. What changes is the answer to "which vendor rows are
me":

```
vendorIdentity(actor) = { actor.companyId } ∪ { d.directory_company_id
                          | d in directory_links, d.sub_company_id = actor.companyId,
                            d.status = 'active' }
```

| Question | Rule |
|---|---|
| Is a sub on this GC job? | A subcontract on the job whose `company_id` is in `vendorIdentity`. |
| Which sub people see it? | Office roles (admin, manager, office) of the sub: yes. Assigned-only roles: only if in `engagement_crew` for that subcontract, or on `project_team_members`. |
| What can they do there? | Unchanged: role x resource (`SUB_AWARDED_ALLOWED` tabs), and every route keeps its own gate. The link grants REACH, never a permission. |
| Who at the sub is told? | Profiles of the REAL company (via the link), filtered by the existing per-type preferences - not profiles of the Directory row. |
| Can the GC see the sub's private work? | No. GC reads stay on `added_by = gc`, own projects, and the subcontract. Nothing GC-side ever reads the sub's own customers, projects, estimates or margins. |
| Can the sub see the GC's private data? | No more than today: their subcontract, their bills, their RFIs, the job's plans and schedule. Never the GC's Directory entry about them (the private notes are the GC's). |
| Who can change the sub's name/contact? | The sub, on their own company. The GC edits its own Directory entry only. Neither writes the other. |
| Who can create a link? | Only the sub's ADMIN accepting an invitation token, signed in to their own company. Email is how the token is delivered, never what authorises the link. |
| Who can end it? | Either side's admin. |

---

## 4. Lifecycle, with fake data

Fake companies throughout: **Acme Builders** (GC A), **Birch & Co** (GC B),
**Blue Wave Pools** (the sub, owner `owner@bluewave.test`, dispatcher
`office@bluewave.test`, crew `crew1@`, `crew2@`).

| # | Scenario | Today (traced in code) | Proposed |
|---|---|---|---|
| 1 | **Owner first.** Blue Wave signs up, then Acme adds them to its Directory and invites `owner@`. | Invite accept refused (`other_company`), sits pending for ever; Acme's jobs are invisible to Blue Wave. | Acme's invite becomes a LINK invitation. Owner signs in, sees "Acme Builders wants to work with you", accepts. Link active; Acme's subcontracts appear in Blue Wave's My Jobs. Nobody moves company. |
| 2 | **Invite first.** Acme invites `owner@` before Blue Wave has an account. | Owner lands INSIDE Acme's Directory row as `read_only`, with no admin anywhere and no way to open their own business. | The invite creates the person's OWN company (Blue Wave, owner = admin) and an active link from Acme's entry in the same step - accepting is the consent. Acme's entry stays Acme's. |
| 3 | **Two GCs.** Birch invites `owner@` too. | Refused: one person, one company. | Second link from Birch's entry to the same Blue Wave. Owner sees both GCs' jobs; crew sees only what they are assigned. Acme cannot see Birch's subcontract, and vice versa. |
| 4 | **Duplicate entries.** Acme has "Blue Wave Pools" and "BlueWave Pool Co" in its book. | Award / bid could attach to either; nothing reconciles them. | First link wins; linking the second is refused ("Acme already links Blue Wave to 'Blue Wave Pools'"). Acme can re-point jobs from the duplicate itself (a GC-side tidy-up within its own book). Never auto-merged. |
| 5 | **Same name, different business.** Birch's book holds an unrelated "Blue Wave Pools" in another state. | The pre-#659 award matched it by name across companies. | Nothing links without the token. The other business is never touched. |
| 6 | **Revoked by the GC.** Acme ends the relationship. | (No concept.) | Link `revoked`. Blue Wave loses the jobs' plans, schedule, RFIs, tasks and logs at the next request. See section 5 for what each side keeps. |
| 7 | **Crew removed.** Blue Wave removes `crew2@` from their company. | Profile removed; fine. | Same - and `engagement_crew` rows go with the profile (CASCADE). |
| 8 | **Public signup with a matching email.** `owner@` signs up and Acme's entry carries that email. | Joins Acme's Directory row as ADMIN. | Signup always creates the person's own company. A matching email is used only to SHOW pending invitations, which they may accept. |

Each row becomes an executable test in the implementation, against a pure
`vendorIdentity` and link-state module, plus a run on a Supabase branch with
exactly this fake data before anything touches production.

---

## 5. When a relationship ends

| Record | Owner | After the link is revoked |
|---|---|---|
| Subcontract, change orders, schedule lines | GC | Stay on the GC's job, unchanged. The sub loses access. |
| Bills the sub submitted | GC (they are the GC's payables) | Stay in the GC's books and QuickBooks. **The sub keeps a read-only view of the bills it submitted and their payment status** - that is its receivables history. |
| Files the sub uploaded to the job (photos, logs, RFIs) | GC's job record | Stay on the job; the sub keeps nothing it did not keep a copy of. |
| Compliance the SUB filed (COI, W-9, license) | Sub (`uploaded_by_company_id`) | Stays with the sub. The GC keeps documents tied to ITS jobs (`project_id` set) as its record of what was on file; it loses company-wide documents going forward. |
| The GC's Directory entry (notes, overrides, insurance status) | GC | Untouched. Shows "not linked" again. |
| The sub's own customers, jobs, estimates, crew | Sub | Never visible to the GC at any point, so nothing to undo. |
| Activity history | Job | Kept. A retraction is an event: the link's end is logged on both sides. |
| Notifications | - | Stop at once. |

Open for the owner to confirm: the read-only bill history for the sub (the
recommendation above), and whether a GC keeps company-wide compliance it
already viewed (recommendation: no - it keeps job-tied copies only).

---

## 6. Also needed, regardless of the link - SHIPPED

- `complete-signup` always creates the person's own company; `settings` no
  longer joins one by email.
- Material purchase matches a store by name only inside the buyer's own
  Directory, escaped.
- `companies.added_by_company_id` has its FK, a not-self check and an index
  (migration 155).
- Found while doing it, and fixed in the same change:
  - **A role was taken from `user_metadata`, which the user can write.**
    `getActor` started from it and kept it when no profile row existed, and
    `/api/settings` created a missing profile with the metadata's company and
    role. Roles now come from the profile only; a missing profile is filled
    only from a pending `company_invites` row.
  - **Deleting a Directory entry deleted the people inside it**
    (`profiles.company_id` cascades). The delete now refuses an entry that has
    people signed in under it or an address book of its own.

## 7. Build order once approved

1. Section 6 fixes + FK (no behaviour change for linked flows).
2. `directory_links`, `vendorIdentity`, and the readers in section 1 moved onto
   it - behind the link, so with no links the product behaves as today.
3. Link invitation / accept / end screens; the three doors redirected.
4. `engagement_crew` and the crew-scoping on GC jobs.
5. Compliance ownership.
6. The two people already inside GC rows: a one-time "open your own business"
   offer that runs scenario 2 for them.
