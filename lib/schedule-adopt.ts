import { findCycle, lineName, type Dependency } from './schedule-dependencies'

/**
 * AWARDING THE TRADE A PLACEHOLDER STANDS FOR.
 *
 * THE REPORT: "placeholder links do not survive awarding (all 3 award
 * paths)". You add "Sheetrock, dates TBD" so other trades can depend on it,
 * you award the real sub weeks later, and a SECOND line appears. The
 * placeholder stays a dead "no sub yet" row, every dependency still points at
 * it, and because a placeholder can never receive progress, every gate behind
 * it is shut for ever. Nothing errors. The board just quietly grows a twin.
 *
 * And it contradicts a published promise - `lib/whats-new.ts` says "when you
 * award the job to a real sub later, the link stays", and the Help article
 * repeats it. Same family as the clear-to-start letter: copy describing
 * something the code never did.
 *
 * IT ASKS RATHER THAN MATCHING. An automatic merge on an exact trade name
 * would be the obvious fix and the wrong one:
 *
 *   - A TRADE NAME IS NOT A KEY. It is free text on both sides - "Elecric" is
 *     a real spelling in this database - so the same reasoning that makes
 *     `inspector-link` and `geocode-match` refuse a fuzzy answer applies
 *     here, and the stakes are higher: a wrong merge silently rewires
 *     somebody else's chain onto the wrong sub, and there is no way to see
 *     that it happened.
 *   - A CUSTOM TRADE NAME CAN NEVER MATCH ANYTHING. The reporter found this:
 *     placeholders made through "My trade's not here" carry a name that is in
 *     no list, so a match-only fix helps exactly the cases that did not need
 *     it and abandons the ones that did.
 *
 * So the exact match is a SUGGESTION and the person confirms. Everything
 * else on the board is offered too, because the one the machine cannot name
 * is the one somebody had to type by hand.
 */

export interface AdoptLine {
  id: string
  /** The placeholder's own trade, or a sub line's trade off its subcontract. */
  trade?: string | null
  label?: string | null
  subcontract_id?: string | null
  /** The vendor's name, for a line that has one. */
  subName?: string | null
  start_date?: string | null
  end_date?: string | null
}

/**
 * A PLACEHOLDER IS A LINE WITH NO SUB AND A TRADE OF ITS OWN.
 *
 * That is the only distinction available, and it is the right one: #506 gave
 * placeholders a Trade box precisely because the trade is the only name a
 * placeholder has. A line with no sub and no trade is a MILESTONE - "Permits
 * Approved", "Substantial Completion" - and must never be offered for
 * adoption. On this database that is 39 rows against 2 real placeholders, so
 * getting it the wrong way round would bury the feature in noise.
 */
export function isPlaceholder(line: AdoptLine): boolean {
  return !line.subcontract_id && !!(line.trade ?? '').trim()
}

/** A line that could take a placeholder's place: it has a real vendor on it. */
export function isAwarded(line: AdoptLine): boolean {
  return !!line.subcontract_id
}

