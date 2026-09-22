/**
 * AWARDING THE TRADE A PLACEHOLDER STANDS FOR.
 *
 * REPORTED: "placeholder links do not survive awarding (all 3 award paths)".
 * You add "Sheetrock, dates TBD" so other trades can depend on it, award the
 * real sub weeks later, and a SECOND line appears. The placeholder stays a
 * dead "no sub yet" row, every dependency still points at it, and because a
 * placeholder can never report progress, every gate behind it is shut for
 * ever. Nothing errors - the board quietly grows a twin.
 *
 * It also contradicts a published promise: `lib/whats-new.ts` says "when you
 * award the job to a real sub later, the link stays", and the Help article
 * repeats it.
 *
 * THE DANGEROUS FIX WOULD HAVE BEEN THE OBVIOUS ONE - merge automatically on
 * a matching trade name. A trade is free text on BOTH sides ("Elecric" is a
 * real spelling in this database), so a wrong merge silently rewires somebody
 * else's chain onto the wrong sub with nothing on screen to show it happened.
 * And a placeholder made through "My trade's not here" can never match
 * anything, so match-only would help the easy cases and abandon the ones that
 * needed it. The match is a SUGGESTION; the person confirms.
 */
import { ok, done, code, exists } from './_helpers'
import { adoptOffers, adoptProblem, adoptLinkPlan, isPlaceholder, isAwarded, type AdoptLine } from '../schedule-adopt'
import type { Dependency } from '../schedule-dependencies'

console.log('\n\x1b[1mschedule-adopt\x1b[0m')

function ph(id: string, trade: string): AdoptLine {
  return { id, trade, label: null, subcontract_id: null }
}
function sub(id: string, trade: string, subName = 'A Co'): AdoptLine {
  return { id, trade, label: null, subcontract_id: `sc-${id}`, subName }
}
function milestone(id: string, label: string): AdoptLine {
  return { id, trade: null, label, subcontract_id: null }
}

function dep(task: string, pred: string, id?: string): Dependency {
  return {
    id: id ?? `${task}<-${pred}`,
    task_id: task,
    predecessor_task_id: pred,
    min_predecessor_progress: null,
    lag_days: 0,
  }
}

// ── what a placeholder IS ───────────────────────────────────────────────────
{
  ok(isPlaceholder(ph('p1', 'Sheetrock')) === true, 'no sub + a trade of its own is a placeholder')
  ok(isPlaceholder(sub('s1', 'Sheetrock')) === false, 'a line with a sub is not')
  ok(isPlaceholder(milestone('m1', 'Substantial Completion')) === false,
    'A MILESTONE IS NOT A PLACEHOLDER: no sub and no trade means "Permits Approved", and there are 39 of those against 2 real placeholders')
  ok(isAwarded(sub('s1', 'Tile')) === true && isAwarded(ph('p1', 'Tile')) === false, 'awarded means it has a sub')
}

// ── the offer, and the suggestion ───────────────────────────────────────────
{
  const lines = [ph('p1', 'Tile'), sub('s1', 'Tile', 'QA Tile Co'), sub('s2', 'Framing'), milestone('m1', 'Done')]
  const deps = [dep('s2', 'p1')]
  const offers = adoptOffers(lines, deps)

  ok(offers.length === 1, 'the placeholder with something waiting on it is offered')
  ok(offers[0].dependentCount === 1, '...with the count of what waits on it, which is the reason to care')
  ok(offers[0].suggestedTargetId === 's1', 'the exact-trade line is SUGGESTED')
  ok(offers[0].targets[0].id === 's1' && offers[0].targets[0].suggested,
    '...and sorted first, marked as the suggestion')
  ok(offers[0].targets.length === 2,
    'EVERY awarded line is still offered - a custom trade name matches nothing, and that is the case that needed this')
  ok(!offers[0].targets.some(t => t.id === 'm1'),
    'a milestone is never a target - it has no sub to inherit')
}

// ── it never guesses ────────────────────────────────────────────────────────
{
  // Two lines on one trade is a real shape - rough-in and finish - and
  // picking either would be a guess about which phase was meant.
  const lines = [ph('p1', 'Electrical'), sub('s1', 'Electrical'), sub('s2', 'Electrical')]
  const offers = adoptOffers(lines, [dep('x', 'p1')])
  ok(offers[0].suggestedTargetId === null,
    'TWO exact matches is NOT a suggestion - which phase was meant is a guess')
  ok(offers[0].targets.length === 2, '...but both are still offered to pick from')
}
{
  const lines = [ph('p1', 'Elecric'), sub('s1', 'Electrical')]
  const offers = adoptOffers(lines, [dep('x', 'p1')])
  ok(offers[0].suggestedTargetId === null,
    'A NAME IS NOT A KEY: a near-miss spelling suggests NOTHING rather than the nearest guess')
  ok(offers[0].targets.length === 1, '...and the person can still pick it themselves')
}
{
  const lines = [ph('p1', ' tile '), sub('s1', 'Tile')]
  ok(adoptOffers(lines, [dep('x', 'p1')])[0].suggestedTargetId === 's1',
    'case and surrounding space do not stop an exact match - the same fold every other rule here uses')
}

