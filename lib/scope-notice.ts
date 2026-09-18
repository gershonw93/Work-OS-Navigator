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

/**
 * A DOCUMENT SENT WITH THE NOTICE.
 *
 * "an option there to select a file as well" - because the sentence that
 * matters is usually "here is the revised sheet", and a notice that describes
 * a drawing without carrying it sends the reader hunting for it.
 *
 * It is a LINK, not a file. A revised sheet is tens of megabytes and a mail
 * server will refuse it; every stored `file_url` in this app is signed for ten
 * years, so the letter carries the URL and a sub downloads it exactly the way
 * the Sharing tab's recipients already do.
 */
export interface NoticeAttachment {
  name: string
  url: string
}

/** At most this many, so one notice cannot become a document dump. */
export const MAX_NOTICE_FILES = 10

/**
 * Clean a list of attachments off a request body.
 *
 * ASKED BY THE ROUTE, because the browser sends this. A row with no name or no
 * URL is dropped rather than rendered as a blank link in somebody's inbox -
 * and a value that is present and WRONG is worse than one that is missing.
 */
export function cleanAttachments(raw: unknown): NoticeAttachment[] {
  if (!Array.isArray(raw)) return []
  const out: NoticeAttachment[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const name = String((item as any)?.name ?? '').trim()
    const url = String((item as any)?.url ?? '').trim()
    // Only a real web URL. A `javascript:` or `data:` string reaching an inbox
    // as a link the app vouched for is not a document.
    if (!name || !/^https?:\/\//i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ name, url })
    if (out.length >= MAX_NOTICE_FILES) break
  }
  return out
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
 * WHO CAN BE TOLD, and by which channel.
 *
 * "this should go to anyone via email - subs too" - and that is the whole point
 * of the feature restated. The first version only offered people with a SyteNav
 * account, because `notify()` works off user ids. But the electrician in the
 * story - the one whose rough-in heights are now wrong - is precisely the
 * person who does not have a login. AN ADDRESS IS ENOUGH.
 *
 * So there are two channels and the split is not cosmetic:
 *   - somebody with an ACCOUNT goes through `notify()`, which gives them the
 *     bell, their phone and their own email preference.
 *   - somebody with only an ADDRESS gets an email, full stop. They have no
 *     preferences to express and no bell to ring.
 *
 * ONE EVENT, ONE EMAIL: the two sets are disjoint by construction, so nobody
 * is both notified and emailed for the same notice.
 */
export interface NoticeRecipient {
  /** Stable id for the checkbox: a profile id, or `email:<address>`. */
  key: string
  name: string
  email: string | null
  /** Set when they have a SyteNav account. */
  profileId: string | null
  /** Where they came from, so the picker can say why they are on the list. */
  source: 'team' | 'subcontractor'
  role?: string | null
}

/** Reachable at all? An address is enough; a login is not required. */
export function canBeTold(r: { profileId?: string | null; email?: string | null }): boolean {
  return !!(r.profileId || String(r.email ?? '').trim())
}

/**
 * Split a chosen set into the two channels.
 *
 * An account wins: it carries the bell and the phone as well, and sending both
 * would be the duplicate letter the house rule forbids.
 */
export function splitChannels(chosen: NoticeRecipient[]): {
  notifyIds: string[]
  emailOnly: { name: string; email: string }[]
} {
  const notifyIds: string[] = []
  const emailOnly: { name: string; email: string }[] = []
  const seenEmail = new Set<string>()

  for (const r of chosen) {
    if (r.profileId) { notifyIds.push(r.profileId); continue }
    const email = String(r.email ?? '').trim()
    if (!email) continue
    const key = email.toLowerCase()
    // The same address can arrive twice - once off the job's team and once off
    // a subcontract. One notice, one letter.
    if (seenEmail.has(key)) continue
    seenEmail.add(key)
    emailOnly.push({ name: r.name, email })
  }
  return { notifyIds: Array.from(new Set(notifyIds)), emailOnly }
}

/**
 * The headline. Names the plan when there is one, because "scope changed" on
 * its own sends somebody looking through a job for what.
 */
export function scopeNoticeTitle(planName?: string | null): string {
  const name = String(planName ?? '').trim()
  return name ? `Plans changed: ${name}` : 'Scope changed on this job'
}

/**
 * A NOTICE, READ BACK OUT OF THE JOB HISTORY.
 *
 * The record of a broadcast is one `project_activity` row, and its `metadata`
 * carries the part that matters six weeks later - WHO was told and whether the
 * letter actually left. This turns that row into something a list can render.
 *
 * DEFENSIVE ON EVERY FIELD, because `metadata` is jsonb: nothing checks its
 * shape, rows written by an older version of the route are still in the table,
 * and a list that throws on one bad row shows none of the good ones.
 */
export interface NoticeRecord {
  id: string
  actorName: string
  message: string
  planName: string | null
  planId: string | null
  /** The names of everybody who was told, in the order they were picked. */
  told: string[]
  /** Named, not counted - "6 of 8" leaves somebody hunting for the two. */
  failed: string[]
  /** What went with it. The record is thinner than the letter without these. */
  files: NoticeAttachment[]
  sentAt: string
}

export function noticeRecord(row: any): NoticeRecord {
  const meta = (row?.metadata ?? {}) as Record<string, unknown>
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : []

  return {
    id: String(row?.id ?? ''),
    actorName: String(row?.actor_name ?? '').trim() || 'Someone',
    // The typed message is the point of the record. Falling back to the
    // history sentence keeps an older row readable rather than blank.
    message: String(meta.message ?? '').trim() || String(row?.message ?? '').trim(),
    planName: String(meta.plan_name ?? '').trim() || null,
    planId: String(meta.plan_id ?? '').trim() || null,
    told: list(meta.told),
    failed: list(meta.failed),
    // Read through the same cleaner the route writes with, so a row stored
    // before attachments existed reads as none rather than as undefined.
    files: cleanAttachments(meta.files),
    sentAt: String(row?.created_at ?? ''),
  }
}

/** How many people this notice actually reached. */
export function noticeReached(n: { told: string[]; failed: string[] }): number {
  return Math.max(0, n.told.length - n.failed.length)
}
