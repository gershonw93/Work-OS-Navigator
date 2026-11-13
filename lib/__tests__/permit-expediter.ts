// "you email the expediter the files and they reply back with what needs to
// change ... once they hit ready for submitting it goes to the next permit
// field" - and, from an expediter: they send the survey and their proposal, you
// sign the proposal and send it back; for a new building they relay what the
// DOB says to change to get the plans approved, THEN you apply for the permit.
// "renovations too / one plan can cover one unit / expediters fee should be
// added too if they use one".

import {
  EXPEDITER_TRADE, PLAN_APPROVAL_TYPE, expediterFacts, hireProblem, isExpediterTrade, isPlanApproval, planApproved,
} from '../permit-expediter'
import { permitStage, permitStanding, type PermitRound } from '../permit-rounds'
import { permitEmailCopy } from '../permit-email'
import { PLAN_TYPES } from '../writes/plan-sheet'
import { guessPlanType } from '../upload-plan'
import { ok, done, code, read, readCombined } from './_helpers'

const TODAY = '2026-11-13'
const round = (o: Partial<PermitRound>): PermitRound =>
  ({ id: o.id ?? 'r', permit_id: 'p', submitted_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z', ...o })

// ── who counts as an expediter ──────────────────────────────────────────────
ok(isExpediterTrade('Permit expediter') && isExpediterTrade('NYC Expeditor') && isExpediterTrade('expediting')
  && !isExpediterTrade('Electrician') && !isExpediterTrade(null), 'an expediter is anybody whose trade says so, however it is spelled')
ok(isPlanApproval('Plans Review') && isPlanApproval(' plans review ') && !isPlanApproval('Building') && PLAN_APPROVAL_TYPE === 'Plans Review',
  'the plan approval is the Plans Review type thirty permits already use - not a second name for it')

// ── hired is the subcontract, and the plans gate is per unit ────────────────
const EXP = { id: 'exp', name: 'Acme Expediting', contact_email: 'files@acme.test' }
const plans = { id: 'plans', project_id: 'unit1', permit_type: 'Plans Review', status: 'pending', expediter_company_id: 'exp' }
const building = { id: 'bldg', project_id: 'unit1', permit_type: 'Building', status: 'pending', expediter_company_id: 'exp' }
const otherUnit = { id: 'u2', project_id: 'unit2', permit_type: 'Building', status: 'pending', expediter_company_id: 'exp' }
const facts = (subs: any[], roundsBy: Record<string, any[]> = {}, list: any[] = [plans, building, otherUnit]) =>
  expediterFacts(list, id => roundsBy[id] ?? [], [EXP], subs)

let f = facts([])
ok(f.every(p => p.expediter_name === 'Acme Expediting' && p.expediter_hired_on === null), 'no subcontract on the job: not hired')
f = facts([{ id: 's1', project_id: 'unit1', company_id: 'exp', created_at: '2026-11-10T15:00:00Z' }])
ok(f[0].expediter_hired_on === '2026-11-10' && f[1].expediter_hired_on === '2026-11-10' && f[1].expediter_subcontract_id === 's1',
  'hired once on the unit is hired for every permit on that unit - one contract, one fee')
ok(f[2].expediter_hired_on === null, '...but a contract on ANOTHER unit is not a hire on this one')
ok(f[1].plans_pending === true && f[0].plans_pending === false && f[2].plans_pending === false,
  'one plan covers one unit: that unit\'s Building waits on its plans, the plan approval does not wait on itself, another unit is not held')
f = facts([], { plans: [round({ outcome: 'approved', outcome_on: '2026-11-01' })] })
ok(f[1].plans_pending === false, 'plans approved: the unit\'s permits are free to apply')
ok(planApproved({ status: 'approved' }, []) && !planApproved({ status: 'pending' }, [{ outcome: 'corrections' }]),
  'approved by its history or by its status, never by corrections')
const northPort = expediterFacts(
  [{ ...plans, expediter_company_id: null }, { ...building, expediter_company_id: null }], () => [], [], [])
ok(northPort.every(p => !p.plans_pending && p.expediter_name === null),
  'a Plans Review filed the old way, with no expediter, holds NOTHING - thirty permits already work like that')

// ── where it stands ─────────────────────────────────────────────────────────
const base = { status: 'pending', issuing_authority: 'NYC DOB', permit_type: 'Plans Review', created_at: '2026-11-01T10:00:00Z' }
let st = permitStage({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme Expediting' }, [], [], TODAY)
ok(st.stage === 'hire' && st.head === 'Hire Acme Expediting' && st.step === 0 && st.group === 'you', 'through an expediter, the first step is to hire them')
ok(/sends the survey and their proposal\. Sign the proposal, send it back/.test(st.sub), '...in the order they work: survey and proposal from them, signed proposal back')
ok(permitStanding({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme Expediting' }, [], [], TODAY).short === 'Hire expediter',
  'the development board cell says it too')
st = permitStage({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme Expediting', expediter_hired_on: '2026-11-10' }, [], [], TODAY)
ok(st.stage === 'draft' && st.head === 'Send it to Acme Expediting' && /files it with NYC DOB/.test(st.sub) && st.who === 'NYC DOB',
  'hired: send the plans to the expediter, who files them - the DOB is still the one reviewing')
st = permitStage({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme Expediting', expediter_hired_on: '2026-11-10' },
  [round({ outcome: 'corrections', outcome_on: '2026-11-05' })], [], TODAY)
ok(st.stage === 'fix', 'what the DOB wants changed is a round of corrections, as for any permit')
st = permitStage({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme Expediting' }, [round({})], [], TODAY)
ok(st.stage === 'city', 'already filed before anybody recorded the hire: the history wins, never "hire them" over a live submission')
st = permitStage({ ...base, expediter_company_id: 'exp', expediter_name: 'Acme', expediter_hired_on: '2026-11-10' },
  [round({ outcome: 'approved', outcome_on: '2026-11-12' })], [], TODAY)
ok(st.pill === 'Approved' && /^Plans approved/.test(st.head), 'approved plans read as approved plans, and say what is next')
st = permitStage({ ...base }, [round({ outcome: 'approved', outcome_on: '2026-11-12' })], [], TODAY)
ok(st.pill === 'Issued', '...but a Plans Review with no expediter keeps the wording it always had')

const bldg = { status: 'pending', issuing_authority: 'NYC DOB', permit_type: 'Building', created_at: '2026-11-01T10:00:00Z' }
st = permitStage({ ...bldg, plans_pending: true }, [], [], TODAY)
ok(st.waitingOnPlans && st.head === 'Waiting on plan approval' && /once the Plans Review on this job is approved/.test(st.sub),
  'a unit\'s permit waits on its plans, and says which')
ok(permitStanding({ ...bldg, plans_pending: true }, [], [], TODAY).short === 'Waiting on plans', '...on the board too')
ok(permitStage({ ...bldg }, [], [], TODAY).head === 'Apply for it', 'no expediter, no plans gate: exactly as before')

// ── the hire ────────────────────────────────────────────────────────────────
ok(/Enter their fee/.test(hireProblem({ fee: '', hasFile: true }) ?? ''), 'the fee is asked for - it is what goes on the budget')
ok(/dollar amount/.test(hireProblem({ fee: 'lots', hasFile: true }) ?? ''), '...as a number')
ok(/signed proposal/.test(hireProblem({ fee: '$4,500', hasFile: false }) ?? ''), 'the signed copy is asked for')
ok(hireProblem({ fee: '$4,500.00', hasFile: true }) === null, 'a fee typed with $ and commas is fine')

// ── the letter goes to the expediter ────────────────────────────────────────
const letter = permitEmailCopy({ permitType: 'Plans Review', job: '12 Main St', senderName: 'Sam', companyName: 'Acme GC', round: 1, fileWith: 'NYC DOB' })
ok(/for you to file with NYC DOB/.test(letter.lines[0]) && /documents to file/.test(letter.heading), 'Email it to an expediter asks them to file it, with whom')
const direct = permitEmailCopy({ permitType: 'Building', job: '12 Main St', senderName: 'Sam', companyName: 'Acme GC', round: 1 })
ok(!/to file/.test(direct.lines.join(' ')), '...and a letter straight to the township is unchanged')

// ── the survey ──────────────────────────────────────────────────────────────
ok((PLAN_TYPES as readonly string[]).includes('survey') && guessPlanType('Lot 7 Survey.pdf') === 'survey' && guessPlanType('C-101 grading.pdf') === 'civil',
  'the land survey is a Plans tab type, and a file called survey lands there')
ok(/plan_type IN \([^)]*'survey'/.test(readCombined()) && /'survey', 'other'/.test(read('supabase/migrations/167_permit_expediter.sql')),
  '...which the database allows, in the migration and the combined file')

// ── wiring ──────────────────────────────────────────────────────────────────
const hire = code('app/api/projects/[id]/permits/[permitId]/hire/route.ts')
ok(/requirePermission\(db, request, 'permits', 'edit'\)/.test(hire) && /actorCan\(gate\.actor, 'invoices', 'edit'\)/.test(hire) && /ownedProject\(/.test(hire),
  'hiring asks for permits AND the money permission a subcontract needs, on the caller\'s own job')
ok(/createSubcontract\(db,/.test(hire) && /existing_company_id: permit\.expediter_company_id/.test(hire) && /trade: EXPEDITER_TRADE/.test(hire)
  && /hireProblem\(\{ fee, hasFile \}\)/.test(hire),
  'the hire IS their subcontract - the row that puts the fee on the budget - for the expediter named on the permit, never one from the body')
const writes = code('lib/writes/permit.ts')
ok(/eq\('added_by_company_id', myCompanyId\)/.test(writes) && /'expediter_company_id',\n\] as const/.test(writes)
  && /expediterProblem\(db, fields\.expediter_company_id, myCompanyId\)/.test(writes) && /expediterProblem\(db, updates\.expediter_company_id, myCompanyId\)/.test(writes),
  'an expediter on a permit must be in the caller\'s own Directory, on create AND edit')
ok(/withExpediterFacts\(db, permits/.test(code('app/api/projects/[id]/permits/route.ts'))
  && /withExpediterFacts\(db, \(permits/.test(code('app/api/projects/[id]/permit-board/route.ts'))
  && /expediter_company_id'/.test(code('app/api/projects/[id]/permit-board/route.ts')),
  'the permits list and the development board read "hired" from the one loader')
const db = code('lib/permit-expediter-db.ts')
ok(/expediter_company_id: null, plans_pending: false/.test(db), 'a failed read says nothing about the expediter rather than "not hired"')
const email = code('app/api/projects/[id]/permits/[permitId]/email/route.ts')
ok(/viaExpediter\?\.found \?\? await suggestion\(/.test(email) && /fileWith: viaExpediter \?/.test(email) && /recipient_name: viaExpediter\?\.name \|\|/.test(email),
  'Email it starts on the expediter\'s address, says it is to file, and the link is addressed to them')
const panel = code('components/permits/permit-panel.tsx')
ok(/st\.stage === 'hire'/.test(panel) && /<HireExpediterDialog/.test(panel) && /sendStage && applyHow && !st\.via/.test(panel),
  'the panel offers the hire, and drops the township\'s "how to apply" card when the expediter files it')
const dialog = code('components/permits/hire-expediter-dialog.tsx')
ok(/hireProblem\(\{ fee, hasFile: !!file \}\)/.test(dialog) && /<ShareFilesModal/.test(dialog) && !/permitId=/.test(dialog),
  'the dialog asks the same rule, and the signed copy goes out on a Sharing link - not logged as a filing')
const page = code('app/(dashboard)/projects/[id]/permits/page.tsx')
ok((page.match(/<ExpediterField /g) ?? []).length === 2 && /Pick the expediter from your Directory/.test(page),
  'Add (I need to apply) and Edit both take the expediter, and a typed name that was never picked is answered, not dropped')
const picker = code('components/contact-picker.tsx')
ok(/isExpediterTrade\(c\.trade\)/.test(picker) && /trade: EXPEDITER_TRADE/.test(picker) && /expediters \? 'subcontractor'/.test(picker),
  'the picker lists expediters by trade, and one added there is a subcontractor with that trade - hiring makes it one')
ok(EXPEDITER_TRADE === 'Permit expediter', 'one spelling of the trade')

done()
