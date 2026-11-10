// ─────────────────────────────────────────────────────────────────────────────
// The two morning permit reminders, as rules. Pure: the cron
// (app/api/cron/permit-reminders) reads, asks these, claims, then notifies.
//
// "Chase" was on the screen only, so a permit the township sat on was found by
// whoever happened to open the Permits tab. And an issued permit's expiry was
// noticed when the panel already read Renew - after the date, which is too
// late to renew without a stop.
//
// THE CHASE RULE IS THE SCREEN'S RULE. Whether a permit needs chasing is
// `permitStage(...).chase` - the same answer that paints the orange Chase on
// the row - so the morning message and the list can never disagree about
// which permits are overdue.
//
// IT KEEPS ASKING UNTIL SOMEBODY ACTS - "if i dont follow up with an expiring
// permit, will it keep reminding?" The first version said once and fell
// silent. A chase now repeats every CHASE_REPEAT_DAYS while the submission is
// still unanswered (permit_rounds.chase_reminded_at is the LAST reminder). An
// expiring permit is warned at each step in EXPIRY_STEPS - 30 days, 7 days,
// and once it has expired - each step once (permits.expiry_reminder_stage, for
// permits.expiry_reminder_for). Recording the answer, renewing (the expiry
// date moves) or closing the permit out is what stops it.
// ─────────────────────────────────────────────────────────────────────────────

import { daysBetween, permitStage, type PermitFactsForStage, type PermitItem, type PermitRound } from './permit-rounds'
import { dayWords } from './dates'

/** The steps an expiring permit is warned at: days before expiry, then -1 = expired. */
export const EXPIRY_STEPS = [30, 7, -1] as const
/** The earliest a warning goes - the first step. */
export const EXPIRY_WARN_DAYS = EXPIRY_STEPS[0]
/** An expired permit is reminded only this soon after the date - not one that lapsed last year. */
export const EXPIRED_GRACE_DAYS = 7
/** An unanswered submission is chased again this often. */
export const CHASE_REPEAT_DAYS = 7

export interface ReminderPermit extends PermitFactsForStage {
  id: string
  project_id: string
  permit_type: string
  permit_number?: string | null
  expiry_reminder_for?: string | null
  expiry_reminder_stage?: number | null
}

/**
 * The open round to chase today, or null. Null when the permit is not with the
 * township, is not overdue by the screen's own rule, or this round was chased
 * less than CHASE_REPEAT_DAYS ago - it is asked again weekly, never daily.
 */
export function roundToChase(
  permit: ReminderPermit,
  rounds: (PermitRound & { chase_reminded_at?: string | null })[],
  items: PermitItem[],
  today: string,
): (PermitRound & { chase_reminded_at?: string | null }) | null {
  const st = permitStage(permit, rounds, items, today)
  if (!st.chase || !st.waiting) return null
  const round = rounds.find(r => r.id === st.waiting!.id)
  if (!round) return null
  const last = round.chase_reminded_at ? String(round.chase_reminded_at).slice(0, 10) : null
  return !last || daysBetween(last, today) >= CHASE_REPEAT_DAYS ? round : null
}

/** The cutoff the claim compares against: a reminder before this day is due again. */
export function chaseCutoff(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`) - (CHASE_REPEAT_DAYS - 1) * 86_400_000
  return new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z'
}

/** The step an expiry `days` away falls in, or null outside every step. */
export function expiryStep(days: number): number | null {
  if (days < 0) return days >= -EXPIRED_GRACE_DAYS ? -1 : null
  for (const step of [...EXPIRY_STEPS].filter(x => x >= 0).sort((x, y) => x - y)) if (days <= step) return step
  return null
}

/**
 * The expiry warning due today, or null. Due when the permit is issued (or
 * has just lapsed - the panel says Renew), sits inside a step, and that step
 * has not been sent for THIS expiry date. A step already passed is not sent
 * late: a permit first seen 5 days out gets the 7-day warning, not the 30.
 */
export function expiryDue(
  permit: ReminderPermit,
  rounds: PermitRound[],
  items: PermitItem[],
  today: string,
): { step: number; days: number } | null {
  if (!permit.expiry_date) return null
  const stage = permitStage(permit, rounds, items, today).stage
  if (stage !== 'issued' && stage !== 'renew') return null
  const days = daysBetween(today, permit.expiry_date)
  const step = expiryStep(days)
  if (step === null) return null
  const sentForThisDate = permit.expiry_reminder_for === permit.expiry_date && permit.expiry_reminder_stage != null
  if (sentForThisDate && permit.expiry_reminder_stage! <= step) return null
  return { step, days }
}

export interface ChaseLine { permitType: string; job: string; authority: string | null; days: number }

/** One morning message per company, however many permits are overdue. */
export function chaseMessage(lines: ChaseLine[]): { title: string; message: string } {
  const n = lines.length
  const one = (l: ChaseLine) => `${l.permitType} at ${l.job} - ${l.days} day${l.days === 1 ? '' : 's'} with ${l.authority?.trim() || 'the township'}`
  const shown = lines.slice(0, 5).map(one)
  const more = n > 5 ? ` and ${n - 5} more` : ''
  return {
    title: n === 1 ? 'A permit to chase' : `${n} permits to chase`,
    message: n === 1
      ? `${one(lines[0])}. Time to follow up.`
      : `${shown.join('; ')}${more}. Time to follow up.`,
  }
}

/** "Building permit #BP-1 at 3 Test Lane expires Fri Dec 4 - in 24 days." */
export function expiryMessage(p: { permitType: string; permitNumber?: string | null; job: string; expiry: string; days: number; authority?: string | null }): { title: string; message: string } {
  const when = dayWords(p.expiry, { weekday: true }) ?? p.expiry
  const name = `${p.permitType} permit${p.permitNumber ? ` #${p.permitNumber}` : ''} at ${p.job}`
  const who = p.authority?.trim() ? ` with ${p.authority.trim()}` : ''
  if (p.days < 0) {
    return {
      title: 'Permit expired',
      message: `${name} expired on ${when}. Renew it${who} - work under an expired permit can be stopped.`,
    }
  }
  const left = p.days === 0 ? 'today' : `in ${p.days} day${p.days === 1 ? '' : 's'}`
  return {
    title: 'Permit expiring',
    message: `${name} expires ${when} - ${left}. Start the renewal${who} before it lapses.`,
  }
}
