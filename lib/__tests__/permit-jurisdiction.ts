// "when you select what the inspector does, will it flag if i add it to a
// different permit? / if i put in an address to a job, can it connect the dots
// with which place needs to apply with who and suggest?" - and "for Towns it
// covers ... use the google maps api and just search for townships or
// counties and auto populate".

import {
  areaCoversJob, authorityWarning, cleanAreas, cleanIssues, coverageOf, foldArea, suggestAuthority,
  type AuthorityCard, type JobAreas,
} from '../permit-jurisdiction'
import { ok, done, code, read } from './_helpers'

// ── names ───────────────────────────────────────────────────────────────────
ok(foldArea('Toms River Township') === 'toms river' && foldArea('Township of Toms River') === 'toms river' && foldArea('Ocean County') === 'ocean',
  'a township is one place however it is written')

// ── where the job is ────────────────────────────────────────────────────────
const tomsRiver: JobAreas = { municipality: 'Toms River', locality: 'Toms River', county: 'Ocean County', state: 'NJ' }
const berkeley: JobAreas = { municipality: 'Berkeley Township', locality: 'Toms River', county: 'Ocean County', state: 'NJ' }
const TR = { name: 'Toms River', kind: 'municipality' as const, state: 'NJ' }
const OCEAN = { name: 'Ocean', kind: 'county' as const, state: 'NJ' }
ok(areaCoversJob(TR, tomsRiver), 'Toms River covers a job in Toms River')
ok(!areaCoversJob(TR, berkeley), 'the MAILING town is not the township: a "Toms River" address in Berkeley is not Toms River\'s')
ok(areaCoversJob(OCEAN, berkeley), 'a county covers every township in it')
ok(!areaCoversJob({ ...TR, state: 'NY' }, tomsRiver), 'a same-named place in another state does not')
ok(areaCoversJob(TR, { municipality: null, locality: 'Toms River', county: null, state: 'NJ' }),
  'with no township from the map, the postal town is the best word there is')

// ── suggesting ──────────────────────────────────────────────────────────────
const cards: AuthorityCard[] = [
  { id: 'tr', name: 'Toms River Township', covers: [TR], issues: ['Building', 'Electrical', 'Plumbing'] },
  { id: 'oc', name: 'Ocean County Health Dept', covers: [OCEAN], issues: ['Sewage/Septic', 'Well'] },
  { id: 'bk', name: 'Berkeley Township', covers: [{ name: 'Berkeley', kind: 'municipality', state: 'NJ' }], issues: [] },
]
ok(suggestAuthority('Building', tomsRiver, cards)?.name === 'Toms River Township', 'Building in Toms River: Toms River Township')
ok(suggestAuthority('Sewage/Septic', tomsRiver, cards)?.name === 'Ocean County Health Dept', 'Septic in Toms River: the county that issues it, not the township that does not')
ok(suggestAuthority('Building', berkeley, cards)?.name === 'Berkeley Township', 'a Toms River mailing address in Berkeley: Berkeley')
ok(/Covers Toms River and issues Building permits/.test(suggestAuthority('Building', tomsRiver, cards)?.reason ?? ''), 'a suggestion says why')
ok(suggestAuthority('Sign', tomsRiver, cards) === null, 'nobody covering the job issues Sign permits: no suggestion, rather than a wrong one')
const twins = [...cards, { id: 'tr2', name: 'TR Building Dept', covers: [TR], issues: ['Building'] }]
ok(suggestAuthority('Building', tomsRiver, twins) === null, 'two cards that fit equally well suggest nothing')
ok(suggestAuthority('Fence/Wall', null, [], ['Lakewood Township', ' Lakewood Township ', null])?.name === 'Lakewood Township',
  'no map answer: the one township already on this job\'s permits')
ok(suggestAuthority('Fence/Wall', null, [], ['Lakewood', 'Brick']) === null, '...but not when the job already uses two')

