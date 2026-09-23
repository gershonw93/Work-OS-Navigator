// A STAGED LABEL MUST LAND AS A TYPE THE DIRECTORY ACCEPTS.
//
// THE BUG. Reported as a red bubble: "0 added to your Directory, 1 could not
// be: new row for relation "companies" violates check constraint
// "companies_type_check"". The staging screen offers Delivery; `companies.type`
// has never allowed 'delivery'; the import wrote the label straight into the
// column. Every contact labelled Delivery failed and the Subs beside it went
// through, so it read as intermittent. A comment claimed the two lists
// "mirrored" each other - nobody had checked it against the migration.

import { CONTACT_TYPES, DIRECTORY_TYPES, directoryType } from '../google-contacts'
import { ok, done, code, read } from './_helpers'

// The constraint as the migration wrote it, not as anybody remembers it.
const mig = read('supabase/migrations/021_company_types.sql')
const m = mig.match(/companies_type_check\s+CHECK\s*\(type IN \(([^)]*)\)\)/i)
ok(!!m, 'migration 021 still defines companies_type_check')
const allowed = new Set((m?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean))

ok(DIRECTORY_TYPES.length === allowed.size && DIRECTORY_TYPES.every(t => allowed.has(t)),
  'DIRECTORY_TYPES is exactly the list the CHECK constraint allows')

for (const t of CONTACT_TYPES) {
  ok(allowed.has(directoryType(t)), `staged label "${t}" files as an allowed type (got "${directoryType(t)}")`)
}
ok(directoryType('delivery') === 'supplier', 'a Delivery is filed as a Supplier')
ok(directoryType('subcontractor') === 'subcontractor', 'every other label files as itself')

// The route has to USE the translation - the function existing is not the fix.
const route = code('app/api/google-contacts/staged/import/route.ts')
ok(/type:\s*directoryType\(/.test(route), 'the import writes directoryType(...), not the raw label')
ok(!/type:\s*row\.contact_type/.test(route), 'the import never writes row.contact_type straight into companies.type')
ok(!/error:\s*insertError\.message/.test(route), 'a Postgres sentence is not handed to the user')

// The Directory's own add/edit route must agree with the constraint too.
const dir = code('app/api/directory/route.ts')
const vt = dir.match(/validTypes\s*=\s*\[([^\]]*)\]/)
const listed = new Set((vt?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean))
ok(listed.size === allowed.size && Array.from(listed).every(t => allowed.has(t)), 'the Directory route accepts exactly the constraint\'s types')

done()