/** Trade names compared the way every other exact-match rule here compares. */
function fold(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface AdoptTarget {
  id: string
  name: string
  subName: string | null
  /** True when this is the exact-trade suggestion. */
  suggested: boolean
}

export interface AdoptOffer {
  placeholderId: string
  placeholderName: string
  placeholderTrade: string
  /** How many lines wait on this placeholder. The reason to care. */
  dependentCount: number
  /** Every awarded line, suggestion first. */
  targets: AdoptTarget[]
  /** The exact-trade match, when there is exactly ONE. */
  suggestedTargetId: string | null
}

/**
 * Which placeholders are worth asking about, and what they could become.
 *
 * A placeholder with nothing waiting on it is left alone: adopting it would
 * be tidying, and a banner that fires on tidying is a banner people stop
 * reading. The whole cost of this bug is dependents pointing at a line that
 * can never progress.
 */
export function adoptOffers(lines: AdoptLine[], deps: Dependency[]): AdoptOffer[] {
  const placeholders = lines.filter(isPlaceholder)
  if (!placeholders.length) return []

  const awarded = lines.filter(isAwarded)
  if (!awarded.length) return []

  const offers: AdoptOffer[] = []
  for (const p of placeholders) {
    const dependentCount = deps.filter(d => d.predecessor_task_id === p.id).length
    if (!dependentCount) continue

    // EXACTLY ONE exact match is a suggestion; two is not. Two lines on one
    // trade is a real shape - Electrical rough-in and Electrical finish - and
    // picking either would be a guess about which phase was meant.
    const exact = awarded.filter(a => fold(a.trade) === fold(p.trade) && fold(p.trade) !== '')
    const suggestedTargetId = exact.length === 1 ? exact[0].id : null

    const targets: AdoptTarget[] = awarded
      .map(a => ({
        id: a.id,
        name: lineName(a),
        subName: a.subName ?? null,
        suggested: a.id === suggestedTargetId,
      }))
      .sort((x, y) => Number(y.suggested) - Number(x.suggested))

    offers.push({
      placeholderId: p.id,
      placeholderName: lineName(p),
      placeholderTrade: (p.trade ?? '').trim(),
      dependentCount,
      targets,
      suggestedTargetId,
    })
  }
  return offers
}

/**
 * Why this pair may not be merged, or null.
 *
 * Asked by the SCREEN and by the route - the `quickAddProblem` pattern. The
 * guard on the way in stops the next one; the guard on the route covers a
 * body somebody else composed.
 */
export function adoptProblem(
  placeholder: AdoptLine | undefined,
  target: AdoptLine | undefined,
  deps: Dependency[] = [],
): string | null {
  if (!placeholder) return 'That placeholder is no longer on this schedule.'
  if (!target) return 'That line is no longer on this schedule.'
  if (placeholder.id === target.id) return 'A line cannot take its own place.'
  if (!isPlaceholder(placeholder)) {
    return isAwarded(placeholder)
      ? 'That line already has a sub on it, so it is not a placeholder.'
      : 'That is a milestone, not a placeholder standing in for a trade.'
  }
  if (!isAwarded(target)) return 'Pick a line that has a sub awarded on it.'

  // THE TWO ARE LINKED TO EACH OTHER. Merging them would leave a line waiting
  // on itself - which `findCycle` refuses everywhere else, so it is refused
  // here rather than quietly dropped. Dropping it would be a link the person
  // wrote disappearing with no mention.
  const between = deps.some(d =>
    (d.task_id === placeholder.id && d.predecessor_task_id === target.id)
    || (d.task_id === target.id && d.predecessor_task_id === placeholder.id))
  if (between) {
    return `${lineName(target)} and ${lineName(placeholder)} are linked to each other, so merging them would leave a line waiting on itself. Remove that link first.`
  }

  // And the same check one step out: every line that waits on the placeholder
  // is about to wait on the target instead.
  for (const d of deps.filter(x => x.predecessor_task_id === placeholder.id)) {
    if (d.task_id === target.id) continue
    const loop = findCycle(deps, d.task_id, target.id, [])
    if (loop) {
      return `Moving those links onto ${lineName(target)} would create a loop. ${loop.message}`
    }
  }

  return null
}

/**
 * The links to move, and the ones to drop because they would duplicate.
 *
 * `schedule_dependencies` carries a unique index on (task_id,
 * predecessor_task_id) - the real guard against a double press - so a line
 * that ALREADY waits on the target and also waits on the placeholder would
 * collide on the move. That is not an error; it is the same statement twice,
 * and the survivor is the one already pointing at the real line.
 */
export function adoptLinkPlan(
  placeholderId: string,
  targetId: string,
  deps: Dependency[],
): { move: string[]; dropAsDuplicate: string[] } {
  const move: string[] = []
  const dropAsDuplicate: string[] = []
  const alreadyOnTarget = new Set(
    deps.filter(d => d.predecessor_task_id === targetId).map(d => d.task_id),
  )
  for (const d of deps.filter(x => x.predecessor_task_id === placeholderId)) {
    if (!d.id) continue
    if (d.task_id === targetId || alreadyOnTarget.has(d.task_id)) dropAsDuplicate.push(d.id)
    else move.push(d.id)
  }
  return { move, dropAsDuplicate }
}
