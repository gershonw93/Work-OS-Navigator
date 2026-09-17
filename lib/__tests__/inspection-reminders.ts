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

import {
  needsReadyReminder, addDaysIso, addBusinessDaysIso, isWeekend, READY_REMINDER_DAYS,
} from '../inspection-status'
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

// ── TWO BUSINESS DAYS, NOT TWO DAYS ─────────────────────────────────────────
//
// THE REPORT: "the trigger should be at 7:30 am not in middle of the night",
// and with it the reason the timing mattered - an inspection booked for MONDAY
// was warned about on SATURDAY morning. Nobody reads that, and by Monday there
// is no time left to finish the work or ring the jurisdiction to move the trip.
//
// EVERY TEST ABOVE WENT ON PASSING THROUGH THIS CHANGE, because TODAY is a
// Monday and Mon+2 is a Wednesday either way. A fixture that only exercises the
// case where two rules agree cannot tell you which one you implemented - the
// same trap the cascade snap-versus-shift bug hid behind. These are anchored on
// the days where the two rules DISAGREE.
{
  const THU = '2026-09-17'
  const FRI = '2026-09-18'
  const SAT = '2026-09-19'
  const SUN = '2026-09-20'
  const MON = '2026-09-21'
  const TUE = '2026-09-22'
  const WED = '2026-09-23'

  ok(isWeekend(SAT) && isWeekend(SUN), 'Saturday and Sunday are the weekend')
  ok(!isWeekend(FRI) && !isWeekend(MON), '...and Friday and Monday are not')

  ok(addBusinessDaysIso(THU, 2) === MON, 'two business days from Thursday is MONDAY, not Saturday')
  ok(addDaysIso(THU, 2) === SAT, '...which is exactly where the plain count landed')
  ok(addBusinessDaysIso(FRI, 2) === TUE, 'and two from Friday is Tuesday')
  ok(addBusinessDaysIso(MON, 2) === WED, 'a week with no weekend in it is unchanged')
  ok(addBusinessDaysIso(THU, 0) === THU, 'zero days is today')

  // THE REPORTED CASE.
  ok(needsReadyReminder(booked({ scheduled_date: MON }), THU),
    'THE BUG: a Monday inspection is warned about on THURSDAY')
  ok(needsReadyReminder(booked({ scheduled_date: MON }), FRI),
    '...and still on Friday, if nothing fired on Thursday')
  ok(!needsReadyReminder(booked({ scheduled_date: WED }), FRI),
    'but Wednesday is not yet Friday\'s problem - the window did not just get wider')

  // The weekend is not a warning day of its own: by Saturday the Thursday run
  // has already fired and stamped it. This only asserts the arithmetic still
  // answers sensibly if a booking is made over a weekend.
  ok(needsReadyReminder(booked({ scheduled_date: TUE }), SAT),
    'a booking made at the weekend is still caught on the next run')
}

// ── the rule and the QUERY have to agree ────────────────────────────────────
{
  // The route narrows in SQL before asking the rule. A calendar horizon there
  // filters the Monday inspection out on a Thursday and `needsReadyReminder`
  // never gets to say yes - the fix would look right and do nothing.
  ok(/addBusinessDaysIso\(today, READY_REMINDER_DAYS\)/.test(cron),
    'the SQL window is built with the SAME function the rule uses')
  ok(!/addDaysIso\(today/.test(cron), '...and not with the plain-day one')
}

// ── the people who can act on it are the people told ────────────────────────
//
// REPORTED as a requirement: "I need the gc, worker and whoever to get app
// notification and email". They did not: the audience was `inspections: edit`,
// which is the OFFICE permission for booking a visit. `mark-ready` was split
// out of it precisely because saying the work is finished is a report from the
// SITE - so the warning that nobody has marked it ready went to everybody
// except the field supervisor and the worker.
{
  const entry = NOTIFICATION_TYPES.find(t => t.key === 'inspection_not_ready')
  ok(entry?.defaultAudience?.[0] === 'mark-ready',
    'THE FIX: it is routed on mark-ready, the permission the field actually holds')
  ok(entry?.defaultAudience?.[1] === 'edit', '...on edit, which is what marking it takes')

  // Read the role map rather than trusting the resource name: the whole bug was
  // a resource that sounded right and excluded the people who matter.
  const perms = read('lib/permissions.ts')
  for (const role of ['field_supervisor', 'worker']) {
    const block = perms.slice(perms.indexOf(`  ${role}: {`), perms.indexOf('},', perms.indexOf(`  ${role}: {`)))
    ok(/'mark-ready': VE/.test(block), `${role} holds mark-ready, so this reaches them`)
    ok(/inspections: N/.test(block), `...and NOT inspections, which is why the old audience missed them`)
  }
}

// ── and it runs in the morning ──────────────────────────────────────────────
{
  // Vercel cron is UTC and does not follow daylight saving. 11:30 UTC is
  // 7:30am US Eastern while EDT is in force; it drifts to 6:30am in the
  // winter, and moving it to `30 12` in November puts it back.
  const crons = JSON.parse(read('vercel.json')).crons as { path: string; schedule: string }[]
  const job = crons.find(c => c.path.includes('inspection-reminders'))
  ok(job?.schedule === '30 11 * * *',
    'THE REPORT: 7:30am Eastern, not 3:22 in the middle of the night')
  ok(!/^\d+ [0-7] /.test(job?.schedule ?? ''), '...and nothing before 8am UTC, which is the small hours in the US')
}

done()
