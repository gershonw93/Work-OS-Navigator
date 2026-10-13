// Equipment that needs fixing. "by equipment to mark something that it needs
// repair, other than just taking it out, and when you put it back, you can
// mark needs repair".
//
// `status` already carried 'maintenance' and 'retired' and nothing anywhere
// could set either - a value the app reads with no control to write it. Needs
// repair is a FLAG beside the status, because a broken saw can still be on a
// job in somebody's hands.

import {
  repairActionProblem, checkoutProblem, checkInProblem, needsRepair, STATUS_LABEL, EVENT_FOR, EVENT_LABEL,
} from '../equipment-state'
import { ok, done, code } from './_helpers'

const shelf = { status: 'available', repair_needed_at: null }
const outBroken = { status: 'checked_out', repair_needed_at: '2026-10-10T12:00:00Z' }
const away = { status: 'maintenance', repair_needed_at: '2026-10-10T12:00:00Z' }
const gone = { status: 'retired', repair_needed_at: null }

// ── flagging is reporting, from anywhere it is in service ───────────────────
ok(repairActionProblem(shelf, 'flag', 'fence wobbles') === null, 'a tool on the shelf can be marked needs repair')
ok(repairActionProblem({ status: 'checked_out' }, 'flag', 'blade bent') === null, '...and so can one out on a job, WITHOUT checking it in - "other than just taking it out"')
ok(repairActionProblem(shelf, 'flag', '  ') !== null, '...but not without saying what is wrong')
ok(repairActionProblem(gone, 'flag', 'x') !== null, 'a retired tool is not reported broken')

// ── the flag does not move it ───────────────────────────────────────────────
// The body moved into lib/writes (shared with Claude); the route keeps the gate.
const route = code('app/api/equipment/[id]/repair/route.ts') + code('lib/writes/equipment-repair.ts')
const flagCase = route.slice(route.indexOf("case 'flag':"), route.indexOf("case 'repaired':"))
ok(flagCase.length > 0 && !/status/.test(flagCase), 'THE FLAG: reporting it broken does not change where it is')
ok(needsRepair(outBroken) && outBroken.status === 'checked_out', '...so "checked out" and "needs repair" are both true at once')

// ── the office's moves ──────────────────────────────────────────────────────
ok(repairActionProblem({ status: 'checked_out' }, 'send_out') !== null, 'it cannot be sent for repair while it is out on a job')
ok(repairActionProblem(shelf, 'send_out') === null, '...it can from the shelf')
ok(repairActionProblem(shelf, 'repaired') !== null, 'nothing to mark repaired on a tool nobody reported')
ok(repairActionProblem(outBroken, 'repaired') === null && repairActionProblem(away, 'repaired') === null, '...but a flagged one or one away being fixed can be')
ok(/if \(item\.status === 'maintenance'\) updates\.status = 'available'/.test(route), 'repaired puts it back on the shelf only if it was AWAY - a tool fixed on site stays with whoever has it')
ok(repairActionProblem({ status: 'checked_out' }, 'retire') !== null && repairActionProblem(shelf, 'retire') === null, 'retire only from the shelf')
ok(repairActionProblem(gone, 'reactivate') === null && repairActionProblem(shelf, 'reactivate') !== null, 'bring back only what is retired')
ok(/action === 'flag' \? 'create' : 'edit'/.test(route), 'reporting asks `create` (a worker can); deciding asks `edit`')

// ── the check-in asks what shape it came back in ────────────────────────────
ok(checkInProblem('ok', null) === null, 'THE RETURN: "good to go" needs nothing more')
ok(checkInProblem('needs_repair', '') !== null && checkInProblem('needs_repair', 'cord nicked') === null, '"needs repair" needs to say what is wrong')
const checkIn = code('app/api/equipment/[id]/assignment/route.ts') + code('lib/writes/equipment-assignment.ts')
ok(/return_condition: condition/.test(checkIn), 'the condition is stored on the check-in itself')
ok(/condition === 'needs_repair'/.test(checkIn) && /repair_needed_at: new Date/.test(checkIn), '...and a bad one raises the same flag the list does')
ok(/body\.condition === 'needs_repair' \? 'needs_repair' : 'ok'/.test(checkIn), 'an old caller with no body still checks in as it always did')

// ── a rule on one door is on the other ──────────────────────────────────────
ok(checkoutProblem(away) !== null && checkoutProblem(gone) !== null, 'a tool away being fixed or retired cannot be checked out')
ok(checkoutProblem({ ...shelf, repair_needed_at: 'x' }) === null, '...one merely flagged can - the screen warns, the person decides')
ok(/checkoutProblem\(equipment\)/.test(checkIn), 'the check-out ROUTE asks it too, not only the screen')
const page = code('app/(dashboard)/equipment/page.tsx')
ok(/needsRepair\(item\)/.test(page), 'the check-out dialog shows the repair note before anybody takes it')

// ── every move leaves a record, and status has one writer per move ──────────
for (const a of Object.keys(EVENT_FOR)) ok(!!EVENT_LABEL[EVENT_FOR[a as keyof typeof EVENT_FOR]], `the history can say "${a}" in words`)
ok(/equipment_events/.test(route), 'the repair route writes the event')
const list = code('app/api/equipment/route.ts') + code('lib/writes/equipment.ts')
ok(!/updates\.status/.test(list), 'the details PATCH no longer sets status, so nothing moves it without a record')
ok(STATUS_LABEL.maintenance === 'In for repair', '"maintenance" says what it means')

// ── the controls exist ──────────────────────────────────────────────────────
for (const action of ['flag', 'repaired', 'send_out', 'retire', 'reactivate']) {
  ok(new RegExp(`action: '${action}'`).test(page), `the screen has a control for ${action}`)
}

done()
