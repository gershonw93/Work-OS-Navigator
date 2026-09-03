// Who hears that an inspection was asked for.
//
// TWO TESTER FINDINGS, ONE BUG. "Requesting an inspection with nobody assigned
// creates it silently and notifies no one" and "nothing tells you whether the
// assignee replaces the routed list, adds to it, or overlaps" are the same
// defect from two sides: the create route wrapped its whole notification block
// in `if (scheduler_profile_id)`, so the assigned person GATED the audience
// instead of joining it.
//
// The first block is the one that matters. Everything after it is there so the
// answer is visible without reading four people's inboxes.

import { withStructural } from '../notification-routing'
import { NOTIFICATION_TYPES, notificationType } from '../notifications'
import { ok, done, code } from './_helpers'

// The tester's company: four people in the default audience for
// inspection_to_schedule - them, Office Staff, Project Manager, Admin User.
const ME = 'u-tester'
const ROUTED = ['u-office', 'u-pm', 'u-admin']
const ADMIN = 'u-admin'

// ── a blank assignee still reaches the routed audience ───────────────────────
// The reported bug. Leaving "Who schedules this?" on "No one assigned yet" used
// to tell nobody at all - not the people who can manage inspections, not even a
// rule a company had explicitly saved for the event.
const blank = withStructural(ROUTED, [null], ME)
ok(blank.length === 3, `a blank assignee still tells the routed audience (${blank.length})`)
ok(blank.includes('u-office') && blank.includes('u-pm') && blank.includes(ADMIN),
  '...all three of them, by name')

const blankString = withStructural(ROUTED, [''], ME)
ok(blankString.length === 3, `an empty-string assignee is the same as none (${blankString.length})`)
ok(!blankString.includes(''), '...and does not become a user id that matches nobody')
ok(withStructural(ROUTED, [undefined, null, '  ']).length === 3,
  'undefined, null and whitespace are all dropped')

// ── the assignee ADDS, it does not replace ───────────────────────────────────
// The question the tester could not answer from one inbox.
const assigned = withStructural(ROUTED, [ADMIN], ME)
ok(assigned.length === 3, `assigning Admin still tells everyone routed (${assigned.length})`)
ok(assigned.includes('u-office') && assigned.includes('u-pm'),
  '...Office and the PM are NOT dropped because somebody was named')

const outsider = withStructural(ROUTED, ['u-labourer'], ME)
ok(outsider.length === 4, `naming somebody outside the routed list adds them (${outsider.length})`)
ok(outsider.includes('u-labourer'), '...that is the point of naming them')

// Somebody who is both routed and assigned hears once.
ok(withStructural(ROUTED, [ADMIN], ME).filter(id => id === ADMIN).length === 1,
  'somebody both routed and assigned is told once, not twice')

// ── the actor is removed last, and always ────────────────────────────────────
// The create route seeded itself with the scheduler AFTER excluding the actor,
// so requesting an inspection and assigning it to yourself notified you.
ok(!withStructural(ROUTED, [ME], ME).includes(ME),
  'assigning an inspection to yourself does not notify you')
ok(withStructural([...ROUTED, ME], [], ME).length === 3,
  'the actor is dropped from the routed half too')
ok(withStructural(ROUTED, [ADMIN]).includes(ADMIN),
  'with no actor given, nobody is dropped - the cron path has no actor')

// Everybody could be excluded, and that is a real answer the caller must handle.
ok(withStructural([], [ME], ME).length === 0, 'a request only you would hear tells nobody')

