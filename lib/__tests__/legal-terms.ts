// The Terms of Service are agreed to, not assumed - and say what the owner
// needs them to say.
//
// The page existed from July and nobody ever agreed to it: signup had no box
// and no link. The create-account form now requires one, the route refuses
// without it and records when and which version, and the login screen says
// what governs the Service for every account that predates the box.

import { TERMS_SECTIONS, TERMS_VERSION, TERMS_INTRO } from '../legal/terms'
import { ok, done, code, read } from './_helpers'

const text = [TERMS_INTRO, ...TERMS_SECTIONS.flatMap(s => [s.h, ...(s.body ?? []), ...(s.list ?? [])])].join('\n')
const has = (re: RegExp, what: string) => ok(re.test(text), `the terms cover ${what}`)

has(/not liable for any loss, corruption, deletion, unavailability or delay of Customer Data/, 'data loss, however it happens')
has(/outage of our hosting, database or other providers/, 'a database or hosting outage by name')
has(/responsible for keeping your own copies/, 'the customer keeping their own backups')
has(/no uptime or service-level commitment/, 'no uptime promise')
has(/We do not publish your Customer Data and we do not sell it/, 'data being private')
has(/Anybody who has such a link can open what it shows/, 'shared links being the sharer\'s responsibility (true of the code - portal, share and bid links open without a sign-in)')
has(/not .{0,40}engineering, architectural, legal, accounting, tax, insurance, safety or code-compliance advice/, 'no professional advice')
has(/AI output can be inaccurate/, 'AI output')
has(/may be delayed, filtered as spam, not delivered/, 'missed notifications and emails')
has(/does not move money between you and your clients/, 'not moving money (true: payments are recorded, not processed)')
has(/ONE HUNDRED US DOLLARS/, 'a liability cap that is not zero while the beta is free')
has(/You will defend, indemnify and hold harmless/, 'indemnification')
has(/Events beyond our control/, 'force majeure')
has(/within one year/, 'a time limit on claims')
has(/QuickBooks Online/, 'the QuickBooks connection')
ok(!/[–—]/.test(text), 'no em or en dashes (house style)')
ok(/^\d{4}-\d{2}-\d{2}$/.test(TERMS_VERSION), 'the version is a date')

// ── agreed, not assumed ──────────────────────────────────────────────────────
const form = code('app/(auth)/signup/page.tsx')
ok(/type="checkbox" checked=\{agreed\}/.test(form), 'the create-account form has the box')
ok(form.indexOf('if (!agreed)') > 0 && form.indexOf('if (!agreed)') < form.indexOf('supabase.auth.signUp'),
  '...asked BEFORE the auth account exists, so a refusal leaves no orphan login')
ok(/acceptedTerms: agreed/.test(form), '...and sends the answer')
ok(!/disabled=\{[^}]*agreed/.test(form), '...without greying out the button (a disabled button explains nothing)')

const route = code('app/api/complete-signup/route.ts')
ok(/acceptedTerms !== true/.test(route), 'the route refuses without it')
ok(/terms_accepted_at: new Date\(\)\.toISOString\(\), terms_version: TERMS_VERSION/.test(route),
  '...and records when and which version - the SERVER\'s version, never the body\'s')

// ── the links never lead to Pricing (the iOS app opens this form from an invite) ─
for (const f of ['app/(auth)/signup/page.tsx', 'app/(auth)/login/page.tsx']) {
  const src = read(f)
  ok(/href="\/auth\/legal\/terms"/.test(src) && /href="\/auth\/legal\/privacy"/.test(src), `${f} links the bare legal copies`)
  ok(!/href="\/terms"|href="\/privacy"/.test(src), `${f} never links the marketing pages, whose header carries Pricing`)
}
for (const d of ['terms', 'privacy']) {
  const bare = read(`app/auth/legal/${d}/page.tsx`)
  ok(/<LegalDoc bare/.test(bare) && /index: false/.test(bare), `/auth/legal/${d} is bare and not indexed`)
  ok(new RegExp(`from '@/lib/legal/${d}'`).test(bare) && new RegExp(`from '@/lib/legal/${d}'`).test(read(`app/(marketing)/${d}/page.tsx`)),
    `...and it and /${d} read ONE text`)
}
ok(/bare \? '\.'/.test(read('components/marketing/legal-doc.tsx')), 'a bare legal page has no link onward into the marketing site')
ok(/terms_accepted_at/.test(read('supabase/migrations/152_terms_acceptance.sql')), 'migration 152 adds the columns')

done()
