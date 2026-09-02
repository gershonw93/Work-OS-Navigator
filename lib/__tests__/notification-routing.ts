// Who gets told when something happens.
//
// `notify()` takes user ids, so the choice of recipient was hand-rolled at
// twenty call sites - four of which resolved to EVERY profile at the company.
// Ten office staff, ten notifications, every time somebody marked work ready.
//
// THE ONE THAT MATTERS MOST is the first block. Some recipients are structural:
// the person a task is assigned to, the sub who was invited to bid. Route those
// by role and the feature breaks in the worst way available - the assignee
// simply stops being told, nothing errors, and nobody finds out until somebody
// misses a job.

import {
  isRoutable, defaultAudience, checkRule, resolveRecipients,
} from '../notification-routing'
import { NOTIFICATION_TYPES, notificationType } from '../notifications'
import { ok, done, code } from './_helpers'

// ── a direct recipient can never be routed away ──────────────────────────────
const DIRECT = ['task_assigned', 'signoff_requested', 'invoice_decision', 'bid_invited', 'bid_awarded']
for (const key of DIRECT) {
  ok(!isRoutable(key), `${key} is NOT configurable - it goes to the person it is about`)
  const r = checkRule({ type: key, roles: ['admin'], userIds: [] })
  ok(!r.ok, `...and the API refuses a rule for it`)
}
ok(isRoutable('inspection_ready'), 'inspection_ready IS configurable')
ok(isRoutable('invoice_pending'), 'invoice_pending IS configurable')

// A key the catalogue does not know is not routable either - that is what stops
// a typo silently creating a rule nothing will ever read.
ok(!isRoutable('made_up_event'), 'an unknown event is not routable')
ok(!checkRule({ type: 'made_up_event', roles: ['admin'] }).ok, '...and cannot be saved')

// ── every configurable event must have a default ─────────────────────────────
// A 'team' type with no default resolves to nobody once routing is consulted,
// which is a notification that silently stops being sent.
const team = NOTIFICATION_TYPES.filter(t => t.audience === 'team')
ok(team.length >= 8, `there are configurable events to check (${team.length})`)
for (const t of team) {
  ok(!!defaultAudience(t.key), `${t.key} has a default audience`)
}
ok(NOTIFICATION_TYPES.every(t => t.audience === 'team' || t.audience === 'direct'),
  'every event in the catalogue declares an audience')
ok(NOTIFICATION_TYPES.filter(t => t.audience === 'direct').every(t => !t.defaultAudience),
  'a direct event carries no default audience, which would be meaningless')

// ── nothing configured means exactly today's behaviour ───────────────────────
const members = [
  { id: 'u-admin', role: 'admin' },
  { id: 'u-pm', role: 'project_manager' },
  { id: 'u-office', role: 'office_staff' },
  { id: 'u-worker', role: 'worker' },
]
const asToday = resolveRecipients({
  members, rule: null, fromPermission: ['u-admin', 'u-office'], exclude: null,
})
ok(asToday.length === 2 && asToday.includes('u-admin') && asToday.includes('u-office'),
  'with no rule, the permission default is used unchanged')
ok(defaultAudience('invoice_pending')?.[0] === 'invoices',
  'invoice_pending still defaults to whoever can act on invoices')
ok(defaultAudience('inspection_ready')?.[0] === 'inspections', '...and inspections to inspections')

// ── a configured rule replaces it ────────────────────────────────────────────
const byRole = resolveRecipients({
  members,
  rule: { type: 'inspection_ready', roles: ['project_manager'], userIds: [] },
  fromPermission: ['u-admin', 'u-office'],
  exclude: null,
})
ok(byRole.length === 1 && byRole[0] === 'u-pm', 'a role rule reaches exactly that role')
ok(!byRole.includes('u-admin'), '...and the permission default is no longer consulted')

