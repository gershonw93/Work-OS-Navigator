// GOOGLE CONTACTS, AND THE STAGING AREA THEY LAND IN.
//
// Spec item 6 of the Sep 17 batch: "Connect Google Contacts. They land in a
// separate staging area, not auto-mixed into the directory. From there assign
// to a job and label - sub, supplier, delivery, electrician, whatever. Bulk
// actions: select 5, label all at once."
//
// THE STAGING AREA IS THE FEATURE, not a step on the way to one. A phone book
// is not a trade directory: it holds your dentist, your brother-in-law and four
// numbers for the same electrician. Merging it into `companies` would bury the
// subs you actually work with under everyone you have ever met, and there is no
// undo for that.

import { stageContact, worthStaging, isContactType, CONTACT_TYPES, googleConfigured, GOOGLE_SCOPES } from '../google-contacts'
import { ok, done, code, exists, readCombined } from './_helpers'

// ── one Google person becomes one staged row ────────────────────────────────
const PERSON = {
  resourceName: 'people/c123',
  names: [
    { displayName: 'Old Name', metadata: {} },
    { displayName: 'Mike Rosenberg', metadata: { primary: true } },
  ],
  emailAddresses: [
    { value: 'old@example.com', metadata: {} },
    { value: 'mike@voltbros.com', metadata: { primary: true } },
  ],
  phoneNumbers: [{ value: '555-0100', metadata: { primary: true } }],
  organizations: [{ name: 'Volt Bros Electric', title: 'Owner', metadata: { primary: true } }],
}

const c = stageContact(PERSON)!
// PRIMARY FIRST. Google hands back arrays and `[0]` is somebody's old work
// address about as often as not.
ok(c.name === 'Mike Rosenberg', 'THE PRIMARY NAME wins, not the first in the array')
ok(c.email === 'mike@voltbros.com', '...and the primary address, not the stale one')
ok(c.phone === '555-0100' && c.organization === 'Volt Bros Electric' && c.job_title === 'Owner',
  '...with the phone, company and title carried across')
ok(c.resource_name === 'people/c123',
  "Google's own id is kept - it is what makes a second sync an update rather than a second copy")

// No primary flag at all: fall back to the first rather than to nothing.
const noPrimary = stageContact({ resourceName: 'people/x', names: [{ displayName: 'Solo' }] })!
ok(noPrimary.name === 'Solo', 'with no primary flagged, the first is better than none')
ok(noPrimary.email === null && noPrimary.phone === null, '...and absent fields are null, not undefined')

ok(stageContact({ names: [{ displayName: 'No id' }] }) === null,
  'a person with no resourceName is not a contact - there is no key to dedupe on')

// ── what is worth staging ───────────────────────────────────────────────────
ok(worthStaging(c), 'a real contact is staged')
ok(worthStaging({ resource_name: 'p/1', name: null, email: 'a@b.com', phone: null, organization: null, job_title: null }),
  '...and so is one with only an address')
ok(!worthStaging({ resource_name: 'p/1', name: null, email: null, phone: null, organization: null, job_title: null }),
  'NAMELESS AND UNREACHABLE IS NOISE: old device syncs return plenty, and they are not contacts')
ok(!worthStaging(null), 'and nothing is nothing')

// ── the labels ──────────────────────────────────────────────────────────────
ok(CONTACT_TYPES.includes('subcontractor') && CONTACT_TYPES.includes('supplier') && CONTACT_TYPES.includes('delivery'),
  'the labels asked for exist: sub, supplier, delivery')
ok(isContactType('supplier') && !isContactType('friend') && !isContactType(null),
  'and an unknown label is refused rather than stored')

// ── config is a STATE, not a crash ──────────────────────────────────────────
ok(typeof googleConfigured() === 'boolean',
  '"not configured" is a normal answer - a company without Google is not an error')
ok(/contacts\.readonly/.test(GOOGLE_SCOPES),
  'READ ONLY: we import an address book, we never write to somebody\'s phone')

// ── the tables ──────────────────────────────────────────────────────────────
ok(exists('supabase/migrations/112_google_contacts_import.sql'), 'the migration exists')
const mig = readCombined()
ok(/CREATE TABLE IF NOT EXISTS google_contact_imports/.test(mig), '...and is in the combined fresh-install file')
ok(/idx_google_contact_imports_unique[\s\S]{0,120}\(company_id, resource_name\)/.test(mig),
  'ONE ROW PER PERSON: without this, syncing twice doubles the staging area')
ok(/connected_by uuid REFERENCES profiles \(id\) ON DELETE SET NULL/.test(mig),
  'the connection outlives whoever set it up - SET NULL, never CASCADE')

