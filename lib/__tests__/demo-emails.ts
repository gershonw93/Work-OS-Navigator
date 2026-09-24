// THE DEMO BOARD'S OTHER HALF, and the reason it needed one.
//
// `/admin/demo` sends any live notification type. Eleven templates in
// lib/email.ts are not one: a route sends them directly, because they have no
// audience to configure and no preference to honour. So the console could not
// reach the welcome email - the first thing a customer ever receives - and the
// only way to read it was to complete a real signup.
//
// The assertions below guard the two ways this goes wrong. It can drift (a
// twelfth template arrives with no way to look at it), or it can lie (a sample
// dated in the past, or copy that claims to respect a setting it ignores).

import { DEMO_EMAILS, demoEmail } from '../demo-emails'
import { NOTIFICATION_TYPES } from '../notifications'
import { ok, done, code, read } from './_helpers'

const TODAY = '2026-09-26'
const LATER = '2027-02-11'

// ── every one of them builds ────────────────────────────────────────────────
ok(DEMO_EMAILS.length >= 12, `there is sample copy for every one-off email (${DEMO_EMAILS.length})`)
ok(new Set(DEMO_EMAILS.map(e => e.key)).size === DEMO_EMAILS.length, 'every key is its own')

for (const e of DEMO_EMAILS) {
  const built = e.build(TODAY)
  ok(!!built.subject && built.subject.length > 5, `${e.key}: has a subject`)
  ok(built.text.length > 50 && built.html.length > 200, `${e.key}: has a body`)
  ok(e.label.length > 0 && e.when.length > 0, `${e.key}: the picker says what it is and when it goes`)
  // A SENTENCE MUST NOT PRINT AN OBJECT. Three shipped call sites interpolated
  // `dateWords` - which returns {short, withWeekday} - straight into a template
  // and read "[object Object]" on a customer's screen. Demo copy is the worst
  // place for it: the whole point is that it looks genuine.
  ok(!/\[object Object\]|\bundefined\b|\bNaN\b/.test(built.text),
    `${e.key}: reads as English, not as a data structure`)
}

// ── THE DATES ARE COMPUTED, NOT TYPED ───────────────────────────────────────
// A sample reading "due Sep 12" in November is the one detail an audience
// notices. Checked PER SAMPLE rather than in aggregate: one frozen date passes
// an aggregate check for as long as something else moved.
// NAMED, not sniffed. The first version asked whether a sample CONTAINED a
// weekday date and only then demanded it move - so replacing a computed date
// with the literal 'Sep 12' made the sample undated, the check skipped it, and
// the mutation went green. A test that stops applying when you break the thing
// it guards is not a test. These are the samples whose copy states a date, and
// every one of them has to move.
const MUST_BE_DATED = ['welcome', 'token-link', 'schedule-shift', 'schedule-unblocked', 'scope-change']
for (const key of MUST_BE_DATED) {
  const e = DEMO_EMAILS.find(x => x.key === key)
  ok(!!e, `${key}: is in the registry`)
  if (!e) continue
  const a = e.build(TODAY).text
  const b = e.build(LATER).text
  ok(a !== b, `${key}: its dates move with the day it is sent`)
  // And it really is a DATE that moved, not some other noise.
  ok(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+/.test(a),
    `${key}: ...and it prints one, with the weekday that makes a date checkable against a diary`)
}

// ── nothing is unreachable ──────────────────────────────────────────────────
// DERIVED FROM lib/email.ts, not typed here. A twelfth template cannot arrive
// with no way to look at it - the same shape as the pin that makes a new live
// notification type fail until it has demo copy.
//
// `notificationEmail` is excluded: it is the envelope every CATALOG type is
// sent in, and the demo board already covers those through the notification
// picker. `buildSendGridPayload` is the transport.
const emailSrc = read('lib/email.ts')
const NOT_A_TEMPLATE = new Set(['notificationEmail', 'buildSendGridPayload'])
const senders = Array.from(emailSrc.matchAll(/^export function (\w*Email)\b/gm))
  .map(m => m[1])
  .filter(n => !NOT_A_TEMPLATE.has(n))
