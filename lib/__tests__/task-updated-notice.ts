// "OPT-IN SETTING: GET NOTIFIED WHENEVER A TASK IS UPDATED."
//
// Spec item 3 of the Sep 17 batch. The word doing the work is OPT-IN: this type
// can fire on every edit of every task on every job, so it ships silent and
// starts working when somebody turns it on.
//
// A NEW NOTIFICATION BELONGS IN THE CATALOG, or its audience is not a setting -
// a route sending under a type the catalog has never heard of is a notification
// nobody can turn off or redirect. `notify` refuses an unknown type outright,
// which is what makes the catalog authoritative rather than decorative.

import { NOTIFICATION_TYPES } from '../notifications'
import { demoNotification } from '../demo-notification'
import { ok, done, code } from './_helpers'

const entry = NOTIFICATION_TYPES.find(t => t.key === 'task_updated')

// ── it is in the catalog, and it is live ────────────────────────────────────
ok(!!entry, 'THE SETTING EXISTS: task_updated is a type in the catalog')
ok(entry?.status === 'live', '...and live, so it appears in Settings and something emits it')
ok(entry?.group === 'Work', '...filed with the other task types')

// ── opt-in is the whole point ───────────────────────────────────────────────
ok(entry?.defaults.inApp === false && entry?.defaults.email === false,
  'OPT-IN: both channels default OFF, so nobody is opted into a firehose')
ok(entry?.push === false,
  '...and no push - a type that can fire twenty times an afternoon must not buzz a phone')

// Routable, so Settings -> Who gets told can aim it.
ok(entry?.audience === 'team', 'it is routable rather than direct, so its audience is configurable')
ok(Array.isArray((entry as any)?.defaultAudience),
  '...with a default audience rather than none, which would resolve to nobody')

// ── the route sends it ──────────────────────────────────────────────────────
const route = code('app/api/projects/[id]/tasks/[taskId]/route.ts')
ok(/notify\(\{/.test(route) && /type: 'task_updated'/.test(route),
  'the task PATCH route actually emits it')
ok(/audienceFor\(\{/.test(route), '...to the routed audience, not a hardcoded list')
ok(/exclude: user\.id/.test(route),
  'NEVER THE PERSON WHO MADE THE CHANGE: being told about your own edit teaches people to ignore the bell')

// Gated on the SAME condition the history line uses.
const gate = route.indexOf('if (changes.length > 0)')
const send = route.indexOf("type: 'task_updated'")
ok(gate > 0 && send > gate,
  'a save that changed NOTHING is silent - the send sits inside the same guard as the history line')

// ── and "nothing changed" has to mean it ────────────────────────────────────
// Every other field here compares against `prev`; description did not, so it
// counted as a change on every save. Harmless in a log line, not once it
// decides who gets told.
ok(/updates\.description !== undefined && updates\.description !== \(prev as any\)\?\.description/.test(route),
  'THE FIREHOSE THAT WOULD HAVE BEEN: description is compared, not merely present')
ok(/'title, status, priority, due_date, assigned_to_name, description'/.test(route),
  '...which needs description on the previous-state read, or the comparison is against undefined')

// ── it never takes the save down with it ────────────────────────────────────
ok(/catch \(e: any\)[\s\S]{0,200}task_updated notify failed/.test(route),
  'a notification that cannot work out its audience must not fail the edit')
ok(/console\.error\('\[tasks\/PATCH\] task_updated notify failed:/.test(route),
  '...and the reason is logged rather than swallowed')

// ── the demo board can show it ──────────────────────────────────────────────
// Pinned generally elsewhere; named here because this is the type that added it.
const a = demoNotification('task_updated', '2026-03-02')
const b = demoNotification('task_updated', '2026-09-17')
ok(!!a && !!a.message, 'the demo board has sample copy for it')
ok(!!a && !!b && a.message !== b.message,
  '...whose dates are COMPUTED - the same sample on another day reads differently')

done()