// ── a placeholder nobody waits on is left alone ─────────────────────────────
{
  const lines = [ph('p1', 'Tile'), sub('s1', 'Tile')]
  ok(adoptOffers(lines, []).length === 0,
    'a placeholder with nothing waiting on it is tidying, not a bug - and a banner that fires on tidying stops being read')
}
{
  ok(adoptOffers([ph('p1', 'Tile')], [dep('x', 'p1')]).length === 0,
    'with nothing awarded there is nothing to offer')
}

// ── the refusals ────────────────────────────────────────────────────────────
{
  const p1 = ph('p1', 'Tile'), s1 = sub('s1', 'Tile'), m1 = milestone('m1', 'Done')
  ok(adoptProblem(p1, p1, []) !== null, 'a line cannot take its own place')
  ok(/milestone/i.test(adoptProblem(m1, s1, []) ?? ''), 'a milestone is refused, and told why')
  ok(/already has a sub/i.test(adoptProblem(s1, s1 , []) ?? '') || adoptProblem(s1, s1, []) !== null,
    'a line that already has a sub is not a placeholder')
  ok(adoptProblem(p1, m1, []) !== null, 'the target has to have a sub on it')
  ok(adoptProblem(undefined, s1, []) !== null, 'a placeholder that is gone is refused, not crashed on')
  ok(adoptProblem(p1, s1, []) === null, 'a clean pair is allowed')
}
{
  // Merging two lines that are linked TO EACH OTHER would leave a line
  // waiting on itself. Refused rather than silently dropping the link.
  const p1 = ph('p1', 'Tile'), s1 = sub('s1', 'Tile')
  const problem = adoptProblem(p1, s1, [dep('s1', 'p1')])
  ok(problem !== null && /waiting on itself/i.test(problem),
    'THE SELF-LOOP: merging two lines linked to each other is refused, and says which link to remove')
}
{
  // s1 waits on X, X waits on p1. Move p1's dependents onto s1 and X waits on
  // s1 which waits on X.
  const p1 = ph('p1', 'Tile'), s1 = sub('s1', 'Tile')
  const deps = [dep('x', 'p1'), dep('s1', 'x')]
  const problem = adoptProblem(p1, s1, deps)
  ok(problem !== null && /loop/i.test(problem),
    'A LOOP ONE STEP OUT is caught too, and named - "circular dependency" tells nobody which link to cut')
}

// ── the link plan ───────────────────────────────────────────────────────────
{
  const deps = [dep('a', 'p1'), dep('b', 'p1'), dep('p1', 'z')]
  const plan = adoptLinkPlan('p1', 's1', deps)
  ok(plan.move.length === 2, 'every line waiting on the placeholder is moved')
  ok(!plan.move.includes('p1<-z'), "...and the placeholder's OWN link is not one of them")
}
{
  // `a` already waits on the real line AND on its stand-in. The unique index
  // on (task_id, predecessor_task_id) would refuse the move.
  const deps = [dep('a', 'p1'), dep('a', 's1')]
  const plan = adoptLinkPlan('p1', 's1', deps)
  ok(plan.move.length === 0 && plan.dropAsDuplicate.length === 1,
    'THE UNIQUE INDEX: a line already waiting on the real work keeps that link, and the duplicate is dropped rather than colliding')
}
{
  // The target itself waited on the placeholder - that link becomes a self
  // link and cannot survive.
  const plan = adoptLinkPlan('p1', 's1', [dep('s1', 'p1')])
  ok(plan.move.length === 0 && plan.dropAsDuplicate.includes('s1<-p1'),
    'a link from the target to the placeholder is never moved onto itself')
}

// ── THE ORDER OF THE WRITES, which is the whole route ───────────────────────
{
  const route = code('app/api/projects/[id]/schedule/[itemId]/adopt/route.ts')
  ok(exists('app/api/projects/[id]/schedule/[itemId]/adopt/route.ts'), 'the route exists')

  const movedAt = route.indexOf("predecessor_task_id: targetId")
  const deletedAt = route.indexOf("from('schedule_items')\n    .delete()")
  ok(movedAt > -1 && deletedAt > -1, 'it both moves the links and removes the placeholder')
  ok(movedAt < deletedAt,
    'THE ONE THAT WOULD DESTROY THE LINKS: `predecessor_task_id` is ON DELETE CASCADE, so the move MUST come before the delete - the other order wipes every dependency silently')

  ok(/adoptProblem\(/.test(route),
    'the route asks the same refusals the screen does - a server answer can only arrive as a whole request that did not happen')
  ok(/requirePermission\([\s\S]{0,60}'schedule',\s*'edit'\)/.test(route), 'and it is gated on schedule edit')
}

// ── the screen asks, it does not assume ─────────────────────────────────────
{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/<AdoptBanner/.test(page) && /<AdoptDialog/.test(page),
    'the schedule page renders the banner AND the dialog, not merely imports them')
  ok(/adoptOffers\(/.test(page), '...and works out the offers with the shared rule')

  const dialog = code('components/schedule/adopt-placeholder.tsx')
  ok(/-- Select --/.test(dialog),
    'the picker starts EMPTY - a select that starts on a value cannot fail its own required check')
  ok(/setProblem\('Pick the line/.test(dialog),
    'and pressing it with nothing picked ANSWERS rather than doing nothing - a disabled button explains nothing')

  // Nothing anywhere merges without being told to.
  const all = page + dialog + code('lib/schedule-adopt.ts')
  ok(!/auto.?adopt|autoMerge/i.test(all), 'nothing merges automatically')
}

done()
