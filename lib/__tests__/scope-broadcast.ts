// "NOTIFY TEAM" - THE OTHER TRADES FIND OUT THAT SOMETHING MOVED.
//
// Spec item 4 of the Sep 17 batch, and it came with its own reason: "a scope
// change in one trade silently moves another trade's work. Concrete switches
// from one center pour to floor-by-floor, the slab height changes half an inch,
// and now the electrician's heights are off - and nobody told him."
//
// AND: "Attach it to the plans/scope change itself - one tap, selected people
// get the push. No new messaging system." So there is no thread, no inbox and
// no reply - it is one send through `notify()`, which is what makes it reach
// the bell, the email and the phone without becoming a second product.

import { scopeNoticeProblem, scopeNoticeTitle, MIN_SCOPE_MESSAGE, splitChannels, canBeTold, type NoticeRecipient } from '../scope-notice'
import { scopeChangeEmail } from '../email'
import { NOTIFICATION_TYPES } from '../notifications'
import { demoNotification } from '../demo-notification'
import { ok, done, code, exists } from './_helpers'
import { ACTIVITY_TAB } from '../activity-href'

const GOOD = { message: 'Slab dropped half an inch, check rough-in heights', recipientIds: ['a'] }

// ── the guard ───────────────────────────────────────────────────────────────
ok(scopeNoticeProblem(GOOD) === null, 'a real notice to a real person is fine')
ok(!!scopeNoticeProblem({ ...GOOD, recipientIds: [] })?.includes('at least one person'),
  'NOBODY PICKED: a broadcast to no one is refused, and says so')
ok(!!scopeNoticeProblem({ ...GOOD, recipientIds: [null, undefined] })?.includes('at least one person'),
  '...and a list of blanks is nobody')
ok(!!scopeNoticeProblem({ ...GOOD, message: '' })?.includes('what changed'),
  'an empty notice is refused')
ok(!!scopeNoticeProblem({ ...GOOD, message: '    ' })?.includes('what changed'),
  '...and so is whitespace')
// A NOTICE THAT SAYS NOTHING SPENDS THE ATTENTION THIS EXISTS FOR: "ok" reaches
// a phone looking exactly like the one saying the slab moved.
ok(!!scopeNoticeProblem({ ...GOOD, message: 'ok' }),
  'THE POINT: too short to act on is refused, not sent')
ok(GOOD.message.length >= MIN_SCOPE_MESSAGE, 'the floor is low enough for a real sentence')

ok(scopeNoticeTitle('A-201 Rev C') === 'Plans changed: A-201 Rev C',
  'the headline NAMES the drawing - "scope changed" alone sends somebody hunting')
ok(scopeNoticeTitle(null) === 'Scope changed on this job', '...and still says something without one')
ok(scopeNoticeTitle('  ') === 'Scope changed on this job', '...treating a blank name as none')

// ── the catalog ─────────────────────────────────────────────────────────────
const entry = NOTIFICATION_TYPES.find(t => t.key === 'scope_change')
ok(!!entry && entry.status === 'live', 'it is a live type in the catalog, so it is a setting')
ok(entry?.audience === 'direct',
  'DIRECT: the sender picks who it lands on - a routed audience would decide for them')
ok(entry?.defaults.inApp === true && entry?.defaults.email === true,
  'ON by default on both channels - finding this out at your next login is too late')
ok(entry?.push === true, '"one tap, selected people get the push" - asked for in those words')

// ── the route ───────────────────────────────────────────────────────────────
ok(exists('app/api/projects/[id]/scope-notice/route.ts'), 'there is a route')
const route = code('app/api/projects/[id]/scope-notice/route.ts')
ok(/requirePermission\(db, request, 'plans', 'edit'\)/.test(route),
  'gated on plans EDIT: somebody who can change the drawings can say they changed')
