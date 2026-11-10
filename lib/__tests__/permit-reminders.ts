// "yes build 1-4": a morning chase reminder, an expiry warning, a bell when the
// township replies, and the Apply card saying how the township takes
// applications - plus "in settings also full control if it should email and
// who", which the catalog gives every one of them.

import { chaseMessage, EXPIRY_WARN_DAYS, expiryMessage, expiryWarningDays, roundToChase } from '../permit-reminders'
import { applyCardLine, applyHowByAuthority } from '../permit-apply'
import { NOTIFICATION_TYPES } from '../notifications'
import { demoNotification } from '../demo-notification'
import { ok, done, code, read } from './_helpers'

const TODAY = '2026-11-10'
const permit = (over: any = {}) => ({ id: 'p1', project_id: 'j1', permit_type: 'Building', status: 'pending', issuing_authority: 'Toms River Township', ...over })
const round = (over: any = {}) => ({ id: 'r1', permit_id: 'p1', submitted_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z', ...over })

// ── chase: the screen's own rule, once per submission ───────────────────────
ok(roundToChase(permit(), [round()], [], TODAY)?.id === 'r1', 'with the township 40 days and nobody promised a date: chase it')
ok(roundToChase(permit(), [round({ submitted_on: '2026-11-01' })], [], TODAY) === null, '9 days with no promise is not overdue yet')
ok(roundToChase(permit(), [round({ submitted_on: '2026-11-05', expected_by: '2026-11-08' })], [], TODAY)?.id === 'r1',
  'past the date they PROMISED is overdue even when it has only been five days')
ok(roundToChase(permit(), [round({ submitted_on: '2026-10-01', expected_by: '2026-11-20' })], [], TODAY) === null,
  '...and a promise still in the future is not - the same rule that paints Chase on the row')
ok(roundToChase(permit(), [round({ chase_reminded_at: '2026-11-01T11:35:00Z' })], [], TODAY) === null, 'a submission is chased ONCE')
ok(roundToChase(permit(), [round({ outcome: 'corrections', outcome_on: '2026-10-20' })], [], TODAY) === null, 'an answered submission is not chased')

// ── expiry: issued, inside 30 days, once per expiry date ────────────────────
const issued = (over: any = {}) => permit({ status: 'approved', issued_date: '2026-01-05', ...over })
ok(expiryWarningDays(issued({ expiry_date: '2026-12-04' }), [], [], TODAY) === 24, 'an issued permit expiring in 24 days is warned about')
ok(expiryWarningDays(issued({ expiry_date: '2026-12-20' }), [], [], TODAY) === null, `...not 40 days out (the window is ${EXPIRY_WARN_DAYS})`)
ok(expiryWarningDays(issued({ expiry_date: '2026-12-04', expiry_reminder_for: '2026-12-04' }), [], [], TODAY) === null, 'once per expiry date')
ok(expiryWarningDays(issued({ expiry_date: '2026-12-04', expiry_reminder_for: '2025-12-04' }), [], [], TODAY) === 24,
  'renewing moves the date, which re-arms the warning by itself')
ok(expiryWarningDays(issued({ expiry_date: '2026-12-04', status: 'closed' }), [], [], TODAY) === null, 'a closed-out permit says nothing')
ok(expiryWarningDays(permit({ expiry_date: '2026-12-04' }), [], [], TODAY) === null, 'a permit not issued yet has no expiry to warn about')

// ── the words ───────────────────────────────────────────────────────────────
const one = chaseMessage([{ permitType: 'Building', job: '3 Test Lane', authority: 'Toms River Township', days: 23 }])
ok(one.title === 'A permit to chase' && one.message === 'Building at 3 Test Lane - 23 days with Toms River Township. Time to follow up.', `one permit: ${one.message}`)
const many = chaseMessage(Array.from({ length: 7 }, (_, i) => ({ permitType: 'Electrical', job: `Lot ${i}`, authority: null, days: 22 })))
ok(many.title === '7 permits to chase' && /and 2 more/.test(many.message), 'many permits are ONE message, five named and the rest counted')
const exp = expiryMessage({ permitType: 'Building', permitNumber: 'BP-1', job: '3 Test Lane', expiry: '2026-12-04', days: 24, authority: 'Toms River Township' })
ok(exp.message === 'Building permit #BP-1 at 3 Test Lane expires Fri Dec 4 - in 24 days. Start the renewal with Toms River Township before it lapses.',
  `the expiry line names the day in words, weekday included (${exp.message})`)
ok(!/\[object|undefined|null/.test(one.message + many.message + exp.message), 'no sentence prints an object or a missing value')

// ── the catalog: full control in Settings ───────────────────────────────────
for (const key of ['permit_chase', 'permit_expiring', 'permit_reply']) {
  const t = NOTIFICATION_TYPES.find(x => x.key === key)
  ok(!!t && t.status === 'live' && t.audience === 'team' && t.defaultAudience?.[0] === 'permits' && t.defaultAudience?.[1] === 'edit',
    `${key} is a live catalog type - its own row in Settings -> Notifications with in-app and email switches and Who gets told, defaulting to whoever can edit permits`)
  ok(!!demoNotification(key, TODAY), `...and the demo console can rehearse ${key}`)
}
ok(NOTIFICATION_TYPES.find(x => x.key === 'permit_reply')?.defaults.email === false,
  'a reply is NOT emailed by default - the sender already gets the reply itself, forwarded')

// ── the cron: claim, then send; a failed read sends nothing ─────────────────
const cron = code('app/api/cron/permit-reminders/route.ts')
const vercel = JSON.parse(read('vercel.json'))
const job = vercel.crons.find((c: any) => c.path === '/api/cron/permit-reminders')
ok(!!job && !/\*\//.test(job.schedule) && /^\d+ \d+ \* \* \*$/.test(job.schedule), `the job is scheduled, once a day (Hobby refuses more) - ${job?.schedule}`)
ok(/checkCronAuth\(/.test(cron) && /maxDuration = 60/.test(cron), 'it is the cron-secret door, with time to finish')
ok(cron.indexOf(".update({ chase_reminded_at: now })") !== -1
  && /\.update\(\{ chase_reminded_at: now \}\)\s*\.eq\('id', round\.id\)\.is\('chase_reminded_at', null\)/.test(cron)
  && cron.indexOf(".update({ chase_reminded_at: now })") < cron.indexOf("type: 'permit_chase'"),
  'a chase is CLAIMED by one conditional update before anything is sent - two runs cannot both send')
ok(/\.update\(\{ expiry_reminder_for: p\.expiry_date \}\)[\s\S]{0,80}\.or\(`expiry_reminder_for\.is\.null,expiry_reminder_for\.neq\.\$\{p\.expiry_date\}`\)/.test(cron)
  && cron.indexOf('expiry_reminder_for: p.expiry_date') < cron.indexOf("type: 'permit_expiring'"),
  '...and so is an expiry warning, per expiry date')
ok(/if \(!history\.ok\) return NextResponse\.json\(\{ error: 'Could not read permit history\. Nothing was sent\.' \}, \{ status: 500 \}\)/.test(cron)
  && cron.indexOf('if (!history.ok)') < cron.indexOf('await notify('),
  'a history read that failed sends NOTHING - half a history looks like a permit nobody chased')
ok(/chaseByCompany/.test(cron) && /audienceFor\(\{ db, companyId, type: 'permit_chase' \}\)/.test(cron), 'chases go out ONE message per company, to the routed audience')

// ── the reply bell ──────────────────────────────────────────────────────────
const inbound = code('app/api/inbound/email/route.ts')
ok(inbound.indexOf(".from('permit_inbound_emails').insert(") < inbound.indexOf("type: 'permit_reply'"), 'the bell rings only after the reply is stored')
ok(/if \(senderId\) await notify\(\{ db, userIds: \[senderId\], \.\.\.note, inAppOnly: forwarded \}\)/.test(inbound)
  && /const others = team\.filter\(id => id !== senderId\)/.test(inbound) && /await notify\(\{ db, userIds: others, \.\.\.note \}\)/.test(inbound),
  'the sender gets the bell only when the forward already reached them (one event, one email); the rest of the team by their own settings')

// ── the Apply card: how THIS township takes applications ───────────────────
const cards = [
  { id: 'c1', name: 'Toms River Township', type: 'inspector', address: '33 Washington St', extra: { apply_method: 'in_person' } },
  { id: 'c2', name: 'Lakewood', type: 'inspector', address: null, extra: { apply_method: 'portal', apply_url: 'lakewood.gov/permits' } },
  { id: 'c3', name: 'Brick', type: 'inspector', address: null, extra: null },
  { id: 'c4', name: 'Jackson', type: 'inspector', extra: { apply_method: 'email' } },
  { id: 'c5', name: 'Jackson', type: 'inspector', extra: { apply_method: 'in_person' } },
]
const map = applyHowByAuthority(['  toms river  township ', 'Lakewood', 'Brick', 'Jackson', 'Toms River', null], cards)
ok(map['toms river  township']?.method === 'in_person' || map['  toms river  township '.trim()]?.method === 'in_person', 'the card named for the township speaks, case and spacing aside')
ok(!map['Toms River'], 'a partial name borrows no setting - the wrong township\'s rule is worse than none')
ok(!map['Jackson'], 'two cards with one name cannot be told apart, so neither speaks')
ok(!map['Brick'], 'a card nobody has set says nothing')
ok(applyCardLine(map['toms river  township'] ?? map['  toms river  township '.trim()], 'Toms River Township') === 'Toms River Township takes applications in person at 33 Washington St - not by email.',
  'in person names WHERE')
ok(/on their website - not by email/.test(applyCardLine(map['Lakewood'], 'Lakewood') ?? '') && map['Lakewood']?.url === 'https://lakewood.gov/permits',
  'a website setting carries its link')

const panel = code('components/permits/permit-panel.tsx')
ok(/\{sendStage && applyHow && \(/.test(panel) && /applyCardLine\(applyHow, permit\.issuing_authority \?\? ''\)/.test(panel),
  'the Apply card (and a resubmission or renewal) says it, before anybody opens Email it')
ok(/applyHow=\{authorities\[\(openPermit\.issuing_authority \?\? ''\)\.trim\(\)\] \?\? null\}/.test(code('app/(dashboard)/projects/[id]/permits/page.tsx'))
  && /applyHow=\{data\.authorities\?\.\[\(permit\.issuing_authority \?\? ''\)\.trim\(\)\] \?\? null\}/.test(code('components/permits/permit-board.tsx')),
  '...on the Permits list and on a development\'s board')
for (const r of ['app/api/projects/[id]/permits/route.ts', 'app/api/projects/[id]/permit-board/route.ts']) {
  ok(/authoritiesFor\(db, gate\.actor\.companyId, /.test(code(r)), `${r} reads the settings from the caller's own Directory, through the one helper`)
}

done()
