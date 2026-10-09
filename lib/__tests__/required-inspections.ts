// REQUIRED INSPECTIONS, ONE TYPE LIST, AND THE INSPECTOR WHO DOES THE TYPE.
//
// Asked for as: "write these are the following inspections required for the
// job, and when the time comes request it; a default list to select from, add
// other types; eventually tie up to the inspector contact by what type of
// inspection he does".

import {
  DEFAULT_INSPECTION_TYPES, typeOptions, foldType, requiredStatuses, requiredSummary,
  missingTypes, typeSortOrder, typeNameProblem, cleanTypeList, isDefaultType,
} from '../inspection-types'
import { utilityInspections } from '../lot-details'
import { whoToCall, callTargetsFor, rankForType } from '../inspection-contacts'
import { ok, done, read, code } from './_helpers'

// ── one list ────────────────────────────────────────────────────────────────
const page = read('app/(dashboard)/projects/[id]/inspections/page.tsx')
ok(!/const INSPECTION_TYPES\s*=/.test(page), 'the inspections page no longer carries its own copy of the type list')
ok(/typeOptions/.test(page) && /\/api\/inspection-types/.test(page),
  '...it picks from the shared list plus the company\'s own types')
ok(/DEFAULT_INSPECTION_TYPES/.test(read('app/api/projects/[id]/inspections/analyze/route.ts')),
  'and the card scanner names the same list, not a third spelling of it')
ok(utilityInspections({ city_sewer: false, city_water: false }).every(isDefaultType),
  'the septic and well types a lot suggests are on the default list, spelled the same')

const opts = typeOptions(['pool bonding', 'FRAMING'])
ok(opts.filter(o => foldType(o) === 'framing').length === 1, 'a company type differing only by case is not a second Framing')
ok(opts[opts.length - 1] === 'pool bonding', 'a company type comes after the defaults')
ok(typeNameProblem('  ') !== null && typeNameProblem('123') !== null && typeNameProblem('Pool Bonding') === null,
  'a blank or digits-only name is refused with a reason')
ok(cleanTypeList(['Framing', 'framing', ' ', 'Well']).join() === 'Framing,Well', 'a list off a body is cleaned and de-duplicated')

// ── a required inspection is not an inspection row ──────────────────────────
// `not_scheduled` means "asked for, nobody booking it" and notifies schedulers.
const reqRoute = read('app/api/projects/[id]/required-inspections/route.ts')
ok(!/from\('inspections'\)\s*\.insert/.test(reqRoute),
  'adding to the required list never creates an inspection row - nothing is requested and nobody is told')
ok(/ownedProject/.test(reqRoute) && /requirePermission\(db, request, 'inspections', 'edit'\)/.test(reqRoute),
  'changing the list needs inspections:edit AND the job to be yours')
ok(/console\.error/.test(reqRoute) && /status: 500/.test(reqRoute),
  'a refused read is reported, not rendered as "this job needs nothing"')
const m = read('supabase/migrations/132_required_inspections.sql')
ok(/project_id uuid NOT NULL REFERENCES projects \(id\) ON DELETE CASCADE/.test(m)
  && /company_id uuid NOT NULL REFERENCES companies \(id\) ON DELETE CASCADE/.test(m)
  && /ON DELETE SET NULL/.test(m), 'every foreign key states its ON DELETE rule')
ok(/UNIQUE INDEX[\s\S]*project_required_inspections \(project_id, lower\(type\)\)/.test(m),
  'one job cannot list the same inspection twice, whatever the case')

// ── where each stands is DERIVED ────────────────────────────────────────────
const req = [
  { id: 'r1', type: 'Framing', sort_order: 50 },
  { id: 'r2', type: 'Footing', sort_order: 20 },
  { id: 'r3', type: 'Septic Final', sort_order: 120 },
  { id: 'r4', type: 'Insulation', sort_order: 90 },
]
const insp = [
  { id: 'a', type: 'framing', status: 'failed', created_at: '2026-10-01' },
  { id: 'b', type: 'Framing', status: 'passed', created_at: '2026-10-05' },
  { id: 'c', type: 'Footing', status: 'scheduled', scheduled_date: '2026-10-12', created_at: '2026-10-02' },
  { id: 'd', type: 'Insulation', status: 'passed', created_at: '2026-10-03' },
  { id: 'e', type: 'Insulation', status: 'void', created_at: '2026-10-08' },
]
const st = requiredStatuses(req, insp)
ok(st.map(s => s.required.type).join() === 'Footing,Framing,Insulation,Septic Final', 'the list reads in building order')
ok(st.find(s => s.required.type === 'Framing')!.state === 'passed', 'a failed framing followed by a passed one is passed - the NEWEST row speaks')
ok(st.find(s => s.required.type === 'Footing')!.state === 'booked' && st.find(s => s.required.type === 'Footing')!.date === '2026-10-12',
  'a booked one says booked, with the booked date')
ok(st.find(s => s.required.type === 'Insulation')!.state === 'passed', 'a voided row is a retraction and does not undo a pass')
ok(st.find(s => s.required.type === 'Septic Final')!.state === 'not_requested', 'nothing filed is "not requested yet"')
const sum = requiredSummary(st)
ok(sum.passed === 2 && sum.total === 4 && sum.notRequested === 1, 'the header counts passed, total and not requested')
ok(missingTypes(['Framing', 'Well', 'well'], req).join() === 'Well', 'only types not already listed are added, once')
ok(typeSortOrder('Footing') < typeSortOrder('Framing') && typeSortOrder('Pool Bonding') > typeSortOrder('Certificate of Occupancy'),
  'a stored sort order keeps footing-to-final, custom ones last')

// ── the inspector who does the type goes first ──────────────────────────────
const contacts = [
  { name: 'Alan Any', type: 'inspector', phone: '555-0001', extra: {} },
  { name: 'Fran Framer', type: 'inspector', phone: '555-0002', extra: { inspection_types: ['Framing'] } },
]
const calls = whoToCall({ inspection: { type: 'framing' }, contacts })
ok(calls[0].name === 'Fran Framer', 'for a framing inspection, the inspector marked as doing framing is first')
ok(/does framing/i.test(calls[0].source), '...and says why she jumped the queue')
ok(calls.some(c => c.name === 'Alan Any'), 'nobody is dropped for doing other types')
ok(whoToCall({ inspection: { type: 'Septic Final' }, contacts })[0].name === 'Alan Any',
  'for a type nobody is marked for, the order is unchanged')
const own = callTargetsFor({ type: 'Framing', inspector_name: 'Ray', inspector_phone: '555-9' }, whoToCall({ contacts }))
ok(own[0].name === 'Ray' && own[1].name === 'Fran Framer',
  'what the inspection itself carries still comes first - somebody wrote it down on purpose')
ok(rankForType([], 'Framing').length === 0, 'an empty list stays empty')
ok(/type: inspection_type/.test(read('app/api/projects/[id]/inspections/route.ts')),
  'and the "Inspection to book" notification names the matching inspector, not the first one')

// ── the Directory stores it without wiping the rest of `extra` ──────────────
const patch = code('app/api/directory/[companyId]/route.ts')
ok(/\.\.\.\(\(\(cur as any\)\?\.extra/.test(patch), 'editing an inspector\'s types merges into extra, keeping jurisdiction and cert #')
ok(/inspection_types/.test(read('app/api/directory/route.ts')), 'adding an inspector keeps the types picked')

ok(DEFAULT_INSPECTION_TYPES.length >= 15, 'the default list is a real starting point')

done()
