// Deleting a site deletes its units - and only the owner may delete at all.
//
// THE REPORT. A building bulk-added with 10 floors was deleted, and the 10
// floors "spit out" as ordinary projects. parent_project_id is ON DELETE SET
// NULL (migration 063), so deleting the site alone detached every unit.
//
// FOUND BESIDE IT. The DELETE route asked whether the caller may delete
// projects, never whether THIS project is theirs - a sub on a GC's job with
// projects:edit in their own company passed. CLAUDE.md: "WHOSE JOB IT IS IS A
// SECOND QUESTION, AND SOME ROUTES MUST ASK IT."

import { ok, done, code, read } from './_helpers'

const route = code('app/api/projects/[id]/route.ts')
const del = route.slice(route.indexOf('export async function DELETE'))
ok(del.length > 0, 'found the DELETE handler')

const ownerAt = del.search(/ownedProject(<[^>]*>)?\(/)
const firstDelete = del.indexOf(".delete()")
ok(ownerAt > 0 && ownerAt < firstDelete, 'ownership is checked before anything is deleted')
ok(/\.eq\('parent_project_id', params\.id\)/.test(del), 'the units of a site are looked up')
ok(/ownsProject\(actor!?\.companyId, u\)/.test(del), '...and every unit must be this company\'s too')
const unitsDelete = del.indexOf(".in('id', unitRows")
const parentDelete = del.lastIndexOf(".eq('id', params.id)")
ok(unitsDelete > 0 && unitsDelete < parentDelete, 'the units are deleted BEFORE the site, not detached by it')
ok(!/error: error\.message/.test(del), 'a failed delete says a sentence, not a Postgres message')

// The FK the bug came from - still SET NULL, which is exactly why the route
// has to delete the units itself. If a migration ever makes it CASCADE, this
// assertion is the one to revisit, not the route.
ok(/parent_project_id uuid REFERENCES projects \(id\) ON DELETE SET NULL/.test(read('supabase/migrations/063_project_sites_units.sql')),
  'the FK is SET NULL, which is why the route deletes units explicitly')

const page = code('app/(dashboard)/projects/page.tsx')
const handler = page.slice(page.indexOf('function handleDelete'), page.indexOf('function handleDelete') + 1500)
ok(/childCount\[project\.id\]/.test(handler) && /inside it, with all their data/.test(handler),
  'the confirmation says how many jobs go with the site')
ok(/if \(!res\.ok\)/.test(handler) && /notify\(/.test(handler), 'a refused delete says so instead of silently refreshing')
done()
