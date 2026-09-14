// Nobody was warned.
//
// Asked plainly: "so essentially if the inspection date is approaching and it's
// not ready, who gets notified?" Nobody. The only scheduled job in the app was
// /api/cron/compliance-reminders and vercel.json listed exactly that one path,
// so a visit booked for Friday that nobody had marked ready stayed silent right
// up to the morning the inspector turned up.
//
// And it had to be a SETTING, not my opinion compiled in: the audience comes
// from the same Settings -> Notifications -> Who gets told table every other
// event uses, which means the event needs its own entry in the catalog rather
// than borrowing `inspection_ready`'s.

import { needsReadyReminder, addDaysIso, READY_REMINDER_DAYS } from '../inspection-status'
import { NOTIFICATION_TYPES } from '../notifications'
import { ok, done, code, read } from './_helpers'

const TODAY = '2026-09-14'
const booked = (over: any = {}) => ({
  status: 'scheduled', scheduled_date: TODAY, ready_marked_by: null,
  ready_reminder_sent_at: null, ...over,
})

// ── the window ──────────────────────────────────────────────────────────────
ok(READY_REMINDER_DAYS === 2, 'two days - long enough to finish the work or move the trip')
for (const d of [0, 1, 2]) {
  ok(needsReadyReminder(booked({ scheduled_date: addDaysIso(TODAY, d) }), TODAY),
    `THE GAP: an unready inspection ${d} day(s) out is warned about`)
}
ok(!needsReadyReminder(booked({ scheduled_date: addDaysIso(TODAY, 3) }), TODAY),
  'three days out is not yet this visit\'s problem')
ok(!needsReadyReminder(booked({ scheduled_date: addDaysIso(TODAY, -1) }), TODAY),
  'and yesterday is not a warning, it is a result')

// ── what silences it ────────────────────────────────────────────────────────
ok(!needsReadyReminder(booked({ ready_marked_by: 'qa.office@sytenav.com' }), TODAY),
  'THE POINT: marked ready says nothing - a bell about work that is done is one people stop opening')
ok(needsReadyReminder(booked({ ready_marked_by: '   ' }), TODAY),
  '...and whitespace is not somebody saying it is ready')
ok(!needsReadyReminder(booked({ ready_reminder_sent_at: '2026-09-13T07:22:00Z' }), TODAY),
  'once per booking, not once a day')
for (const status of ['passed', 'failed', 'void']) {
  ok(!needsReadyReminder(booked({ status }), TODAY), `nothing to warn about on a ${status} one`)
}
ok(!needsReadyReminder(booked({ scheduled_date: null }), TODAY),
  'an inspection nobody booked has no date to be warned about')

// Date-only arithmetic, never through UTC.
ok(addDaysIso('2026-12-31', 1) === '2027-01-01', 'the window crosses a year end')
ok(addDaysIso('2026-02-28', 1) === '2026-03-01', '...and a month end')
ok(!/toISOString/.test(code('lib/inspection-status.ts')),
  'and it never goes through UTC, which is tomorrow for a west-coast evening')

// ── the audience is a SETTING ───────────────────────────────────────────────
{
  const entry = NOTIFICATION_TYPES.find(t => t.key === 'inspection_not_ready')
  ok(!!entry, 'THE WARNING HAS ITS OWN CATALOG ENTRY, so it is not glued to another event\'s audience')
  ok(entry?.status === 'live',
    '...and it is live, which is what puts it on Settings -> Notifications and Who gets told')
  ok(Array.isArray(entry?.defaultAudience) && entry?.defaultAudience?.length === 2,
    '...with a default audience, or a company that has not touched the setting hears nothing')
  ok(entry?.defaults?.email === true,
    'email on by default - finding out at your next login is too late for a visit in two days')
}

const cron = code('app/api/cron/inspection-reminders/route.ts')
ok(/audienceFor\(\{[\s\S]{0,120}type: 'inspection_not_ready'/.test(cron),
  'the job asks the routing table rather than a hard-coded list')
ok(/withStructural\(/.test(cron),
  '...plus the requester and whoever is booking it, whose part is structural and never a setting')

// ── a job nothing schedules never runs ──────────────────────────────────────
ok(/"\/api\/cron\/inspection-reminders"/.test(read('vercel.json')),
  'THE SILENT FAILURE: vercel.json actually lists the path')
{
  // Auth before a single read, or an unauthenticated caller can enumerate the
  // table through the error messages.
  const authAt = cron.indexOf('checkCronAuth')
  const readAt = cron.indexOf("from('inspections')")
  ok(authAt > -1 && readAt > -1 && authAt < readAt, 'and it checks auth before it reads anything')
  ok(/if \(!auth\.ok\) return/.test(cron), '...and actually returns on a refusal')
}
ok(/ready_reminder_sent_at: new Date\(\)\.toISOString\(\)/.test(cron),
  'and it stamps the gate even when nobody was listening, or it retries for ever')

done()