// ── warning ─────────────────────────────────────────────────────────────────
ok(authorityWarning('Sewage/Septic', 'Toms River Township', tomsRiver, cards) === 'Toms River Township is not marked as issuing Sewage/Septic permits. Ocean County Health Dept does, per your Directory.',
  '"will it flag" - picking a township for a permit it does not issue warns, and names the one that does')
ok(/does not cover Berkeley Township/.test(authorityWarning('Building', 'Toms River Township', berkeley, cards) ?? ''),
  'picking a township that does not cover the job warns')
ok(authorityWarning('Building', 'Toms River Township', tomsRiver, cards) === null, 'the right pick says nothing')
ok(authorityWarning('Building', 'Berkeley Township', tomsRiver, cards) !== null && authorityWarning('Sign', 'Berkeley Township', berkeley, cards) === null,
  'a card that has not listed what it issues restricts no type')
ok(authorityWarning('Building', 'Somebody Not In The Directory', tomsRiver, cards) === null, 'a name with no card says nothing')

// ── storing ─────────────────────────────────────────────────────────────────
const cleaned = cleanAreas([TR, { ...TR, name: 'Toms River Twp' }, { name: '', kind: 'county' }, { name: 'X', kind: 'planet' }, OCEAN])
ok(cleaned.length === 2, 'areas are stored clean: no repeats, no blank, no unknown kind')
ok(cleanIssues(['Building', 'building', ' Electrical ', '', 7]).join() === 'Building,Electrical', 'permit types are stored clean')
ok(coverageOf({ covers: [TR], issues: ['Building'] }).covers.length === 1 && coverageOf(null).issues.length === 0, 'a card reads its two facts off extra, or none')

// ── wiring ──────────────────────────────────────────────────────────────────
const edit = code('lib/writes/directory-contact-edit.ts')
ok(/extraPatch\.covers = cleanAreas\(body\.covers\)/.test(edit) && /extraPatch\.issues = cleanIssues\(body\.issues\)/.test(edit),
  'the edit route stores both, cleaned, merged into extra')
const areasRoute = code('app/api/geo/areas/route.ts')
ok(/requirePermission\(admin\(\), request, 'directory', 'view'\)/.test(areasRoute), 'the township search is gated - the map key is paid per call')
const jobs = read('lib/job-areas.ts')
ok(/types=\(regions\)/.test(jobs) && /administrative_area_level_3/.test(jobs) && /administrative_area_level_2/.test(jobs),
  'Google: a regions search for townships and counties, and the job\'s municipality and county off its address')
ok(jobs.indexOf("get('administrative_area_level_3')") < jobs.indexOf("get('locality')"), '...the township before the postal town')
const route = code('app/api/projects/[id]/permit-authority/route.ts')
ok(/requirePermission\(db, request, 'permits', 'view'\)/.test(route) && /ownedProject</.test(route) && /suggestAuthority\(t, areas, cards, used\)/.test(route),
  'the suggestion route is the caller\'s own job, and asks the one rule')
const page = code('app/(dashboard)/projects/[id]/permits/page.tsx')
ok(/if \(sug && \(!cur\.trim\(\) \|\| cur === lastSuggested\.current\)\)/.test(page) && (page.match(/\{authorityHint\}/g) ?? []).length === 2,
  'Add Permit fills only an empty box (or one it filled itself), and shows why or warns, in both forms')
const board = code('components/permits/permit-board.tsx')
ok(/permit-authority\?types=\$\{encodeURIComponent\(addTypes\.join\(','\)\)\}/.test(board) && /const warnFor = \(t: string\) => jur \? authorityWarning\(/.test(board),
  'Update several houses suggests per type from the development\'s address, and warns per type')
const dir = code('app/(dashboard)/directory/page.tsx')
ok(/<AreaPicker value=\{editCovers\} onChange=\{setEditCovers\} \/>/.test(dir) && /covers: editCovers, issues: editIssues/.test(dir)
  && /Towns it covers<\/p>/.test(dir) && /Permits it issues<\/p>/.test(dir),
  'a township card edits and shows Towns it covers and Permits it issues')

done()