const both = resolveRecipients({
  members,
  rule: { type: 'inspection_ready', roles: ['project_manager'], userIds: ['u-worker'] },
  fromPermission: [],
  exclude: null,
})
ok(both.length === 2 && both.includes('u-worker'),
  'a named person is included whatever their role - that is the point of naming them')

const dedup = resolveRecipients({
  members,
  rule: { type: 'inspection_ready', roles: ['project_manager'], userIds: ['u-pm'] },
  fromPermission: [],
  exclude: null,
})
ok(dedup.length === 1, 'somebody matched by role AND named is told once, not twice')

// A stale id - somebody who left - resolves to nobody rather than erroring.
const stale = resolveRecipients({
  members,
  rule: { type: 'inspection_ready', roles: [], userIds: ['u-gone'] },
  fromPermission: [],
  exclude: null,
})
ok(stale.length === 0, 'an id for somebody who has left is dropped, not an error')

// ── the actor is never told about their own action ───────────────────────────
const minusActor = resolveRecipients({
  members,
  rule: { type: 'inspection_ready', roles: ['admin', 'project_manager'], userIds: [] },
  fromPermission: [],
  exclude: 'u-pm',
})
ok(!minusActor.includes('u-pm') && minusActor.includes('u-admin'),
  'whoever triggered it is excluded, even when their role matches')

// ── an empty audience is refused, never stored ───────────────────────────────
const emptyRule = checkRule({ type: 'inspection_ready', roles: [], userIds: [] })
ok(!emptyRule.ok, 'a rule with nobody in it is refused')
ok(!emptyRule.ok && /at least one/i.test(emptyRule.error), '...with a reason somebody can act on')
ok(checkRule({ type: 'inspection_ready', roles: ['  '], userIds: [''] }).ok === false,
  'blanks do not count as somebody')
const good = checkRule({ type: 'inspection_ready', roles: ['admin', 'admin'], userIds: [] })
ok(good.ok && good.value.roles.length === 1, 'a duplicated role is stored once')

// ── the call sites actually use it ───────────────────────────────────────────
const everyone = /from\('profiles'\)[\s\S]{0,80}eq\('company_id'/
for (const [file, label] of [
  ['app/api/projects/[id]/rfis/route.ts', 'RFIs'],
  ['app/api/my-bids/[packageId]/route.ts', 'bids received'],
  ['app/api/cron/compliance-reminders/route.ts', 'compliance reminders'],
  ['app/api/projects/[id]/inspections/[inspectionId]/route.ts', 'inspections'],
] as const) {
  const src = code(file)
  ok(/audienceFor\(/.test(src), `${label} routes through audienceFor`)
  ok(!everyone.test(src), `...and no longer notifies every profile at the company`)
}
ok(/audienceFor\(/.test(code('app/api/projects/[id]/invoices/route.ts')),
  'bills waiting for approval route through audienceFor')

// The API refuses a direct type, so the screen is not the only thing stopping
// somebody adding a row for one.
const api = code('app/api/settings/notification-routing/route.ts')
ok(/checkRule\(/.test(api), 'the save route validates through checkRule')
ok(/settings_company', 'edit'/.test(api), '...and only an admin may change it')
ok(/audience === 'team'/.test(api), 'the screen is built from the team types only')

// The help article exists and every slug it points at does too - a dangling
// `related` renders as a link to nothing, and nobody notices until a customer
// clicks it.
const help = code('lib/help/articles.ts')
ok(/slug: 'who-gets-notified'/.test(help), 'the help article exists')
const relatedLine = help.split("slug: 'who-gets-notified'")[1].split('related: [')[1]?.split(']')[0] ?? ''
const related: string[] = []
const slugPattern = /'([a-z0-9-]+)'/g
let rm: RegExpExecArray | null
while ((rm = slugPattern.exec(relatedLine))) related.push(rm[1])
ok(related.length > 0, `it links to related articles (${related.length})`)
for (const slug of related) {
  ok(help.includes(`slug: '${slug}'`), `related article "${slug}" exists`)
}

done()
