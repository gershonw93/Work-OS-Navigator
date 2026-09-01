// ─────────────────────────────────────────────────────────────────────────────
// Who may remove whom, and who may change whose role.
//
// THE BUG. All admins were equal, so an admin invited into a company could
// remove or demote the person who created it. The member route refused
// self-removal and self-demotion - which means the one person it protected an
// admin from was that same admin. Everybody else, founder included, was two
// clicks away from gone.
//
// Not hypothetical: Sunshine Construction has three admins on live data, and
// any of them could remove the other two.
//
// Pure, and separate from the route, because these are the rules that decide
// whether somebody loses their account. Rules that need a running server to
// test are rules nobody tests.
// ─────────────────────────────────────────────────────────────────────────────

export type Decision = { ok: true } | { ok: false; error: string }

const allow: Decision = { ok: true }
const refuse = (error: string): Decision => ({ ok: false, error })

export interface MemberContext {
  /** The signed-in person making the request. */
  callerId: string
  callerRole: string
  /** The person being removed or changed. */
  targetId: string
  targetRole: string
  /** The company's owner, from companies.owner_id. */
  ownerId: string | null
  /**
   * Whether ownerId is actually KNOWN.
   *
   * False when the owner column could not be read - migration 094 not applied,
   * or the query failed. It is not the same as "there is no owner", and
   * collapsing the two is how this protection would quietly not exist. Every
   * rule below treats an unknown owner as a reason to refuse, never as
   * permission.
   */
  ownerKnown: boolean
}

/** Shared by both rules: an admin-on-admin action we cannot verify is refused. */
function ownerGuard(c: MemberContext, verb: string): Decision | null {
  if (c.ownerKnown) {
    if (c.targetId === c.ownerId) {
      return refuse(
        `${verb} the account owner is not possible. Ownership has to be transferred first, and only the owner can do that.`,
      )
    }
    return null
  }
  // Owner unknown. Anyone might be the owner, so the only safe answer for an
  // action against another admin is no. Named precisely, because "Forbidden"
  // on a database migration would send somebody hunting through permissions.
  if (c.targetRole === 'admin') {
    return refuse(
      'Owner protection is not set up on this database yet, so one admin cannot act on another. Apply migration 094 and try again.',
    )
  }
  return null
}

/**
 * May the caller remove this member?
 *
 * Self-removal stays refused - it was already, and it is what stops a company
 * being left with nobody who can administer it.
 */
export function mayRemoveMember(c: MemberContext): Decision {
  if (c.callerRole !== 'admin') return refuse('Only an admin can remove somebody.')
  if (c.targetId === c.callerId) return refuse('You cannot remove yourself.')
  return ownerGuard(c, 'Removing') ?? allow
}

/** May the caller change this member's role? */
export function mayChangeRole(c: MemberContext): Decision {
  if (c.callerRole !== 'admin') return refuse('Only an admin can change a role.')
  if (c.targetId === c.callerId) return refuse('You cannot change your own role.')
  return ownerGuard(c, 'Changing the role of') ?? allow
}

/**
 * May the caller hand ownership to this member?
 *
 * Only the owner, and only to an admin. Ownership carries the ability to
 * remove every other admin, so it does not go to somebody who does not already
 * hold administrative access - that would be a promotion and a transfer at
 * once, from one click.
 */
export function mayTransferOwnership(c: MemberContext): Decision {
  if (!c.ownerKnown) {
    return refuse('Owner protection is not set up on this database yet. Apply migration 094 and try again.')
  }
  if (c.callerId !== c.ownerId) return refuse('Only the current owner can hand over ownership.')
  if (c.targetId === c.callerId) return refuse('You already own this account.')
  if (c.targetRole !== 'admin') {
    return refuse('Ownership can only go to an admin. Make them an admin first.')
  }
  return allow
}
