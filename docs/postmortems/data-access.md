# Data access post-mortems

Reading the wrong column, the wrong table, or the wrong key off a response.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## Migrations
- Numbered files in `supabase/migrations/`. Apply them with the Supabase MCP
  (`apply_migration`, project `rxdqmetqvfninvaqymyl` - "Work OS Navigator").
- Combined, idempotent SQL is still kept current at
  `supabase/migrations/_combined_008-105.sql` (bump the suffix as you add
  migrations) as the fallback for a fresh environment.
- IMPORTANT: verify every column you `.select()` actually exists - Supabase
  returns `data: null` for an unknown column, so a typo reads as "not found"
  rather than an error. `projects` has `client`, NOT `client_name`, and has no
  `client_email` at all (the address is on `customers`).
- The same class of silent failure on the way BACK: read the wrong key off a
  response and you get `undefined`, which a truthiness guard swallows. A Send
  box sat permanently blank because a component read `d.email` from a route
  that answers `{ clientEmail }`. If two places read one endpoint, give them
  one reader (`lib/use-client-email.ts`) rather than two chances to be wrong.
  IT HAPPENED AGAIN AND THE SECOND ONE WAS WORSE. The printed Compliance Report
  read `d.documents ?? d.compliance ?? []` from a route that answers
  `{ subcontracts, docs, requirements }` - so it printed "No compliance
  documents on record" on EVERY job since it was written, which on an owner's or
  a lender's copy is not a blank section, it is an assertion that a sub is
  uninsured. `??` chaining two guesses is the tell: nobody chains a fallback for
  a key they have read. `lib/compliance-report.ts` is the one reader, and it
  takes the route's own key names as its argument names.
- **AND THE TABLE ITSELF, NOT JUST THE COLUMN.** `lib/inspection-contacts.ts`
  read `contacts` for the Directory's inspectors. `contacts` HOLDS ZERO ROWS -
  every door that files one (the picker's Quick add, the permits page, Add
  Contact) POSTs to `/api/directory`, which inserts into `companies` with
  `type = 'inspector'`. There are 21 there and none anywhere else, so the
  Directory half of "who do I call" never produced a line: a query against the
  wrong table comes back `[]`, which renders exactly like "you have not added
  any". `/api/directory` GET was also returning an always-empty `contacts: []`
  that two callers merged into their lists, and `share-files-modal` read
  `c.email` off a `companies` row that has `contact_email` - so choosing
  somebody from the directory filled their NAME and blanked the address.
  Pinned in `contact-picker.ts`, and the red-check is putting `contacts` back.
- **AND THE COLUMN NOBODY WRITES, WHICH IS THE SAME FAULT WITH TWO HOMES
  INSTEAD OF ONE.** `projects` carried FOUR columns for one fact: `lat`, `lng`,
  `geocoded_address` (047) - written by the address autocomplete, the project
  form, the bulk creator and the map sweep, and present on 94 of 100 rows - and
  `latitude`, `longitude` (014), written by the demo seed and by one private
  Nominatim call inside the clock-in route and by nothing else, ever. The
  GEOFENCE read `latitude`/`longitude`, so it asked an empty column on every
  real job, got null, and told the worker their phone had given no location
  while their own latitude sat in the same row - the bug #444 made honest
  without curing. A second home is not a typo you can grep for: both names
  exist, both compile, and the one you picked decides whether the feature has
  ever worked. `lib/project-site.ts` is the one reader and 105 drops the spare.
- **AND A VALUE THAT IS PRESENT AND WRONG IS WORSE THAN ONE THAT IS MISSING.**
  `geocoded_address` records the address a pin was resolved FROM. Editing a job's
  address without picking a suggestion leaves the coordinates behind, so a job
  reading "17 Fairview Terrace, Maplewood, NJ" was pinned in Frederick, MD - 14
  of 100 rows like it. A missing pin makes the app say "not mapped"; a stale one
  makes it flag an honest worker two hundred miles from a place they have never
  been. `projectSite()` returns `coords: null` for a stale pin as well as an
  absent one, because a caller handed a number WILL measure against it; what
  differs is only what `siteLabel` says. Same rule going in: a geocoder handed
  "1 North St" (no town, no state, no ZIP) does not fail, it PICKS - it picked a
  street in east London for a US job - so `lib/geocode-match.ts` refuses to ask a
  question too vague to have one answer, and refuses an answer whose state or ZIP
  contradicts the address. A wrong pin is a confident lie; null is honest.
- A TYPE THAT DESCRIBES NO TABLE IS NOT CHECKED BY ANYTHING. The same report
  declared `doc_type`, `subcontractor_name` and `company_name`; a
  `compliance_documents` row has `type` and `company_id` and none of the three,
  and the company NAME only exists on the `subcontracts` array beside it. An
  interface written from memory compiles perfectly and is wrong at runtime -
  check the columns against the migration, the same as for a `.select()`.

