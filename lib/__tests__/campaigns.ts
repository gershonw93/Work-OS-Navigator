import { ok, done, read, code } from './_helpers'
import {
  SEGMENTS, segmentByKey, peopleFor, parseAddressList, normaliseEmail,
  withoutSuppressed, isTenant, type CampaignPerson,
} from '../campaign-audience'
import { campaignProblem, fillCampaign, CAMPAIGN_TAGS } from '../campaign-copy'
import { signUnsubscribe, verifyUnsubscribe, unsubscribeUrl } from '../unsubscribe-token'
import { buildSendGridPayload, emailConfig, campaignEmail } from '../email'
import { TRIAL_DAYS } from '../plans'

// ─────────────────────────────────────────────────────────────────────────────
// BULK MAIL, which is a different animal from everything else this app sends.
//
// The three things that cannot be taken back, in the order they would happen:
// a subcontractor on a list, a suppressed address getting one anyway, and an
// unsubscribe that starts eating transactional mail. Every assertion below was
// checked by reintroducing the fault.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-09-24T12:00:00Z')

const person = (over: Partial<CampaignPerson> = {}): CampaignPerson => ({
  profileId: 'p1',
  email: 'dana@whitfield.com',
  firstName: 'Dana Whitfield',
  companyId: 'c1',
  companyName: 'Whitfield Builders',
  companyType: 'gc',
  billing: { status: 'trialing', trial_ends_at: '2026-10-05T00:00:00Z' },
  projects: 2,
  lastSignInAt: '2026-09-23T09:00:00Z',
  ...over,
})

// ── a subcontractor is never on a list ──────────────────────────────────────
//
// ASSERTED OVER EVERY SEGMENT AT ONCE, not one at a time. A per-segment check
// is a check the twelfth segment is added without, which is exactly the failure
// the shared gate exists to prevent.
const sub = person({ profileId: 'p2', email: 'mike@concrete.com', companyId: 'c2', companyType: 'subcontractor' })
const inspector = person({ profileId: 'p3', email: 'tw@city.gov', companyId: 'c3', companyType: 'inspector' })
const everyone = [person(), sub, inspector]

let leaked: string[] = []
for (const s of SEGMENTS) {
  const got = peopleFor(s.key, everyone, NOW)
  if (got.some(p => !isTenant(p))) leaked.push(s.key)
}
ok(SEGMENTS.length >= 10, `there are segments to check (${SEGMENTS.length})`)
ok(leaked.length === 0,
  `NO segment ever returns somebody at a non-GC company${leaked.length ? ` - ${leaked.join(', ')}` : ''}`)
ok(peopleFor('everyone', everyone, NOW).length === 1,
  '...so "everyone" is our customers, not every company row')

// ── each segment answers its own question ───────────────────────────────────
const onTrial = person({ billing: { status: 'trialing', trial_ends_at: '2026-10-05T00:00:00Z' } })
const endingSoon = person({ profileId: 'p4', email: 'a@b.com', billing: { status: 'trialing', trial_ends_at: '2026-09-26T00:00:00Z' } })
const paying = person({ profileId: 'p5', email: 'c@d.com', billing: { status: 'active', plan_key: 'up-to-10' } })
const free = person({ profileId: 'p6', email: 'e@f.com', billing: { status: 'comped' } })
const lockedOut = person({ profileId: 'p7', email: 'g@h.com', billing: { status: 'canceled' } })
const blank = person({ profileId: 'p8', email: 'i@j.com', projects: 0 })
const stranger = person({ profileId: 'p9', email: 'k@l.com', lastSignInAt: null })
const quietWeek = person({ profileId: 'pa', email: 'm@n.com', lastSignInAt: '2026-09-15T09:00:00Z' })

const cohort = [onTrial, endingSoon, paying, free, lockedOut, blank, stranger, quietWeek]
const inSegment = (key: string) => peopleFor(key, cohort, NOW).map(p => p.email)

ok(inSegment('trial').includes(onTrial.email) && !inSegment('trial').includes(paying.email),
  'on trial: catches a trial and not a subscription')
ok(inSegment('trial-ending').includes(endingSoon.email) && !inSegment('trial-ending').includes(onTrial.email),
  'trial ending: two days left is in, eleven days left is not')
ok(inSegment('paid').includes(paying.email) && !inSegment('paid').includes(free.email),
  'on a plan: a subscription, not a comp')
ok(inSegment('comped').includes(free.email) && inSegment('comped').length === 1,
  'free access: only the comped one')
ok(inSegment('locked').includes(lockedOut.email) && !inSegment('locked').includes(onTrial.email),
  'read-only: a cancelled plan, not a live trial')
