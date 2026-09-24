// EDITABLE WORDS, WITHOUT A SECOND HOME FOR THEM.
//
// "One fact, ONE home" is the oldest rule in this repo, and a table of email
// copy is exactly the shape it warns about. The arrangement that makes it safe
// is narrow and every assertion here guards a piece of it:
//
//   * the CODE is the default and a row only ever OVERRIDES it, so a table that
//     is empty, unreachable or wiped still sends a real, shipped sentence;
//   * the RULES are not editable - when a nudge goes and whether it goes at all
//     stay in the pinned modules, because a console that can edit conditions is
//     a console that can send "create your first job" to somebody with three;
//   * and the console cannot be used to walk around the suite. The trial-length
//     pin reads SOURCE FILES; it cannot see a sentence typed into a browser, so
//     `copyProblem` has to refuse one here.

import {
  COPY_SLUGS, MERGE_TAGS, copySlug, copyProblem, applyTags, tagsIn,
  paragraphs, withSamples,
} from '../email-copy'
import { NUDGES } from '../onboarding-nudges'
import { TRIAL_WARNING_DAYS_LEFT, trialCopy } from '../trial-warning'
import { TRIAL_DAYS } from '../plans'
import { ok, done, code, read, readCombined } from './_helpers'

// ── every sequence is covered, and DERIVED rather than retyped ──────────────
// A sixth nudge appears here with its copy already in place; the two lists
// cannot drift into disagreeing about how many there are.
for (const n of NUDGES) {
  const spec = copySlug(`nudge:${n.key}`)
  ok(!!spec, `${n.key}: the nudge is editable`)
  ok(spec?.fallback.subject === n.title, `${n.key}: ...and its default IS the code copy, not a retyping of it`)
  ok(spec?.fallback.body === n.message, `${n.key}: ...body too`)
}
for (const left of TRIAL_WARNING_DAYS_LEFT) {
  const spec = copySlug(`trial:${left}`)
  ok(spec?.fallback.subject === trialCopy(left).title, `trial ${left}: default comes from trialCopy`)
}
ok(!!copySlug('welcome'), 'and the welcome email is editable')
ok(COPY_SLUGS.length === NUDGES.length + TRIAL_WARNING_DAYS_LEFT.length + 1,
  'there is exactly one slug per email and no orphan')

// ── merge tags are a CLOSED set, refused at the door ─────────────────────────
ok(tagsIn('Hi {{first_name}}, you have {{days_left}} days').join(',') === 'first_name,days_left',
  'the tags in a sentence are readable')
ok(applyTags('Hi {{first_name}}', { first_name: 'Dana' }) === 'Hi Dana', 'a tag is filled in')
// LEFT ALONE, not blanked. An empty space where a name should be reads as a bug
// to the person holding it; a visible {{first_name}} reads as a bug to US,
// which is the one that gets fixed.
ok(applyTags('Hi {{first_name}}', {}) === 'Hi {{first_name}}',
  'a tag with no value is left visible rather than blanked')

const nudge = `nudge:${NUDGES[0].key}`
ok(copyProblem(nudge, { subject: 'Hi', body: 'Body {{first_name}}' }) === null,
  'a tag the email can fill is allowed')
const unknown = copyProblem(nudge, { subject: 'Hi', body: 'Body {{days_left}}' })
ok(!!unknown && /days_left/.test(unknown),
  'a tag NOTHING fills is refused, and named - it would reach them exactly like that')
ok(/\{\{first_name\}\}/.test(unknown ?? ''), '...and the refusal says which ones do work here')

// ── the console cannot walk around the trial-length rule ────────────────────
// THE HOLE THIS CLOSES. `plans-and-landing.ts` scans source files for a trial
// claim that is not TRIAL_DAYS. It cannot read the database, so without this
// check a stored "your first 30 days are free" passes every suite and lands in
// an inbox.
const wrong = copyProblem('welcome', { subject: 'Hi', body: 'Your first 30 days are free.', cta: 'Go' })
ok(!!wrong && /\b30\b/.test(wrong) && wrong.includes(String(TRIAL_DAYS)) && /trial_days/.test(wrong),
  'a stored sentence naming the wrong trial length is refused - naming both numbers and the tag to use instead')
ok(copyProblem('welcome', { subject: 'Hi', body: `Your first ${TRIAL_DAYS} days are free.`, cta: 'Go' }) === null,
  '...and the right one is fine')
ok(copyProblem('welcome', { subject: 'Hi', body: 'Your first {{trial_days}} days are free.', cta: 'Go' }) === null,
  '...as is the tag, which is what we want them to use')
// A trial warning counts DOWN, so "3 days" there is correct and must not be
// refused - the check has to know which emails are allowed to say a number.
ok(copyProblem('trial:3', { subject: '3 days left', body: 'You have 3 days.' }) === null,
  'a trial warning may say a number of days, because that is what it is counting')