const registrySrc = read('lib/demo-emails.ts')
const missing = senders.filter(n => !new RegExp(`\\b${n}\\(`).test(registrySrc))
ok(senders.length >= 12, `every transactional sender is found in lib/email.ts (${senders.length})`)
ok(missing.length === 0,
  `every one of them has demo copy${missing.length ? ` - missing ${missing.join(', ')}` : ''}`)

// ── an unknown key answers null rather than inventing wording ───────────────
ok(demoEmail('nope', TODAY) === null, 'a key we have no copy for returns null')
ok(demoEmail('welcome', TODAY) !== null, '...and a real one returns copy')

// ═══════════════════════════════════════════════════════════════════════════
// THE ROUTE
// ═══════════════════════════════════════════════════════════════════════════

const route = code('app/api/admin/demo-notification/route.ts')

// SUPER ADMIN ONLY, GATED BEFORE THE BODY IS READ. No field in a request is a
// permission - this sends real mail to a real person with copy written to look
// genuine.
ok(route.indexOf('isSuperAdmin') < route.indexOf('request.json()'),
  'the email branch is behind the same gate, checked before the body is read')
// And the preview is too: it renders copy meant to be convincing.
const getAt = route.indexOf('export async function GET')
ok(getAt > 0 && /isSuperAdmin/.test(route.slice(getAt)), 'the preview is super-admin only as well')

// IT DOES NOT GO THROUGH notify(). These have no catalog type and no
// preference to honour, and the real sends do not either.
const emailBranch = route.slice(route.indexOf('if (emailKey) {'), route.indexOf("if (!type) return"))
ok(emailBranch.length > 200, 'the email branch is where we think it is')
ok(/sendEmail\(/.test(emailBranch), 'it sends directly')
ok(!/notify\(/.test(emailBranch), '...and never through notify(), which would imply a setting it ignores')
// The notification branch still does, or this change broke the other half.
ok(/await notify\(/.test(route), 'the notification branch still goes through notify()')

// LOGGED, whatever happened. Six weeks from now somebody asks why they got an
// email about a job that does not exist, and the log is the only answer.
ok(/notification_type: `email:\$\{emailKey\}`/.test(emailBranch),
  'the log namespaces it, so a demo email is never mistaken for a real notification type')
ok(/sent_by_email/.test(emailBranch), '...with the sender against it')

// SAID BEFORE THE SEND. "There was never going to be one" and "the email is
// slow" are different facts, and only one is worth waiting on.
ok(/if \(!to\.email\)/.test(emailBranch), 'a profile with no address is refused before anything is sent')

// ── the screen ──────────────────────────────────────────────────────────────
const page = code('app/admin/demo/page.tsx')
ok(/DEMO_EMAILS\.map/.test(page), 'the picker is the registry, not a second list')
ok(/ignore notification settings/i.test(page),
  'and the screen says out loud that these ignore preferences - otherwise it arrives as a bug report')
ok(/sandbox=""/.test(page), 'the preview iframe is sandboxed - it is email HTML, not something to run')
// THE INITIAL STATE, not the markup around it. Asking whether the `-- Select --`
// option exists passes while `useState('welcome')` quietly preselects one -
// which is the claim this rule is about: a select that starts on a value cannot
// fail validation and does not look unanswered.
ok(/const \[emailKey, setEmailKey\] = useState\(''\)/.test(page),
  'the picker starts EMPTY - a useState default on a required select is a claim')
ok(/<option value="">-- Select --<\/option>/.test(page), '...with something to start on')

// No catalog type is quietly duplicated here: the notification picker still
// reads the catalog, so the two halves cannot drift into one list.
ok(/NOTIFICATION_TYPES\.filter\(t => t\.status === 'live'\)/.test(page),
  'the notification picker is still the catalog')
ok(NOTIFICATION_TYPES.some(t => t.status === 'live'), '...which still has live types in it')

done()
