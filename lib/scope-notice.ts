/**
 * TELLING THE OTHER TRADES THAT SOMETHING MOVED.
 *
 * WHY IT EXISTS, in the words it was asked in: "a scope change in one trade
 * silently moves another trade's work. Concrete switches from one center pour
 * to floor-by-floor, the slab height changes half an inch, and now the
 * electrician's heights are off - and nobody told him."
 *
 * So it is NOT a messaging system. It is one act - say what changed, pick who
 * needs to know - attached to the plan it is about, riding the notification
 * machinery that already exists.
 */

export interface ScopeNoticeDraft {
  message?: string | null
  recipientIds?: (string | null | undefined)[] | null
}

/** The shortest a change can be described in and still be worth sending. */
export const MIN_SCOPE_MESSAGE = 8

/**
 * What is wrong with this notice, in the recipient's terms, or null.
 *
 * Asked by the DIALOG and by the ROUTE, because a server's answer can only ever
 * arrive as a message about a whole request that did not happen - and because
 * the field app posts to the same route. Same shape as `missingMilestone` and
 * `quickAddProblem`.
 */
export function scopeNoticeProblem(draft: ScopeNoticeDraft): string | null {
  const message = String(draft.message ?? '').trim()
  const to = (draft.recipientIds ?? []).filter(Boolean)

  if (!to.length) return 'Pick at least one person to tell.'
  if (!message) return 'Say what changed.'
  // A NOTICE THAT SAYS NOTHING IS WORSE THAN NO NOTICE: it spends the one bit
  // of attention this is for. "ok" or "." reaches a phone looking exactly like
  // the one that says the slab moved half an inch.
  if (message.length < MIN_SCOPE_MESSAGE) {
    return 'Say a bit more about what changed - the point is that the next trade can act on it.'
  }
  return null
}

/**
 * The headline. Names the plan when there is one, because "scope changed" on
 * its own sends somebody looking through a job for what.
 */
export function scopeNoticeTitle(planName?: string | null): string {
  const name = String(planName ?? '').trim()
  return name ? `Plans changed: ${name}` : 'Scope changed on this job'
}