// ── the everyday refusals ───────────────────────────────────────────────────
ok(!!copyProblem(nudge, { subject: '', body: 'x' }), 'an empty subject is refused')
ok(!!copyProblem(nudge, { subject: 'x', body: '' }), 'an empty body is refused')
ok(!!copyProblem('welcome', { subject: 'x', body: 'y', cta: '' }), 'a button with no label is refused')
ok(!!copyProblem('nope', { subject: 'x', body: 'y' }), 'an unknown slug is refused')
ok(!!copyProblem(nudge, { subject: 'x'.repeat(200), body: 'y' }), 'a subject too long for an inbox is refused')

// ── paragraphs and preview ──────────────────────────────────────────────────
ok(paragraphs('one\n\ntwo\n\n\nthree').length === 3, 'a blank line starts a new paragraph')
ok(paragraphs('  ').length === 0, 'and whitespace is not a paragraph')
const sampled = withSamples({ subject: 'Hi {{first_name}}', body: '{{trial_days}} days', cta: null })
ok(!/\{\{/.test(sampled.subject + sampled.body), 'the preview fills every tag with a sample')
ok(MERGE_TAGS.every(t => t.sample.length > 0), '...and every tag has one')

// ═══════════════════════════════════════════════════════════════════════════
// THE WIRING
// ═══════════════════════════════════════════════════════════════════════════

// ── the database is an OVERRIDE, never a source ─────────────────────────────
const reader = code('lib/email-copy-read.ts')
ok(/source: 'default'/.test(reader) && /source: 'stored'/.test(reader),
  'the reader says which of the two it is serving')
ok(/\.\.\.spec\.fallback, source: 'default'/.test(reader),
  'no row means the CODE copy ships - an empty table is a working product')
ok(/could not read overrides/.test(reader),
  'and a failed read falls back to the code, logged rather than silent')

// RESET DELETES THE ROW. Writing the default into it is indistinguishable from
// a deliberate edit that happens to match, and the next improvement to the
// default would silently not reach that slug.
const route = code('app/api/admin/email-copy/route.ts')
ok(/\.delete\(\)\.eq\('slug', slug\)/.test(route), 'reset deletes the row rather than storing the default')
ok(route.indexOf('isSuperAdmin') < route.indexOf('request.json()'),
  'the console is super-admin only, gated before the body is read')
ok(/copyProblem\(/.test(route), 'the route asks the same rule the form does')
const page = code('app/admin/marketing/page.tsx')
ok(/copyProblem\(/.test(page), '...and the form asks it too, so a refusal lands on the field')

// ── the three senders read the override ─────────────────────────────────────
for (const [f, what] of [
  ['app/api/complete-signup/route.ts', 'the welcome'],
  ['app/api/cron/onboarding-nudges/route.ts', 'the nudges'],
  ['app/api/cron/trial-reminders/route.ts', 'the trial warnings'],
] as const) {
  ok(/resolveCopy\(|resolveAll\(/.test(code(f)), `${what} send the edited words when there are any`)
}

// ── but the RULES are not editable ──────────────────────────────────────────
// The whole safety of this arrangement. A slug carries a subject, a body and a
// button label - and nothing about when it fires or who it reaches.
for (const spec of COPY_SLUGS) {
  const keys = Object.keys(spec.fallback)
  ok(keys.every(k => ['subject', 'body', 'cta'].includes(k)),
    `${spec.slug}: only words are editable - no day, no condition, no audience`)
}
const m122 = read('supabase/migrations/122_email_copy.sql').replace(/--[^\n]*/g, '')
ok(!/day|delay|trigger|audience|condition/i.test(m122),
  'the table holds no schedule and no condition either')
ok(/slug TEXT PRIMARY KEY/.test(m122), 'one row per email at most')
ok(/updated_by/.test(m122) && /ON DELETE SET NULL/.test(m122),
  'and it records who changed the words, outliving their account')
ok(/email_copy/.test(readCombined()), 'the combined migration carries it')

// The nudge module is still the one deciding, and still pure.
const nudges = code('lib/onboarding-nudges.ts')
ok(!/email_copy|supabase|createClient/.test(nudges),
  'lib/onboarding-nudges.ts stays pure - the console cannot reach the rules')

// ── the console tells the truth about which it is showing ───────────────────
ok(/Edited/.test(page), 'an overridden email is marked as edited')
ok(/Reset/.test(page), '...and can be put back')
ok(/stays in the code where it is tested/.test(page),
  'and the screen says out loud that the schedule is not editable here')
ok(/sandbox=""/.test(page), 'the preview iframe is sandboxed')

done()
