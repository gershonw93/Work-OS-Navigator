/**
 * WHAT A DATE CHANGE WILL NOT DO, SAID OUT LOUD.
 *
 * THE REPORT: "will it actually push off anyone dependent?" On this database
 * the answer is usually no - 121 schedule lines across 26 jobs carry FIVE
 * links between them - and the screen said nothing about it. With no line to
 * move there was nothing to review, the review was skipped, and the save went
 * through in silence. A change that moves nobody looked exactly like a feature
 * that had not been deployed.
 *
 * Four cases, and the third one had never been stated anywhere:
 *   - nothing is linked to this line
 *   - a follower was hand-dated after it was linked, so it stays put
 *   - THIS line is dropping out of its own chain, permanently, because typing
 *     dates is what sets the flag `handEditWins` reads
 *   - the finish did not move, and the finish is what a follower waits on
 */
import { ok, done, code } from './_helpers'
import { changeWarning, type WarningInput } from '../schedule-change-warning'
import { linkSentence, deliveryGateProblem } from '../schedule-link-words'
import type { CascadeResult } from '../schedule-dependencies'

console.log('\n\x1b[1mschedule-warning\x1b[0m')

const EMPTY: CascadeResult = { moves: [], skipped: [] }

const LINE = {
  id: 'drywall',
  trade: 'Drywall',
  label: null,
  start_date: '2026-10-05',
  end_date: '2026-10-12',
}

function base(over: Partial<WarningInput> = {}): WarningInput {
  return {
    edited: LINE,
    newStart: '2026-10-08',
    newEnd: '2026-10-15',
    result: EMPTY,
    ownPredecessors: [],
    justLinked: false,
    hasDependents: false,
    ...over,
  }
}

// ── nothing is waiting on it ────────────────────────────────────────────────
{
  const w = changeWarning(base())
  ok(!w.silent, 'THE BUG: a change that moves nobody is no longer silent')
  ok(w.reasons.includes('nothing_linked'), '...and it says WHY nobody moves')
  ok(w.points.some(p => /Drywall/.test(p)), 'the line is named, not "this item"')
  ok(w.points.some(p => /link/i.test(p)),
    '...and it says what to do about it - "nobody moves" alone reads as a failure')
}

// ── nothing actually changed ────────────────────────────────────────────────
{
  const w = changeWarning(base({ newStart: LINE.start_date, newEnd: LINE.end_date }))
  ok(w.silent, 'a save that moves no date warns about nothing')
  ok(w.title === null, '...and carries no headline to render')
}
{
  // A label-only edit on a linked line is the commonest save of all. A warning
  // on every one of them teaches people to click through it, which costs the
  // warnings that matter.
  const w = changeWarning(base({
    newStart: LINE.start_date, newEnd: LINE.end_date,
    hasDependents: true,
    ownPredecessors: [{ dep: { task_id: 'drywall', predecessor_task_id: 'e' }, predecessor: { id: 'e', trade: 'Electrical', label: null } }],
  }))
  ok(w.silent, 'THE TRAP: a label edit on a linked line warns about nothing')
}

// ── the finish is what a follower waits on ──────────────────────────────────
{
  const w = changeWarning(base({
    newStart: '2026-10-07', newEnd: LINE.end_date, hasDependents: true,
  }))
  ok(w.reasons.includes('end_unchanged'),
    'a start-only edit says nothing behind it moves')
  ok(!w.reasons.includes('nothing_linked'),
    '...and does NOT claim nothing is linked, because something is')
  ok(w.points.some(p => /FINISH/.test(p)), 'and says which date a follower watches')
}

// ── a follower pinned by hand ───────────────────────────────────────────────
{
  const pinnedOnly: CascadeResult = {
    moves: [],
    skipped: [{ id: 'paint', reason: 'manually_overridden', becauseOf: 'drywall', link: 'direct', gate: null }],
  }
  const w = changeWarning(base({ result: pinnedOnly, hasDependents: true }))
  ok(w.reasons.includes('all_pinned'), 'everything waiting is pinned, and it says so')
  ok(!w.reasons.includes('nothing_linked'),
    'THE WRONG SENTENCE: a job whose links are all pinned is not a job with no links')
}
{
  const mixed: CascadeResult = {
    moves: [{
      id: 'tile', from: { start: '2026-10-13', end: '2026-10-20' },
      to: { start: '2026-10-16', end: '2026-10-23' },
      shiftDays: 3, becauseOf: 'drywall', link: 'direct', gate: null,
    }],
    skipped: [{ id: 'paint', reason: 'manually_overridden', becauseOf: 'drywall', link: 'direct', gate: null }],
  }
  const w = changeWarning(base({ result: mixed, hasDependents: true }))
  ok(w.reasons.includes('some_pinned') && !w.reasons.includes('all_pinned'),
    'some move and some are pinned - two different sentences')
}
{
  // `no_shift` and `chain_stopped` are normal reporting, not warnings. The
  // review screen already words them; repeating them at the top would make the
  // warning box the same list twice.
  const other: CascadeResult = {
    moves: [],
    skipped: [{ id: 'paint', reason: 'no_shift', becauseOf: 'drywall', link: 'direct', gate: null }],
  }
  const w = changeWarning(base({ result: other, hasDependents: true }))
  ok(!w.reasons.includes('all_pinned'),
    'only a HAND-DATED skip is a warning - the other two reasons the review already words')
}

