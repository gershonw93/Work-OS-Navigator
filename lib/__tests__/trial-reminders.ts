// THREE LETTERS BEFORE A TRIAL RUNS OUT, and the ways they quietly become none.
//
// The trial shipped with an in-app banner three days out and nothing else,
// which is the wrong place for this warning: the company most likely to lose
// its account is the one that has not opened the app this week, and a banner is
// invisible to exactly them.
//
// Everything in this suite is a way this feature can look finished and warn
// nobody: a rule with no cron behind it, a cron missing from vercel.json, a
// stamp that never clears, an audience pointed at the wrong permission, or a
// banner keeping its own idea of "soon" so the screen and the letter disagree.

import {
  trialWarning, trialCopy, TRIAL_WARNING_DAYS_LEFT, TRIAL_WARN_FROM, trialDayOf, type TrialRow,
} from '../trial-warning'
import { TRIAL_DAYS } from '../plans'
import { NOTIFICATION_TYPES } from '../notifications'
import { ok, done, code, read, readCombined } from './_helpers'

const NOW = new Date('2026-09-24T09:00:00Z')
/** A trial ending `n` days from NOW, at an hour already past, which is the awkward case. */
const endsIn = (n: number, extra: Partial<TrialRow> = {}): TrialRow => {
  const end = new Date(NOW)
  end.setDate(end.getDate() + n)
  end.setHours(3, 0, 0, 0)
  return { status: 'trialing', trial_ends_at: end.toISOString(), ...extra }
}

// ── the three days are the three that were asked for ────────────────────────
// Asked for as "12, 14 and 15" of a fifteen-day trial. Held as DAYS LEFT,
// because the platform console can extend a trial and "day 12" of an
// eighteen-day trial warns about nothing.
ok(TRIAL_WARNING_DAYS_LEFT.join(',') === '3,1,0', 'we write at three days left, one day left and on the last day')
ok(TRIAL_WARNING_DAYS_LEFT.map(d => trialDayOf(d)).join(',') === '12,14,15',
  `...which on a ${TRIAL_DAYS}-day trial is days 12, 14 and 15`)
ok(TRIAL_WARN_FROM === 3, 'and nothing is said before the first of them')

// ── when it fires ───────────────────────────────────────────────────────────
ok(trialWarning(endsIn(9), NOW) === null, 'a trial with nine days to run says nothing')
ok(trialWarning(endsIn(4), NOW) === null, 'nor one with four - the run-up starts at three')
const first = trialWarning(endsIn(3), NOW)
ok(first !== null && 'send' in first && first.send === 3, 'at three days left, the first letter goes')
ok(trialWarning(endsIn(2), NOW) === null,
  'and NOTHING at two days - the days asked for are 12, 14 and 15, not every day of the run-up')
const second = trialWarning(endsIn(1), NOW)
ok(second !== null && 'send' in second && second.send === 1, 'at one day left, the second')
const last = trialWarning(endsIn(0), NOW)
ok(last !== null && 'send' in last && last.send === 0, 'and on the last day, the third')

// A trial ending TODAY at 3am has not ended - the last day is a day you may
// still work, the same rule the lock itself follows.
ok(last !== null && 'send' in last, 'a trial ending today is warned about today, whatever the hour on the timestamp')

// PAST THE END, NOTHING. The account is locked by now and every screen says so;
// another email about it is a second letter about one event.
ok(trialWarning(endsIn(-1), NOW) === null, 'a trial that ended yesterday gets no further letter')
ok(trialWarning(endsIn(-40), NOW) === null, '...nor one that ended six weeks ago')

// ── the stamp: once per milestone, not once per morning ─────────────────────
// Without it this job writes to the same company three mornings running about
// the same deadline, which is how people learn to filter mail from us.
ok(trialWarning(endsIn(3, { trial_warned_days_left: 3 }), NOW) === null,
  'a company already written to at three days is not written to again that day')