ok(inSegment('no-project').includes(blank.email) && !inSegment('no-project').includes(onTrial.email),
  'no job yet: nobody with a job in it')
ok(inSegment('never-signed-in').includes(stranger.email) && inSegment('never-signed-in').length === 1,
  'never signed in: only the account nobody has used')
ok(inSegment('quiet-7').includes(quietWeek.email) && !inSegment('quiet-7').includes(onTrial.email),
  'quiet for a week: nine days ago is in, yesterday is not')
ok(inSegment('quiet-7').includes(stranger.email),
  '...and somebody who never signed in is quiet too, not silently dropped')
ok(!inSegment('quiet-14').includes(quietWeek.email),
  'quiet for a fortnight: nine days ago is not yet a fortnight')

// A TYPED-IN SEGMENT SELECTS NOBODY. The addresses come from a box, and a
// `matches` that returned true for these would mail the whole database to
// somebody who asked for one test.
ok(peopleFor('one-address', cohort, NOW).length === 0, 'one address: selects nobody from the database')
ok(peopleFor('pasted-list', cohort, NOW).length === 0, 'a pasted list: selects nobody from the database')
ok(peopleFor('not-a-segment', cohort, NOW).length === 0, 'an unknown segment is nobody, never everybody')

// One person is one recipient, however many rows they have.
const twice = [person(), person({ profileId: 'dup', email: 'DANA@Whitfield.com' })]
ok(peopleFor('everyone', twice, NOW).length === 1, 'one address is one recipient, whatever its case')

// ── suppression ─────────────────────────────────────────────────────────────
ok(withoutSuppressed([{ email: 'Dana@Whitfield.com' }], ['dana@whitfield.com']).length === 0,
  'a suppressed address is dropped whatever case it is written in')
ok(withoutSuppressed([{ email: 'other@x.com' }], ['dana@whitfield.com']).length === 1,
  '...and nobody else is')

// THE ONE THAT KEEPS AN UNSUBSCRIBE FROM EATING TRANSACTIONAL MAIL.
// If `sendEmail` ever consults the suppression list, one unsubscribe starts
// silently swallowing invoices, bid requests and password resets.
const emailSrc = code('lib/email.ts')
ok(!/email_suppressions/.test(emailSrc),
  'sendEmail does NOT consult the suppression list - an unsubscribe stops broadcasts only')
ok(!/readSuppressions|withoutSuppressed/.test(emailSrc),
  '...and does not reach for it under another name either')
