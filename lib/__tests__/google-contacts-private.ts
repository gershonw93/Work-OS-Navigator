// GOOGLE CONTACTS ARE PRIVATE UNTIL FILED.
//
// THE BUG. Migration 112 made the connection and the staging list per
// COMPANY. One admin connected Google, and their whole address book - family,
// doctor, everybody - sat in a list any signed-in user at the company could
// open, label and import. The staged route's own comment claimed a
// `directory: edit` gate it never checked. Asked, once noticed: "private until
// filed". Each person connects their own account and sees only their own
// list; a contact is shared only when its owner files it into the Directory.

import { ok, done, code, read, walk, readCombined } from './_helpers'

const routes = walk('app/api/google-contacts').filter(f => f.endsWith('route.ts'))
ok(routes.length >= 7, `every Google Contacts route is scanned (found ${routes.length})`)

for (const f of routes) {
  const src = code(f)
  const touches = /google_contact_imports|google_connections/.test(src)
  if (!touches) continue
  // Keyed on the PERSON. A company_id filter on either table is the bug.
  ok(!/from\('google_contact_imports'\)[^;]*\.eq\('company_id'/.test(src),
    `${f}: never reads or writes the staging list by company`)
  ok(!/from\('google_connections'\)[^;]*\.eq\('company_id'/.test(src),
    `${f}: never reads or writes a connection by company`)
  if (/from\('google_contact_imports'\)/.test(src)) {
    ok(/owner_id/.test(src), `${f}: every staging-list query names its owner`)
  }
}

// Who is asking comes from ONE place, gated on the Directory permission.
for (const f of routes.filter(f => !f.includes('callback'))) {
  ok(/contactsActor\(request, '(view|create)'\)/.test(code(f)), `${f}: asks through contactsActor`)
}
const actor = code('lib/google-contacts-actor.ts')
ok(/requirePermission\(db, request, 'directory', action\)/.test(actor), 'contactsActor gates on the Directory permission')
ok(/contactsActor\(request, 'create'\)/.test(code('app/api/google-contacts/staged/import/route.ts')),
  'filing into the shared Directory takes directory: create')

// The callback saves the connection against the person who started it.
const cb = code('app/api/google-contacts/callback/route.ts')
ok(/onConflict: 'profile_id'/.test(cb), 'one connection per PERSON')
ok(/profile_id: \(stateRow as any\)\.created_by/.test(cb), 'owned by whoever started the handshake')
ok(/no_owner/.test(cb), 'a handshake with no person behind it saves nothing')

// The sync stamps every row it writes with the asker.
ok(/owner_id: userId/.test(code('app/api/google-contacts/sync/route.ts')), 'every synced row carries its owner')

// The schema.
const mig = read('supabase/migrations/117_google_contacts_per_person.sql')
ok(/PRIMARY KEY \(profile_id\)/.test(mig), 'google_connections is keyed on the person')
ok(/owner_id SET NOT NULL/.test(mig), 'a staged row always has an owner')
ok(/117_google_contacts_per_person/.test(readCombined()), 'and it is in the combined file')

// The page says so, where the list is.
const page = code('app/(dashboard)/directory/imported/page.tsx')
ok(/private to you/.test(page), 'the screen says the list is private')
ok(/'denied'/.test(page), 'a refused permission is not reported as "reload the page"')

done()