// ── the handshake ───────────────────────────────────────────────────────────
const lib = code('lib/google-contacts.ts')
ok(/access_type: 'offline'/.test(lib),
  'OFFLINE: without it Google issues no refresh token and the import dies in an hour')
ok(/prompt: 'consent'/.test(lib),
  "...and CONSENT, or a second authorisation returns no refresh token and reconnecting silently does not fix it")
const cb = code('app/api/google-contacts/callback/route.ts')
ok(/if \(tokens\.refresh_token\) row\.refresh_token = tokens\.refresh_token/.test(cb),
  'THE TOKEN TRAP: a refresh token is only overwritten when Google actually sent one')
ok(/\.delete\(\)\.eq\('state', state\)/.test(cb),
  'the state is burned immediately, so a replayed code cannot re-link anything')
ok(/google: 'cancelled'/.test(cb),
  'saying no at Google is a decision, not a failure, and the page says so')

// ── nothing reaches the Directory by itself ─────────────────────────────────
const sync = code('app/api/google-contacts/sync/route.ts')
ok(!/from\('companies'\)/.test(sync),
  'THE WHOLE POINT: the sync never writes to companies - contacts land in staging and wait')
ok(/maxDuration = 60/.test(sync),
  'reading a whole address book is several round trips - the default cut-off is shorter')
ok(/r\.status !== 'staged'/.test(sync),
  'somebody already imported or dismissed is not re-offered on the next sync')

const imp = code('app/api/google-contacts/staged/import/route.ts')
ok(/from\('companies'\)\.insert/.test(imp), 'the import is the one act that writes a directory row')
// THE GUARD ITSELF, not a mention of the variable. The first version matched
// `unlabelled.length`, which also occurs inside the message the guard builds -
// so disabling the guard left the assertion passing against dead code.
ok(/if \(unlabelled\.length\) \{/.test(imp),
  'AN UNLABELLED CONTACT IS REFUSED: the guard is live, not merely written')
ok(/Label these before importing/.test(imp),
  '...and the refusal NAMES the rows rather than saying "some are not labelled"')
ok(/filter\(r => !r\.contact_type\)/.test(imp),
  '...having actually looked for the unlabelled ones')
ok(/results\.push\(\{ id: row\.id, error:/.test(imp),
  'a loop that throws abandons the rest in silence - each row reports its own outcome')
ok(/problems: failed\.map/.test(imp), '...and the reply carries every reason, so "38 of 40" is not the whole story')

// ── bulk actions ────────────────────────────────────────────────────────────
const staged = code('app/api/google-contacts/staged/route.ts')
ok(/Array\.isArray\(body\?\.ids\)/.test(staged), 'bulk: it takes a LIST of ids')
ok(/\.eq\('company_id', ctx\.companyId\)/.test(staged),
  "...and can only ever touch this company's staging area")
ok(/isKnownTrade\(trade\)/.test(staged),
  'a trade the app would not offer is REFUSED here - "Elecric" is not laundered in through an import')
ok(/if \(body\.contact_type !== undefined\)/.test(staged) && /if \(body\.trade !== undefined\)/.test(staged),
  'ONLY WHAT IS SENT IS WRITTEN: labelling five people cannot blank a trade somebody already set')
ok(/That job is not yours/.test(staged),
  'assigning to a job checks the job is this company\'s - the id comes from a browser')

// ── the screen ──────────────────────────────────────────────────────────────
const page = code('app/(dashboard)/directory/imported/page.tsx')
ok(/'loading' \| 'ready' \| 'failed'/.test(page),
  'loading, failed and empty are three facts - "nothing waiting" is the happy one and must be checked first')
ok(/!status\?\.configured/.test(page),
  'THE SERVER HAVING NO CREDENTIALS is a different fact from this company not having connected')
ok(/Select all \$\{rows\.length\}/.test(page) && /Clear all/.test(page), 'select all, naming its count')
const NATIVE_DIALOG = new RegExp(`\\b${'con' + 'firm'}\\(`)
ok(/useDeleteGuard/.test(page) && !NATIVE_DIALOG.test(page),
  'disconnect goes through the delete guard, never a blocking native dialog')
ok(/guardDelete\(async/.test(page),
  '...and the guard is not bound to a name that shadows the global, which is how one sneaks back')
ok(/Connected\{status\.googleEmail \? ` as \$\{status\.googleEmail\}`/.test(page),
  'it NAMES the Google account - "connected" alone tells somebody with three logins nothing')
ok(/nothing new to review/.test(page),
  'a sync that found nothing new SAYS so - a silent refresh reads as a dead button')

done()
