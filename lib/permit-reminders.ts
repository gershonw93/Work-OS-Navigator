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
// ONCE EACH, AND IT RE-ARMS ON ITS OWN. A chase goes once per SUBMISSION
// (permit_rounds.chase_reminded_at); a resubmission is a new round and can be
// chased again. An expiry warning goes once per EXPIRY DATE
// (permits.expiry_reminder_for); renewing moves the date, which re-arms it.
// ─────────────────────────────────────────────────────────────────────────────

import { daysBetween, permitStage, type PermitFactsForStage, type PermitItem, type PermitRound } from './permit-rounds'
import { dayWords } from './dates'

/** An issued permit is warned about this many days before it expires. */
export const EXPIRY_WARN_DAYS = 30

export interface ReminderPermit extends PermitFactsForStage {
  id: string
  project_id: string
  permit_type: string
  permit_number?: string | null
  expiry_reminder_for?: string | null
}

/**
 * The open round to chase today, or null. Null when the permit is not with the
 * township, is not overdue by the screen's own rule, or this round has
 * already been chased.
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
  return round && !round.chase_reminded_at ? round : null
}

/**
 * Days until expiry when an ISSUED permit is inside the warning window and has
 * not been warned about for this expiry date yet; otherwise null. A closed
 * permit, one already past its date (the panel says Renew), and one with no
 * expiry say nothing.
 */
export function expiryWarningDays(
  permit: ReminderPermit,
  rounds: PermitRound[],
  items: PermitItem[],
  today: string,
): number | null {
  if (!permit.expiry_date) return null
  if (permit.expiry_reminder_for && permit.expiry_reminder_for === permit.expiry_date) return null
  if (permitStage(permit, rounds, items, today).stage !== 'issued') return null
  const days = daysBetween(today, permit.expiry_date)
  return days >= 0 && days <= EXPIRY_WARN_DAYS ? days : null
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
  const left = p.days === 0 ? 'today' : `in ${p.days} day${p.days === 1 ? '' : 's'}`
  const who = p.authority?.trim() ? ` with ${p.authority.trim()}` : ''
  return {
    title: 'Permit expiring',
    message: `${p.permitType} permit${p.permitNumber ? ` #${p.permitNumber}` : ''} at ${p.job} expires ${when} - ${left}. Start the renewal${who} before it lapses.`,
  }
}