const escalate = trialWarning(endsIn(1, { trial_warned_days_left: 3 }), NOW)
ok(escalate !== null && 'send' in escalate && escalate.send === 1,
  '...but IS written to when the next milestone arrives')
ok(trialWarning(endsIn(1, { trial_warned_days_left: 0 }), NOW) === null,
  'and a stamp only ever moves towards the deadline, never back')

// ── the stamp can un-stamp itself ───────────────────────────────────────────
// THE SILENT FAILURE THIS EXISTS FOR. Extending a trial moves the deadline and
// leaves a stamp about a date that no longer exists; since the milestones only
// count DOWN, that company would never be warned again, for the rest of its
// life, with nothing anywhere to say so.
const moved = trialWarning(endsIn(20, { trial_warned_days_left: 0 }), NOW)
ok(moved !== null && 'reset' in moved, 'a trial extended out of range clears its stamp')
ok(trialWarning(endsIn(20), NOW) === null,
  '...and a row with no stamp and no deadline near is left alone rather than written to every day')

// ── and only a trial ────────────────────────────────────────────────────────
ok(trialWarning({ status: 'comped', trial_ends_at: endsIn(1).trial_ends_at }, NOW) === null,
  'a company we comped is not warned about a trial it is not on')
ok(trialWarning({ status: 'active', trial_ends_at: endsIn(1).trial_ends_at }, NOW) === null,
  '...nor one that is paying')
ok(trialWarning({ status: 'trialing' }, NOW) === null, 'and a trial with no end date is not guessed at')

// ── what it says ────────────────────────────────────────────────────────────
ok(/3 days left/.test(trialCopy(3).title), 'the three-day subject leads with the number')
ok(/tomorrow/.test(trialCopy(1).title), 'the one-day subject says tomorrow')
ok(/ends today/.test(trialCopy(0).title), 'and the last one says today')
// EVERY ONE SAYS WHAT WILL HAPPEN AND THAT NOTHING IS LOST. This is the letter
// somebody reads while deciding whether to act, and "your trial is expiring" on
// its own reads like a threat to delete their jobs.
for (const d of TRIAL_WARNING_DAYS_LEFT) {
  const c = trialCopy(d)
  ok(c.title.length > 0 && c.message.length > 0, `${d} days left: there is copy for it`)
  ok(/Billing|plan/i.test(c.message), `${d} days left: it says where to go`)
}
ok(/nothing is deleted/i.test(trialCopy(0).message) && /read-only/i.test(trialCopy(1).message),
  'the last two say plainly that nothing is deleted and the account goes read-only')
ok(!/expire/i.test(trialCopy(0).title + trialCopy(0).message),
  'and none of them says "expires", which reads as a threat to somebody\'s data')

// ═══════════════════════════════════════════════════════════════════════════
// THE WIRING. Every assertion above passes with no job behind any of it.
// ═══════════════════════════════════════════════════════════════════════════

