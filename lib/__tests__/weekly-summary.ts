// "a weekly summary for the gc and ppl at the company of what was done -
// generates every friday ... just in numbers, what was done, which project
// moved forward, any delays etc."

import { summarizeWeek, weekEnding, movedLine, isEmptyWeek, type SummaryInput } from '../weekly-summary'
import { weeklySummaryEmail } from '../email'
import { NOTIFICATION_TYPES } from '../notifications'
import { ok, done, code, read } from './_helpers'

// A FRIDAY, and fixtures on the window's EDGES - a count off by a day passes
// every fixture sitting in the middle of the week.
const FRI = '2026-10-16'
const week = weekEnding(FRI)
ok(week.start === '2026-10-10' && week.end === FRI, 'the week is the seven days ending today, Saturday to Friday')

const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  week,
  projects: [{ id: 'a', name: 'Oak St' }, { id: 'b', name: 'Lot 14' }, { id: 'c', name: 'Harbor' }],
  tasks: [], dailyLogs: [], inspections: [], rfis: [], selections: [], delayReports: [], scheduleLines: [],
  ...over,
})

const s = summarizeWeek(base({
  tasks: [
    { project_id: 'a', status: 'completed', completed_at: '2026-10-10T08:00:00Z', due_date: null }, // first day: counts
    { project_id: 'a', status: 'completed', completed_at: '2026-10-16T19:00:00Z', due_date: null }, // today: counts
    { project_id: 'a', status: 'completed', completed_at: '2026-10-09T23:00:00Z', due_date: null }, // the Friday before: not
    { project_id: 'b', status: 'open', completed_at: null, due_date: '2026-10-12' },               // overdue
    { project_id: 'b', status: 'completed', completed_at: null, due_date: '2026-10-01' },          // done, no date: neither
  ],
  dailyLogs: [{ project_id: 'a', log_date: '2026-10-14' }, { project_id: 'a', log_date: '2026-10-03' }],
  inspections: [
    { project_id: 'a', status: 'passed', completed_date: '2026-10-13' },
    { project_id: 'b', status: 'pending_reinspection', completed_date: '2026-10-15' },
  ],
  rfis: [{ project_id: 'b', responded_at: '2026-10-11T10:00:00Z' }],
  selections: [
    { project_id: 'a', status: 'chosen', selected_at: '2026-10-12T10:00:00Z', needed_by: null },
    { project_id: 'b', status: 'pending', selected_at: null, needed_by: '2026-10-01' },
  ],
  delayReports: [
    { project_id: 'b', days: 3, reason: 'Rain', created_at: '2026-10-14T09:00:00Z', reported_by_name: 'Maple Framing' },
    { project_id: 'b', days: 2, reason: 'Old', created_at: '2026-10-02T09:00:00Z', reported_by_name: 'Maple Framing' },
  ],
  scheduleLines: [
    { project_id: 'b', label: 'Framing', end_date: '2026-10-12', pct: 60 },
    { project_id: 'b', label: 'Roofing', end_date: '2026-10-12', pct: null }, // nobody has said: not "behind"
    { project_id: 'a', label: 'Drywall', end_date: '2026-10-12', pct: 100 },
  ],
}))

const a = s.moved.find(p => p.id === 'a')!
ok(a?.tasksDone === 2, 'tasks finished on the first day and on Friday itself count; the Friday before does not')
ok(a.logs === 1 && a.inspectionsPassed === 1 && a.selectionsDecided === 1, 'logs, passed inspections and decisions are counted by their own dates')
ok(s.moved[0].id === 'a', 'the busiest job leads "moved forward"')
ok(movedLine(a) === '2 tasks done, 1 daily log, 1 inspection passed, 1 selection decided', 'the moved line names only what happened, in words')