const gets = (route.match(/requirePermission\(/g) ?? []).length
ok(gets >= 2, '...on both the read and the send, not just one of them')
ok(/scopeNoticeProblem\(/.test(route),
  'the route asks the SAME guard the dialog does, so they cannot disagree')
ok(/notify\(\{/.test(route) && /type: 'scope_change'/.test(route),
  'it sends through notify() - no new messaging system, as asked')

// The ids come from a browser, so being on this job is checked server-side.
// The check moved when subs joined the list: the server rebuilds the whole
// recipient list and matches the submitted keys against it, which covers
// addresses as well as profile ids. Asserted in full further down.
ok(/const chosen = allowed\.filter\(/.test(route),
  'THE ESCALATION: a body cannot broadcast to somebody who is not on this job')
ok(/are not on this job any more/.test(route),
  '...and says so rather than sending to nobody in silence')

// A recipient with email off gets the bell only, and the sender must be told.
ok(/inApp: result\.inApp/.test(route) && /emailed: result\.emailed/.test(route),
  'it REPORTS what actually went out, channel by channel')

// ── the screen ──────────────────────────────────────────────────────────────
const dialog = code('components/projects/notify-team-dialog.tsx')
ok(/className="overlay" data-overlay/.test(dialog),
  'the dialog is a real overlay, so the page behind it freezes')
ok(/'loading' \| 'ready' \| 'failed'/.test(dialog),
  'loading, failed and empty are three facts - "nobody is on this job" is not said until it is known')
// A sub with no ACCOUNT is now a first-class recipient - an address is enough.
// Only somebody with neither is out of reach, and they are still listed rather
// than dropped: the one you most wanted to warn is the one you would not
// notice was missing.
ok(/disabled=\{!told\}/.test(dialog),
  'ONLY THE GENUINELY UNREACHABLE ARE DISABLED, and they stay on the list')
ok(/scopeNoticeProblem\(\{ message, recipientIds \}\)/.test(dialog),
  'the dialog answers at the field, before the press')
ok(/disabled=\{sending\}/.test(dialog) && !/disabled=\{!!problem/.test(dialog),
  'the button is disabled only IN FLIGHT - a greyed-out button explains nothing')
ok(/Select all \$\{reachable\.length\}/.test(dialog), 'select all counts only who can actually be told')

// Attached to the plan itself.
const plans = code('app/(dashboard)/projects/[id]/plans/page.tsx')
ok(/setNotifyPlan\(plan\)/.test(plans), 'ATTACHED TO THE PLAN: the button is on the row that changed')
ok(/aria-label=\{`Notify the team about \$\{plan\.name\}`\}/.test(plans),
  '...and the icon-only button says which plan it is about')
// Anchored on the CALL, not the name: `plans.indexOf('setNotifyPlan')` finds
// the useState declaration at the top of the file, and a window measured back
// from there says nothing about the button. Same shape as a gate check that
// matches an import line.
const buttonAt = plans.indexOf('setNotifyPlan(plan)')
// Anchored on the CALL, not the name: `indexOf('setNotifyPlan')` finds the
// useState declaration at the top of the file, and a window measured back from
// there says nothing about the button. Same shape as a gate check that matches
// an import line.
ok(buttonAt > 0 && /\{canAdd && \(\s*<button onClick=\{\(\) => setNotifyPlan\(plan\)/.test(plans),
  '...shown only to somebody who may change plans')

// ── the demo board can show it ──────────────────────────────────────────────
const a = demoNotification('scope_change', '2026-03-02')
const b = demoNotification('scope_change', '2026-09-17')
ok(!!a && !!b && a.message !== b.message,
  'the demo board has sample copy, and its dates are computed')

// ── AN ADDRESS IS ENOUGH: SUBS GET IT BY EMAIL ──────────────────────────────
// Reported against an empty job: "this should go to anyone via email - subs
// too". The first version only offered people with a SyteNav ACCOUNT, because
// `notify()` works off user ids - which excludes precisely the electrician the
// whole feature exists to warn. A login is not the point; being reachable is.

ok(canBeTold({ profileId: 'p1', email: null }), 'somebody with an account can be told')
ok(canBeTold({ profileId: null, email: 'sub@trade.com' }),
  'THE FIX: somebody with only an email can be told too')
ok(!canBeTold({ profileId: null, email: null }), 'and somebody with neither cannot')
ok(!canBeTold({ profileId: null, email: '   ' }), '...a blank address being no address')

const CHOSEN: NoticeRecipient[] = [
  { key: 'profile:p1', name: 'Office Sam', email: 'sam@gc.com', profileId: 'p1', source: 'team' },
  { key: 'email:volt@x.com', name: 'Volt Bros', email: 'volt@x.com', profileId: null, source: 'subcontractor' },
  { key: 'email:pipes@x.com', name: 'Pipes R Us', email: 'pipes@x.com', profileId: null, source: 'subcontractor' },
]
const split = splitChannels(CHOSEN)
ok(split.notifyIds.length === 1 && split.notifyIds[0] === 'p1',
  'an account goes through notify(), which carries the bell, the phone and their own email preference')
ok(split.emailOnly.length === 2, '...and the two subs get a plain email')
ok(split.emailOnly.every(e => e.email && e.name), '...addressed by name')

// ONE EVENT, ONE EMAIL. An account holder must never be in both buckets.
const bothIds = new Set(split.notifyIds)
ok(!split.emailOnly.some(e => bothIds.has(e.email)),
  'THE DUPLICATE LETTER: nobody is both notified and emailed for one notice')

// The same address can arrive twice - off the team AND off a subcontract.
const dupe = splitChannels([
  { key: 'email:v@x.com', name: 'Volt', email: 'v@x.com', profileId: null, source: 'team' },
  { key: 'email:V@X.com', name: 'Volt Bros', email: 'V@X.com', profileId: null, source: 'subcontractor' },
])
ok(dupe.emailOnly.length === 1,
  'one person on the team AND on a subcontract gets ONE letter, whatever the case of the address')

// Somebody unreachable cannot be conjured into a send.
ok(splitChannels([{ key: 'x', name: 'Nobody', email: null, profileId: null, source: 'team' }]).emailOnly.length === 0,
  'a recipient with no address and no account produces no send at all')

// ── the letter ──────────────────────────────────────────────────────────────
const mail = scopeChangeEmail({
  projectName: 'QA Ground-Up 2026', planName: 'A-201 Rev C', changedBy: 'Gershon',
  message: 'Slab dropped 1/2 inch', recipientName: 'Volt Bros',
})
ok(/QA Ground-Up 2026/.test(mail.subject) && /A-201 Rev C/.test(mail.subject),
  'the subject names the JOB and the drawing - an inbox clips at about sixty characters')
ok(mail.text.includes('Slab dropped 1/2 inch') && mail.html.includes('Slab dropped 1/2 inch'),
  'the change itself is the message, in both parts')
ok(!!mail.text && mail.text.length > 40,
  'THERE IS A PLAIN-TEXT PART: some clients render only that, and a blank warning is worse than none')
ok(!/\/login|token=/.test(mail.html),
  'NO LOGIN WALL: a sub has nothing to do in the app, and a wall on a warning is how it gets ignored')
ok(/no account or login is needed/i.test(mail.html), '...and it says so')

// ── the route sends both ways ───────────────────────────────────────────────
ok(/splitChannels\(chosen\)/.test(route), 'the route splits the two channels')
ok(/scopeChangeEmail\(/.test(route) && /sendEmail\(/.test(route),
  '...and actually emails the ones with no account')
ok(/emailed: result\.emailed \+ mailed/.test(route),
  'BOTH HALVES COUNT, or the number on screen disagrees with what went out')
ok(/failed\.push/.test(route) && /failed,/.test(route),
  'a letter that did not go is NAMED, not silently dropped from a total')

// The browser must not be able to name an address of its own choosing.
ok(/allowed\.filter\(r => keys\.includes\(r\.key\)\)/.test(route),
  'THE OPEN RELAY: keys are matched against a list rebuilt on the server')

// Subs come off the subcontracts on the job, and only live ones.
ok(/from\('subcontracts'\)/.test(route), 'the recipient list includes the subs contracted on this job')
ok(/sc\.status && sc\.status !== 'active'/.test(route),
  '...but not a finished or terminated contract - that is work they are no longer doing')

// ── the picker ──────────────────────────────────────────────────────────────
ok(/people\.filter\(canBeTold\)/.test(dialog), 'the picker offers anybody reachable, not only account holders')
ok(/No email on file - add one so they can be told/.test(dialog),
  'and only somebody with NEITHER is greyed out, saying why')
ok(/p\.source === 'subcontractor'/.test(dialog),
  'a sub is marked as one - the list mixes your people and theirs')
ok(/recipient_keys: recipientIds/.test(dialog),
  'it sends KEYS, since most recipients have no profile id to send')

// ── IT LEAVES A RECORD ──────────────────────────────────────────────────────
// "now theres no record of these changes anywhere" - and on a scope change that
// is the question that actually gets asked six weeks on: did anybody tell the
// electrician about the slab, and when. An email that left no trace cannot
// answer it, and being told is this notice's entire purpose.
ok(/logActivity\(/.test(route), 'THE RECORD: sending one writes a line to the job history')
ok(/'scope_change_notice'/.test(route), '...under its own type, not borrowed from a neighbour')

// It goes in the JOB HISTORY, not the Sharing tab. `file_shares` is paperwork
// sent to an expeditor or a lender - a different feature that merely sounds
// adjacent, and the one the setup checklist already miscounted once.
ok(!/file_shares/.test(route),
  'NOT the Sharing tab: file_shares is paperwork to an expeditor, a different feature entirely')

// "Notified the team" is not an answer. The NAMES are.
ok(/told: toldNames/.test(route), 'the record names WHO was told')
ok(/emailed: result\.emailed \+ mailed/.test(route), '...and how many letters actually went')
ok(/\bfailed,/.test(route),
  '...including who could NOT be reached - an audit listing only successes answers the easy half')
ok(/plan_name: planName/.test(route) && /message: String\(message\)\.trim\(\)/.test(route),
  '...which drawing, and what was actually said')

// A feed row is a way back to the thing that happened.
ok(ACTIVITY_TAB['scope_change_notice'] === 'plans',
  'the history row opens the drawings, which is what the change is about')
// Both icon tables have to know it, or the row renders blank in one of them.
ok(/scope_change_notice: Megaphone/.test(code('app/(dashboard)/dashboard/page.tsx')),
  'the dashboard feed has an icon for it')
ok(/scope_change_notice: \{ icon: Megaphone/.test(code('components/layout/activity-drawer.tsx')),
  '...and so does the project activity drawer')

done()
