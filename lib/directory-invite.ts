// Who in the Directory can still be invited to SyteNav, and what a batch of
// invites came to.
//
// WHY THIS EXISTS. Every card that was not on the platform carried its own
// "Invite to Platform" button - twenty-two identical buttons on the demo
// company's Subs tab, the loudest thing on every card, for an action most
// people take once. It is one action about the whole list, so it is ONE
// control at the top that says how many it covers; a single card's invite
// lives in that card's row menu.
//
// Pure, so the count on the button and the list in the dialog cannot disagree:
// both are this function's answer.

export interface InviteCandidate {
  id: string
  name: string
  contact_email: string | null
  has_account: boolean
  /** A vendor invite is already out and has not been accepted. */
  invite_pending?: boolean
}

export interface Invitable<T extends InviteCandidate> {
  /** Not on SyteNav, not invited yet, and there is an address to write to. */
  ready: T[]
  /** Not on SyteNav, but nowhere to send it - named, never silently dropped. */
  noEmail: T[]
}

/**
 * Split the contacts that are NOT on SyteNav into the ones an invite can go to
 * and the ones it cannot. Somebody already on the platform, or already
 * invited (on the row, or in this session), is in neither: the aggregate is
 * for people nobody has asked yet, and a resend is a per-card decision.
 */
export function invitable<T extends InviteCandidate>(
  companies: T[],
  invitedThisSession: readonly string[] = [],
): Invitable<T> {
  const ready: T[] = []
  const noEmail: T[] = []
  for (const c of companies) {
    if (c.has_account || c.invite_pending || invitedThisSession.includes(c.id)) continue
    if ((c.contact_email ?? '').trim()) ready.push(c)
    else noEmail.push(c)
  }
  return { ready, noEmail }
}

/** One contact's answer from /api/invite, as the batch collected it. */
export interface InviteOutcome {
  id: string
  name: string
  /** `sent`: the email went. `recorded`: invite written, email did not go. */
  status: 'sent' | 'recorded' | 'failed'
  reason?: string
}

/**
 * What the batch came to, in one sentence plus the rows that need a person to
 * look at them. A batch that reported "Invites sent" over three that failed
 * would be the "Invited" tick that went out with nothing arriving, twenty times.
 */
export function inviteBatchSummary(outcomes: InviteOutcome[]): {
  tone: 'success' | 'warn' | 'danger'
  text: string
  problems: InviteOutcome[]
} {
  const sent = outcomes.filter(o => o.status === 'sent').length
  const problems = outcomes.filter(o => o.status !== 'sent')
  const n = (k: number) => `${k} invite${k === 1 ? '' : 's'}`
  if (!outcomes.length) return { tone: 'warn', text: 'Nobody was selected, so nothing was sent.', problems }
  if (!problems.length) return { tone: 'success', text: `${n(sent)} sent.`, problems }
  if (!sent) return { tone: 'danger', text: `None of the ${n(outcomes.length)} went out. The reason is beside each name.`, problems }
  return {
    tone: 'warn',
    text: `${n(sent)} sent, ${problems.length} did not. The reason is beside each name.`,
    problems,
  }
}