const sendSrc = code('lib/campaign-send.ts')
ok(/readSuppressions\(/.test(sendSrc), 'the campaign sender is the one that asks')
// AT SEND TIME, not only at list build. Somebody can unsubscribe between a
// campaign being scheduled and it going out, and this is the check that sees it.
ok(/drainCampaign[\s\S]*?readSuppressions\(/.test(sendSrc),
  '...inside the drain, so a list built days ago is re-checked before the letter')
ok(/suppressed\.has\([\s\S]{0,80}'skipped'/.test(sendSrc),
  '...and a suppressed recipient is marked skipped rather than sent')
const readSrc = code('lib/campaign-audience-read.ts')
ok(/return null/.test(readSrc.split('readSuppressions')[1] ?? ''),
  'a suppression list that could not be READ answers null, never an empty set')

// ── the recipient rows ──────────────────────────────────────────────────────
// Written before a single letter goes: the gate, the record and the resume
// point, all one table.
const routeSrc = code('app/api/admin/campaigns/route.ts')
const insertAt = routeSrc.indexOf("from('campaign_recipients').insert(")
const drainAt = routeSrc.indexOf('drainCampaign(')
ok(insertAt > 0 && drainAt > insertAt,
  'the recipient rows are written BEFORE anything is sent')
ok(/uniq_campaign_recipient[\s\S]*?campaign_id, lower\(email\)/.test(read('supabase/migrations/123_campaigns_and_suppressions.sql')),
  'the gate against a double send is a unique index, not a check')
ok(/ON DELETE CASCADE/.test(read('supabase/migrations/123_campaigns_and_suppressions.sql')),
  'a deleted campaign takes its recipient rows with it')
// ONE BAD ADDRESS MUST NOT TAKE THE REST OF THE LIST DOWN.
ok(/status: 'failed'|'failed'/.test(sendSrc) && !/throw /.test(sendSrc),
  'a failed recipient is recorded and the run carries on')
ok(/\.eq\('status', 'pending'\)/.test(sendSrc),
  'a re-run picks up what is still pending, so nobody is sent twice')

// ── the way out ─────────────────────────────────────────────────────────────
const mine = signUnsubscribe('dana@whitfield.com')
ok(verifyUnsubscribe('dana@whitfield.com', mine), 'a token verifies for its own address')
ok(verifyUnsubscribe('DANA@Whitfield.com ', mine), '...however it is capitalised')
ok(!verifyUnsubscribe('sam@whitfield.com', mine),
  'a token does NOT verify for anybody else - a forwarded email cannot unsubscribe its sender')
ok(!verifyUnsubscribe('dana@whitfield.com', mine.slice(0, -2) + 'ff'), 'a tampered token fails')
ok(!verifyUnsubscribe('dana@whitfield.com', 'short'), 'a token of the wrong length fails rather than throwing')
ok(!verifyUnsubscribe('dana@whitfield.com', null), 'no token at all fails')
ok(unsubscribeUrl('https://app.sytenav.com/', 'Dana@Whitfield.com')
  === `https://app.sytenav.com/unsubscribe?e=${encodeURIComponent('dana@whitfield.com')}&t=${mine}`,
  'the link carries the address and its token, lowercased')

// ── the headers Gmail and Yahoo require of bulk senders ─────────────────────
const cfg = emailConfig({ SENDGRID_API_KEY: 'x' } as unknown as NodeJS.ProcessEnv)
const bulk = buildSendGridPayload(
  { to: 'a@b.com', subject: 's', text: 't', unsubscribeUrl: 'https://app.sytenav.com/unsubscribe?e=a' },
  cfg,
) as { headers?: Record<string, string> }
ok(bulk.headers?.['List-Unsubscribe'] === '<https://app.sytenav.com/unsubscribe?e=a>',
  'bulk mail carries List-Unsubscribe')
ok(bulk.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click',
  '...and the one-click header beside it')

const transactional = buildSendGridPayload({ to: 'a@b.com', subject: 's', text: 't' }, cfg) as { headers?: unknown }
ok(transactional.headers === undefined,
  'a transactional email carries NEITHER - offering to unsubscribe from a password reset is a promise we will not keep')

// The template itself always has one. A campaign with no way out is the thing
// a spam report is for.
const letter = campaignEmail({
  name: 'Dana Whitfield', subject: 'Something new', paragraphs: ['A line.'],
  unsubscribeUrl: 'https://app.sytenav.com/unsubscribe?e=a&t=b',
})
ok(letter.html.includes('https://app.sytenav.com/unsubscribe?e=a&amp;t=b'),
  'the campaign footer carries the unsubscribe link')
ok(/Unsubscribe/.test(letter.text), '...and so does the plain-text part')
ok(/still get/i.test(letter.html), '...and it says what will keep coming')

// ── what a campaign may say ─────────────────────────────────────────────────
const base = { name: 'October', subject: 'Hello', body: 'A line.', segment: 'everyone', customEmails: null }
ok(campaignProblem(base) === null, 'a sound campaign is accepted')
ok(campaignProblem({ ...base, name: '' }) !== null, 'a campaign needs a name')
ok(campaignProblem({ ...base, subject: '' }) !== null, 'a campaign needs a subject')
ok(campaignProblem({ ...base, body: '' }) !== null, 'a campaign needs a body')
ok(campaignProblem({ ...base, segment: '' }) !== null, 'a campaign needs somebody to go to')
ok(campaignProblem({ ...base, segment: 'made-up' }) !== null, 'an unknown segment is refused')
ok(campaignProblem({ ...base, segment: 'one-address', customEmails: '' }) !== null,
  'an address segment with no addresses is refused - a send to nobody must not be recorded as a send')
ok(campaignProblem({ ...base, segment: 'one-address', customEmails: 'a@b.com, c@d.com' }) !== null,
  '...and "one address" means one')
ok(campaignProblem({ ...base, body: 'Hi {{frist_name}}' }) !== null,
  'a misspelled merge tag is refused rather than printed to a customer')
ok(campaignProblem({ ...base, body: 'Hi {{days_left}}' }) !== null,
  '...and so is a tag that means nothing to a LIST of people on different days')
// THE HOLE THE LAST CONSOLE OPENED. `plans-and-landing.ts` keeps every public
// page honest about TRIAL_DAYS by scanning SOURCE FILES, and cannot see a
// sentence typed into a browser.
ok(campaignProblem({ ...base, body: 'Your first 30 days are free.' }) !== null,
  'a campaign claiming the wrong trial length is refused, same as stored copy')
ok(campaignProblem({ ...base, body: `Your first ${TRIAL_DAYS} days are free.` }) === null,
  '...and the right one is fine')
ok(campaignProblem({ ...base, body: 'Your first {{trial_days}} days are free.' }) === null,
  '...and the tag is what we want them to use')

const filled = fillCampaign({ subject: 'Hi {{first_name}}', body: '{{company}} - {{trial_days}} days' },
  { firstName: 'Dana Whitfield', companyName: 'Whitfield Builders' })
ok(filled.subject === 'Hi Dana', 'the first name is a first name, not the whole one')
ok(filled.paragraphs[0] === `Whitfield Builders - ${TRIAL_DAYS} days`, 'the other tags fill in')
ok(fillCampaign({ subject: 'Hi {{first_name}}', body: 'x' }, {}).subject === 'Hi there',
  'a missing name gets a word, not a visible tag')
ok(CAMPAIGN_TAGS.every(t => campaignProblem({ ...base, body: `{{${t}}}` }) === null),
  'every tag the console offers is one the sender fills')

// ── addresses out of a box ──────────────────────────────────────────────────
ok(parseAddressList('a@b.com, c@d.com\ne@f.com').length === 3, 'commas and newlines both split a list')
ok(parseAddressList('A@B.com a@b.com').length === 1, 'the same address twice is one recipient')
ok(parseAddressList('not-an-address').length === 0, 'something with no @ in it is not an address')
ok(normaliseEmail('  Dana@X.com ') === 'dana@x.com', 'one spelling of an address, everywhere')

// ── the doors ───────────────────────────────────────────────────────────────
// SUPER ADMIN BEFORE THE BODY IS READ - no field in a request is a permission.
// Read out of the POST body itself, not off the whole file: `gate()` is
// defined above every handler, so a file-wide index would report the gate as
// "first" even for a handler that never calls it.
const post = routeSrc.slice(routeSrc.indexOf('export async function POST'))
ok(/isSuperAdmin\(user\.email\)/.test(routeSrc) && /status: 403/.test(routeSrc),
  'the route has a super-admin gate at all')
ok(post.indexOf('gate(request)') > 0 && post.indexOf('request.json()') > post.indexOf('gate(request)'),
  'POST passes that gate BEFORE it reads the body - no field in a request is a permission')
ok(/campaignProblem\(/.test(routeSrc), 'the route asks campaignProblem itself, not only the form')
ok(/campaignProblem\(/.test(code('app/admin/marketing/campaigns.tsx')),
  '...and the form asks it too, so a refusal lands on the field')

const cronSrc = code('app/api/cron/campaign-send/route.ts')
const authAt = cronSrc.indexOf('checkCronAuth')
const dbAt = cronSrc.indexOf("from('email_campaigns')")
ok(authAt > 0 && dbAt > authAt, 'the cron checks CRON_SECRET before it reads anything')
const crons = JSON.parse(read('vercel.json')).crons as { path: string; schedule: string }[]
const campaignCron = crons.find(c => c.path === '/api/cron/campaign-send')
ok(!!campaignCron, 'the cron is actually scheduled - a route nothing calls sends nothing')

// THE SCHEDULE HAS TO BE ONE THE PLAN ALLOWS. This shipped as `*/10 * * * *`
// and Vercel's Hobby plan refuses any cron more frequent than daily - it fails
// the BUILD, so the whole deploy goes with it, and the feature that looks
// finished is one nobody can even deploy. A step value in the minute or hour
// field is the tell.
ok(!!campaignCron && !/\*\//.test(campaignCron.schedule),
  `the campaign cron fires at most once a day (${campaignCron?.schedule}) - more often is refused on Hobby`)

// AND THE SEND DOES NOT DEPEND ON IT. With a daily cron, a campaign that only
// queues is a campaign nobody sees go out until tomorrow. The route drains
// what it can in the request that pressed Send, unconditionally - the cron
// picks up whatever was past the cap.
ok(/const drained = await drainCampaign\(/.test(routeSrc),
  'the send route drains inline, so pressing Send actually sends')
ok(!/if \(recipients\.length <=[\s\S]{0,120}drainCampaign\(/.test(routeSrc),
  '...and not only for a handful, which would leave a real campaign waiting a day')
ok(/remaining:/.test(routeSrc),
  'and it reports what it could NOT reach, rather than implying everybody was mailed')

// The audience read refuses to become a smaller list.
ok(/audience\.complete/.test(code('lib/campaign-send.ts')),
  'an incomplete audience read is refused, never quietly narrowed')

// A picker with a default on it is a claim, and this one would claim "everyone".
ok(/const \[segment, setSegment\] = useState\(''\)/.test(code('app/admin/marketing/campaigns.tsx')),
  'the segment picker starts empty')

done()