const b = s.attention.find(p => p.id === 'b')!
ok(!!b, 'a job with something behind is in "needs attention"')
ok(b.watch.some(w => /1 schedule line past its finish date \(Framing\)/.test(w)), 'a line past its finish and SAID to be under 100% is behind')
ok(!b.watch.some(w => /Roofing/.test(w)), '...and a line nobody has given a percent is NOT called late')
ok(b.watch.includes('1 inspection failed'), 'a failed inspection (sent back for re-inspection) is flagged')
ok(b.watch.includes('1 task overdue'), 'an open task past its due date is flagged; a completed one never is')
ok(b.watch.includes('1 selection past its decide-by date'), 'a selection still owed past its date is flagged')
ok(b.delays.length === 1 && /Maple Framing - 3 days - Rain/.test(b.delays[0]), "this week's sub-reported delay is listed; last month's is not")
ok(s.totals.delays === 1, '...and counted once in the totals')

ok(s.quiet.map(p => p.id).join() === 'c', 'a running job with nothing recorded is listed as quiet, not left out')
ok(!s.quiet.some(p => p.id === 'b') || b.delays.length === 0, 'a job with a delay is never "quiet"')

ok(isEmptyWeek(summarizeWeek(base())), 'a week with nothing done and nothing wrong is not worth a letter')
ok(!isEmptyWeek(s), '...this one is')

// The letter.
const mail = weeklySummaryEmail({ name: 'Dana Whitfield', companyName: 'Brightline', weekLabel: 'Sat Oct 10 - Fri Oct 16', summary: s, url: 'https://x/dashboard', settingsUrl: 'https://x/settings' })
ok(/^Weekly summary: Sat Oct 10 - Fri Oct 16$/.test(mail.subject), 'the subject is the week, in words')
ok(/MOVED FORWARD[\s\S]*Oak St: 2 tasks done/.test(mail.text) && /NEEDS ATTENTION[\s\S]*Lot 14/.test(mail.text) && /NOTHING RECORDED[\s\S]*Harbor/.test(mail.text),
  'it says which jobs moved, which need a look, and which were quiet')
ok(!/\$|\[object Object\]|undefined|NaN/.test(mail.text), 'no money in it, and no data structure printed as English')
ok(/>2</.test(mail.html) && /tasks done/.test(mail.html), 'the numbers lead the HTML letter')

// The wiring.
const type = NOTIFICATION_TYPES.find(t => t.key === 'weekly_summary')
ok(type?.status === 'live' && type.audience === 'team', 'it is a live catalog type with a company audience - switchable and routable')
ok(JSON.stringify(type?.defaultAudience) === JSON.stringify(['projects', 'edit']),
  '...defaulting to the people who run jobs, not every worker on the payroll')

const route = code('app/api/cron/weekly-summary/route.ts')
ok(route.indexOf('checkCronAuth') < route.indexOf("from('projects')"), 'the cron authenticates before it reads anything')
ok(route.indexOf("from('weekly_summary_sends')") < route.indexOf('await notify('), 'the once-a-week gate is written BEFORE the letters')
ok(/'23505'/.test(route), '...and a second run that hits it moves on rather than erroring')
ok(/if \(failed\) \{[\s\S]*continue/.test(route), 'a failed read skips that company - it is never reported as an empty week')
ok(/from\('project_tasks'\)/.test(route) && !/from\('tasks'\)/.test(route),
  'tasks are read from project_tasks, the table that HAS completed_at - `tasks` has no such column')
ok(/type: 'weekly_summary'/.test(route) && /audienceFor\(/.test(route), 'it goes to the routed audience through notify(), honouring each person\'s switch')

const vercel = JSON.parse(read('vercel.json'))
const cron = vercel.crons.find((c: any) => c.path === '/api/cron/weekly-summary')
ok(!!cron, 'vercel.json actually schedules it - a cron nothing runs warns nobody')
ok(cron?.schedule.split(' ')[4] === '5' && !/\*\//.test(cron?.schedule ?? ''), '...on Fridays, with no sub-daily step the Hobby plan would refuse at build')

const notify = code('lib/notify.ts')
ok(/input\.email \? input\.email\(p\) : notificationEmail/.test(notify) && /const emailUsers = input\.inAppOnly \? \[\] : \(people/.test(notify),
  'a custom letter is only sent to people whose email switch is on - it is not a way round the preference')

done()