// ── a deadline with no job behind it warns nobody ───────────────────────────
const cron = code('app/api/cron/trial-reminders/route.ts')
ok(/trialWarning\(/.test(cron), 'the job asks the shared rule rather than a second copy of it')
ok(/checkCronAuth/.test(cron), 'and checks its auth')
ok(cron.indexOf('checkCronAuth') < cron.indexOf("from('company_billing')"),
  '...BEFORE it reads anything')
// THE SILENT FAILURE: a route nothing calls. The inspection reminder suite
// learned to read vercel.json for exactly this reason.
const vercel = read('vercel.json')
ok(/\/api\/cron\/trial-reminders/.test(vercel), 'vercel.json actually schedules it')
const schedule = JSON.parse(vercel).crons.find((c: any) => c.path === '/api/cron/trial-reminders')
ok(!!schedule, 'the entry parses')
// Vercel cron is UTC and does not follow daylight saving. A job at 07:22 UTC is
// 3:22am where the crews are - which is what the inspection reminder shipped as.
const hour = Number(String(schedule.schedule).split(' ')[1])
ok(hour >= 10 && hour <= 14,
  `it runs in the American morning, not the middle of the night (hour ${hour} UTC)`)
ok(String(schedule.schedule).split(' ').slice(2).join(' ') === '* * *', 'and every day')

// ── it writes to the people who can act ─────────────────────────────────────
// A NOTIFICATION'S AUDIENCE IS THE PERMISSION FOR THE ACTION IT IS ASKING FOR.
// The inspection reminder got this wrong for a release: it routed "nobody has
// marked this ready" to the office permission for BOOKING a visit, telling
// everybody except the two people who could do anything about it.
const type = NOTIFICATION_TYPES.find(t => t.key === 'trial_ending')
ok(!!type, 'the type is in the catalog, so its audience is a setting somebody can change')
ok(type?.status === 'live', '...and live, not planned')
ok(type?.defaultAudience?.join(':') === 'settings_billing:edit',
  '...routed by the permission for choosing a plan, not for owning the company record')
ok(type?.defaults.email === true,
  'email is ON by default - the thing being warned about is that there may not be a useful next login')
ok(/audienceFor\(/.test(cron) && /'trial_ending'/.test(cron), 'and the job routes through it')
ok(/notify\(/.test(cron), 'sent through notify(), so a company that turned it off is not written to')
ok(!/sendEmail\(/.test(cron),
  '...and not emailed separately beside it, which would be two letters for one event')

// ── the stamp is written, and cleared where the deadline moves ──────────────
ok(/trial_warned_days_left: action\.send/.test(cron), 'the milestone is stamped after writing')
ok(/'reset' in action/.test(cron), 'and a moved deadline clears the stamp')
const adminBilling = code('app/api/admin/billing/route.ts')
ok((adminBilling.match(/trial_warned_days_left: null/g) ?? []).length === 2,
  'both admin actions that move a trial deadline clear the stamp too')

// ── the screen says what the letter says ────────────────────────────────────
// Two spellings of "soon" is how a company gets a calm screen on the morning we
// emailed them. The banner had its own `= 3`.
const banner = code('components/layout/billing-banner.tsx')
// READ THE COMPARISON, NOT THE FILE. Asking whether the file mentions
// TRIAL_WARN_FROM passes while the import line survives, so swapping the
// comparison itself for a bare `<= 7` went green under a red-check - the same
// mistake, one day later, as a lock whose call site could be deleted with the
// helper still imported.
ok(/daysLeft <= TRIAL_WARN_FROM/.test(banner),
  'the banner compares against the same list the letters are sent from')
ok(!/daysLeft <= \d/.test(banner), '...and against no number of its own')
ok(!/WARN_WITHIN_DAYS/.test(banner), '...and no longer keeps its own idea of soon')

// ── the demo console has a sample, built from the real sentence ─────────────
const demo = code('lib/demo-notification.ts')
ok(/'trial_ending'/.test(demo), 'the demo console can show it')
ok(/trialCopy\(/.test(demo),
  '...using the copy the cron actually sends, so a demo cannot show a sentence the product does not')

// ── the column ──────────────────────────────────────────────────────────────
const m119 = read('supabase/migrations/119_trial_warning_stamp.sql')
ok(/ADD COLUMN IF NOT EXISTS trial_warned_days_left INTEGER/.test(m119), 'the stamp column exists')
// Read the SQL with its `--` comments stripped: the file EXPLAINS why a
// NOT NULL DEFAULT 0 would be wrong, and a raw scan finds its own explanation.
// The same trap the schedule-cascade suite documents, one language over.
const m119Sql = m119.replace(/--[^\n]*/g, '')
ok(!/NOT NULL/.test(m119Sql),
  'and is nullable - zero is the LAST milestone, so a NOT NULL DEFAULT 0 would read as "already warned" for every company alive')
ok(/trial_warned_days_left/.test(readCombined()), 'the combined migration carries it')

done()
