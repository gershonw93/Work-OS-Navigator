import { pctLabel } from './schedule-dependencies'

/**
 * EVERY SENTENCE A LINK PRODUCES, IN ONE PLACE.
 *
 * The picker writes one ("After Framing hits 80%, plus 2 days"), the review
 * screen writes another ("waits on Framing at 80%"), and a third says why a
 * line is sitting still. Three files, three wordings of one fact - which is
 * how the review came to print "waits on Sheetrock" for an 80% link and for a
 * plain one, so two rows under different conditions read identically and the
 * screen could not be used to check what it was showing.
 *
 * AND A DELIVERY IS NOT A TRADE. "After ACME Supply" is the wrong sentence for
 * a pallet of windows; it either lands or it does not. Same fact, different
 * words, so the kind travels with the name.
 */

/** What a schedule line IS. A delivery behaves differently from work. */
export type LineKind = 'work' | 'delivery' | 'milestone'

export interface GateWords {
  /** The percent the predecessor must reach. Null for a plain link. */
  pct?: number | string | null
  /** Clear days after the predecessor ends. */
  lagDays?: number | null
}

/**
 * A DELIVERY CANNOT BE 40% DONE, SO IT MUST NOT BE OFFERED A PERCENT.
 *
 * This is the mirror of the gate bug the `toPct` rule is written about. A
 * delivery line has no subcontract progress to roll up and nobody types a
 * percent on one, so `lineProgress` answers `unknown` for ever - and an
 * unknown predecessor BLOCKS, deliberately, because a wrong "go" puts a crew
 * on a site. Put an 80% gate on a delivery and you get a gate that can never
 * open, which looks exactly like a gate that is working.
 *
 * Asked by the PICKER and by `POST .../dependencies`, the `quickAddProblem`
 * pattern: the guard on the way in stops the next one, the guard on the route
 * covers the ones a script could write.
 *
 * NOT A DATABASE CONSTRAINT, and that is not an oversight - the kind lives on
 * `companies.type`, two joins away from `schedule_dependencies`, where a CHECK
 * cannot see it.
 */
export function deliveryGateProblem(
  predecessorKind: LineKind,
  pct: number | string | null | undefined,
): string | null {
  if (predecessorKind !== 'delivery') return null
  if (pct == null || pct === '') return null
  return 'A delivery either arrives or it does not - there is no percent on one. Leave that blank.'
}

/**
 * The picker's sentence: what this link says, read back.
 *
 * WRITTEN THE WAY A GC SAYS IT. "Depends on another trade?" was correct
 * English and the wrong language; this is the same rule one field along.
 */
export function linkSentence(x: {
  predecessorName: string
  predecessorKind: LineKind
  gate?: GateWords | null
}): string {
  const pct = pctLabel(x.gate?.pct ?? null)
  const lag = Number(x.gate?.lagDays ?? 0)

  const head = x.predecessorKind === 'delivery'
    ? `Once the ${x.predecessorName} delivery lands`
    : pct != null
      ? `After ${x.predecessorName} hits ${pct}%`
      : `After ${x.predecessorName}`

  if (lag > 0) return `${head}, plus ${lag} ${lag === 1 ? 'day' : 'days'}`
  return head
}