// ── the create route no longer gates on the assignee ─────────────────────────
const create = code('app/api/projects/[id]/inspections/route.ts')
ok(!/if \(scheduler_profile_id\) \{/.test(create),
  'the create route does not wrap its notification in `if (scheduler_profile_id)`')
ok(/audienceFor\(/.test(create), '...it still asks for the routed audience')
ok(/withStructural\(/.test(create), '...through the shared union')
// The audienceFor call must not sit inside any assignee condition. Checked by
// position: the gate, if it ever comes back, would have to open before it.
const beforeAudience = create.slice(0, create.indexOf('audienceFor('))
ok(!/scheduler_profile_id\)\s*\{/.test(beforeAudience),
  '...and nothing conditional on the assignee opens before it')
ok(/notified: bookers\.length/.test(create),
  'the create route reports how many people it told')

// ── assigning a scheduler later notifies them ────────────────────────────────
// `scheduler_profile_id` has always been editable through PATCH with no
// notification at all, so assigning somebody through Edit was silent.
const patch = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')
ok(/priorScheduler/.test(patch), 'the PATCH route reads who was assigned before')
ok(/newScheduler && newScheduler !== priorScheduler/.test(patch),
  '...and only notifies on a real change, not on every save of the Edit form')
ok((patch.match(/withStructural\(/g) ?? []).length === 3,
  'all three PATCH notifications go through the shared union')
ok(!/new Set<string>\(\)\s*\n\s*if \(inspection\.requested_by_id\)/.test(patch),
  'the hand-rolled recipient sets are gone')

// ── the form says who will hear, before you send ─────────────────────────────
const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
// The call site, not the definition. Deleting the tag from the form left every
// other check here passing, because the component still existed at the bottom
// of the file - defined, correct, and rendered nowhere.
ok(/<WhoWillHear[\s\S]{0,160}routedIds=\{routedIds\}/.test(page),
  'the request form actually renders who will hear')
ok(/schedulerId=\{schedulerId\}[\s\S]{0,80}myId=\{myId\}/.test(page),
  '...with the assignee and the caller, so the union is the real one')
ok(/withStructural\(/.test(page),
  'the form derives who will hear with the SAME function the routes use')
ok(/routedIds === null/.test(page),
  'a failed lookup is a different fact from nobody, and says so')
ok(/Nobody will be told/.test(page), 'and nobody is stated plainly rather than left blank')
ok(/adds them; it does not replace/.test(page),
  'the form answers the question that could not be answered from one inbox')
// The response used to be discarded, so a 500 closed the modal and looked like
// success, taking everything typed with it.
// Anchored to the submit path by its own message, not to `if (!res.ok)` - that
// pattern also matches the audience fetch in the same file, so the first version
// of this check passed with the submit guard deleted. A test that cannot fail is
// a guess about what it covers.
ok(/That did not save \(\$\{res\.status\}\)/.test(page),
  'the form checks whether the save worked and reports the status')
ok(/setSubmitError\(d\?\.error/.test(page),
  "...preferring the server's own message when there is one")
ok(/role="alert"[\s\S]{0,80}submitError/.test(page),
  '...and the message is rendered where a screen reader will announce it')
ok(/\} finally \{[\s\S]{0,80}setSubmitting\(false\)/.test(page),
  'setSubmitting(false) is in a finally, so a throw cannot leave it spinning')

// ── the preview endpoint ─────────────────────────────────────────────────────
const api = code('app/api/notifications/audience/route.ts')
ok(/dynamic = 'force-dynamic'/.test(api),
  'the preview route is force-dynamic, or the build fails constructing its client')
ok(/isRoutable\(type\)/.test(api), 'it refuses a direct type rather than answering "nobody"')
ok(!/settings_company/.test(api),
  'it is NOT gated on settings_company - a field supervisor requesting an inspection needs it')
ok(/audienceFor\(/.test(api), 'and it resolves through the same audienceFor as the send path')

// ── the settings screen admits what it does not control ──────────────────────
for (const key of ['inspection_to_schedule', 'inspection_ready', 'inspection_result']) {
  const t = notificationType(key)
  ok(!!t?.alsoTold, `${key} declares who is always told regardless of routing`)
}
// Events with no structural recipient must NOT claim one - a sentence saying
// somebody is always told when nobody is would be worse than saying nothing.
for (const key of ['invoice_pending', 'change_order', 'new_bid', 'compliance_expiring']) {
  ok(!notificationType(key)?.alsoTold, `${key} has no structural recipient and claims none`)
}
ok(NOTIFICATION_TYPES.filter(t => t.audience === 'direct').every(t => !t.alsoTold),
  'a direct event carries no alsoTold - the whole event is the structural person')

const screen = code('components/settings/notification-routing.tsx')
ok(/ev\.alsoTold/.test(screen), 'the settings row renders it')
ok(/Always told as well/.test(screen), '...in words somebody can act on')
ok(/alsoTold: t\.alsoTold/.test(code('app/api/settings/notification-routing/route.ts')),
  'and the route sends it')

done()
