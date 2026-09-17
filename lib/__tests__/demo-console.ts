// The demo control board: pick a person, pick a notification, press send.
//
// THE ASK: "i wanna be able from the admin login to select a user and select
// which notification to push... im gonna be doin live demos and wanna show it."
//
// Two things make this worth pinning rather than shrugging at. It sends a REAL
// email to a REAL person, so who may press it is a security question. And the
// copy is written to look genuine, so the DATES have to be computed or the
// demo says "due Sep 12" in November - the one detail an audience notices.

import { ok, done, code, read, exists } from './_helpers'
import { demoNotification, demoCoverage } from '../demo-notification'
import { NOTIFICATION_TYPES } from '../notifications'

console.log('\ndemo-console')

const TODAY = '2026-09-17'

// ── every live notification can be demonstrated ──────────────────────────────
{
  const coverage = demoCoverage(TODAY)
  const missing = coverage.filter(c => !c.ready).map(c => c.type)
  ok(missing.length === 0,
    `every live notification has demo copy${missing.length ? ' - missing ' + missing.join(', ') : ''}`)
  ok(coverage.length >= 15, `and there are ${coverage.length} of them to choose from`)

  // The picker is the CATALOG, not a second list. A board with its own list
  // drifts from the product the first time somebody adds a type.
  const page = code('app/admin/demo/page.tsx')
  ok(/NOTIFICATION_TYPES\.filter\(t => t\.status === 'live'\)/.test(page),
    'the picker is built from the catalog, filtered to what can actually be sent')
  ok(!/const TYPES = \[/.test(page), '...and not from a hand-kept copy of it')
}

// ── a type the catalog will not send gets no copy ────────────────────────────
{
  ok(demoNotification('not_a_real_type', TODAY) === null, 'an unknown type has no sample')
  const draft = NOTIFICATION_TYPES.find(t => t.status !== 'live')
  if (draft) {
    ok(demoNotification(draft.key, TODAY) === null,
      `a non-live type (${draft.key}) cannot be demoed - notify() would refuse it anyway`)
  }
}

// ── THE DATES ARE COMPUTED ───────────────────────────────────────────────────
{
  // "makeshift text that looks real BASED ON THE CURRENT DATE". A hardcoded
  // date is the whole difference between a demo and an embarrassment.
  const sep = demoNotification('inspection_not_ready', TODAY)!
  const nov = demoNotification('inspection_not_ready', '2026-11-17')!
  ok(sep.message !== nov.message, 'the same notification reads differently on a different day')
  ok(/Sep/.test(sep.message), 'September copy names a September day')
  ok(/Nov/.test(nov.message), '...and November copy a November one')

  // Every sample that mentions a date has to move with the clock. A sample
  // with a frozen date passes the test above only if some OTHER sample moved.
  const dated = demoCoverage(TODAY).filter(c => {
    const a = demoNotification(c.type, TODAY)!
    return /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d/.test(a.message)
  })
  ok(dated.length >= 10, `${dated.length} samples carry a real weekday-and-date`)
  for (const c of dated) {
    const a = demoNotification(c.type, TODAY)!
    const b = demoNotification(c.type, '2027-02-08')!
    ok(a.message !== b.message, `${c.type} re-dates itself`)
  }

  // No ISO dates in front of an audience - same rule as the shift email.
  for (const c of demoCoverage(TODAY)) {
    const s = demoNotification(c.type, TODAY)!
    ok(!/\d{4}-\d{2}-\d{2}/.test(s.message), `${c.type} shows no raw database date`)
    ok(!!s.link && s.link.startsWith('/'), `${c.type} goes somewhere in the app`)
    ok(s.title.length > 0 && s.message.length > 0, `${c.type} has both a headline and a line`)
  }
}

// ── who may press it ─────────────────────────────────────────────────────────
{
  const route = code('app/api/admin/demo-notification/route.ts')
  ok(/isSuperAdmin\(user\.email\)/.test(route), 'SUPER ADMIN ONLY - it emails real people')
  // Auth before anything else, and nothing in the body can widen it.
  //
  // The GATE, not the import. `indexOf('isSuperAdmin')` finds the import line
  // at the top of the file, which is before everything by construction - so
  // the first version of this assertion passed with the gate moved to the
  // bottom of the function. A pin that cannot fail is not a pin.
  const gateAt = route.indexOf('if (!isSuperAdmin(')
  const bodyAt = route.indexOf('await request.json()')
  ok(gateAt > -1 && bodyAt > -1 && gateAt < bodyAt,
    '...checked before the body is even read, so no field in it is a permission')
  ok(!/requirePermission/.test(route), 'and it is not gated on an ordinary resource permission')
}

// ── it goes through notify(), like everything else ───────────────────────────
{
  const route = code('app/api/admin/demo-notification/route.ts')
  ok(/await notify\(\{/.test(route), 'it sends through notify(), the one way to tell somebody something')
  ok(!/from\('notifications'\)\.insert/.test(route),
    '...never its own insert, which is the thing notify() exists to end')
  // A demo that bypassed preferences would demonstrate a product that does
  // not exist - and it must SAY when a preference silenced the email, or the
  // missing mail is a mystery on a stage.
  ok(/emailNote/.test(route), 'and it says WHY the email did not go, when it did not')
  ok(/result\.emailed === 0/.test(route), '...asked of what actually happened, not of what was intended')
}

// ── a real email to a real person is logged ──────────────────────────────────
{
  ok(exists('supabase/migrations/110_demo_notification_log.sql'), 'the log table has a migration')
  const sql = read('supabase/migrations/110_demo_notification_log.sql')
  // SET NULL, not CASCADE: the record has to outlive the account that sent it,
  // which is exactly when somebody comes asking.
  const fks = sql.match(/REFERENCES [a-z_]+ \(id\)[^,\n]*/g) ?? []
  ok(fks.length > 0 && fks.every(f => /ON DELETE SET NULL/.test(f)),
    'the log outlives the accounts it names')

  const route = code('app/api/admin/demo-notification/route.ts')
  ok(/from\('demo_notification_log'\)\.insert/.test(route), 'every send is written down')
  ok(/in_app_count: result\.inApp/.test(route) && /email_count: result\.emailed/.test(route),
    '...recording what ACTUALLY went out, not what was asked for')
  ok(/sent_by: user\.id/.test(route), '...with a name against it')
}

// ── the screen says what it is ───────────────────────────────────────────────
{
  const page = code('app/admin/demo/page.tsx')
  ok(/real email and a real bell to a real person/.test(page),
    'the console warns that this reaches somebody, however fake the wording')
  ok(/demoNotification\(type, todayDateInput\(\)\)/.test(page),
    'and previews with the SAME function the route sends with, so what you read is what lands')

  // Reachable. A console nobody can find is the "unreachable from the job that
  // has not started" failure in a different coat.
  const nav = code('components/admin/admin-nav.tsx')
  ok(/'\/admin\/demo'/.test(nav), 'it is in the admin nav')
}

done()