// ── THE INVISIBLE ONE: this line drops out of its own chain ─────────────────
{
  const follows = [{
    dep: { task_id: 'drywall', predecessor_task_id: 'electrical' },
    predecessor: { id: 'electrical', trade: 'Electrical', label: null },
  }]
  const w = changeWarning(base({ ownPredecessors: follows, hasDependents: true }))
  ok(w.reasons.includes('self_unpins'),
    'THE BUG NOTHING HAS EVER SAID: typing dates takes this line out of its own chain')
  ok(w.points.some(p => /Electrical/.test(p)),
    '...and names what it will stop following, not just that it will')
  ok(w.points.some(p => /again/i.test(p)),
    '...and that linking it again is the way back - otherwise it is permanent')
}
{
  // LINKING IS THE LATER WORD. A save that creates the link is not a save that
  // drops the line out of it, and saying so would be the opposite of true.
  const follows = [{
    dep: { task_id: 'drywall', predecessor_task_id: 'electrical' },
    predecessor: { id: 'electrical', trade: 'Electrical', label: null },
  }]
  const w = changeWarning(base({ ownPredecessors: follows, justLinked: true, hasDependents: true }))
  ok(!w.reasons.includes('self_unpins'),
    'THE TRAP: a save that CREATES the link must not warn that it is breaking one')
}

// ── the caller wiring ───────────────────────────────────────────────────────
{
  const route = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/changeWarning\(\{/.test(route), 'the ROUTE computes it, beside the moves')
  ok(/hasDependents: deps\.some\(d => d\.predecessor_task_id === itemId\)/.test(route),
    'hasDependents asks the LINKS, not the result - a job whose followers are all pinned is still linked')
  ok(/just_linked/.test(route), 'and the preview is told whether this save is creating a link')
  // The preview still writes nothing. A preview that wrote would make "Shift
  // silently" and "Cancel" the same button.
  ok(!/\.update\(|\.insert\(|\.delete\(/.test(route.split('export async function PUT')[0]),
    'the preview half still writes NOTHING')

  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/warning\.silent/.test(page), 'the page gates the skip on the warning, not on the move count')
  ok(/warning=\{pending\.warning\}/.test(page), 'and hands it to the review screen')

  const review = code('components/schedule/cascade-review.tsx')
  ok(/warning && !warning\.silent/.test(review), 'the review renders it')
  ok(review.indexOf('warning.points.map') < review.indexOf('moves.length > 0 && ('),
    '...FIRST, because on most jobs it is the only thing on the screen worth reading')
}

// ── A DELIVERY IS NOT A TRADE ───────────────────────────────────────────────
//
// Depending on a delivery already worked - a delivery is a `schedule_items` row
// on a supplier subcontract, and the picker never filtered them out. Three
// things were wrong around it, and the third is the one that bites.
{
  ok(linkSentence({ predecessorName: 'ACME Supply', predecessorKind: 'delivery' })
    === 'Once the ACME Supply delivery lands',
    'a delivery gets its own sentence - "After ACME Supply" is not how a pallet works')
  ok(linkSentence({ predecessorName: 'Framing', predecessorKind: 'work' }) === 'After Framing',
    '...and a trade still reads the way a GC says it')
  ok(linkSentence({ predecessorName: 'Framing', predecessorKind: 'work', gate: { pct: '80.00' } })
    === 'After Framing hits 80%',
    'THE NUMERIC TRAP: a percent off the column is "80.00" and must print as 80')
  ok(linkSentence({ predecessorName: 'ACME', predecessorKind: 'delivery', gate: { lagDays: 2 } })
    === 'Once the ACME delivery lands, plus 2 days',
    'lag still reads on a delivery - clear days after it lands is a real thing to want')

  // A GATE ON A DELIVERY CAN NEVER OPEN. Nothing sets a delivery's progress,
  // an unknown predecessor blocks, and a gate that never opens looks exactly
  // like one that is working.
  ok(deliveryGateProblem('delivery', 80) !== null,
    'THE BUG: a percent gate on a delivery is refused')
  ok(deliveryGateProblem('delivery', null) === null,
    '...but a plain link to a delivery is fine - that is the whole feature')
  ok(deliveryGateProblem('delivery', '') === null, '...and an empty box is not a gate')
  ok(deliveryGateProblem('work', 80) === null, '...while a trade may still be gated')

  const picker = code('components/schedule/dependency-picker.tsx')
  ok(/deliveryGateProblem\(pickedKind, pct\)/.test(picker), 'the PICKER asks it')
  ok(/pickedIsDelivery \?/.test(picker),
    '...and does not even offer the box, so the refusal is not the first anyone hears of it')

  const deps = code('app/api/projects/[id]/schedule/[itemId]/dependencies/route.ts')
  ok(/deliveryGateProblem\(kind, minProgress\)/.test(deps),
    'and the ROUTE asks it too - the browser is what sends this')
  ok(/if \(minProgress != null\) \{/.test(deps),
    '...only when a percent is actually set, so the common link pays nothing for it')

  // A delivery line keeps its own name in the picker. `trade` winning would
  // hide "Delivery - ACME Supply" behind whatever was typed on the row.
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/isDelivery\(i\) \? getLabel\(i\)/.test(page),
    'a delivery keeps its own name in the picker rather than showing a bare trade')
  ok(/kind: isDelivery\(i\)/.test(page), '...and carries its kind with it')
  ok(/predecessorKind: kindOf\(d\.predecessor_task_id\)/.test(page),
    'a SAVED link reads the way a staged one does - one source for what a line is')
}

done()
