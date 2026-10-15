// "approvals must come with a free login i think"
//
// The client's link is a bearer token that gets texted and forwarded, so it
// cannot be what agrees to spend money. Answering a change order needs a
// session for the address on the job's customer record, started by a code
// emailed to that address. These pin the parts that would quietly turn it back
// into "anybody holding the link".

import { sameEmail, maskEmail, normalizeCode, codeProblem, codeRateProblem, MAX_ATTEMPTS, CODES_PER_HOUR } from '../portal-login'
import { hashCode, codeMatches, makeCode } from '../portal-login-server'
import { portalLoginCodeEmail } from '../email'
import { ok, done, code, read } from './_helpers'

process.env.PORTAL_LOGIN_SECRET = process.env.PORTAL_LOGIN_SECRET || 'test-secret'

// ── the pure half ──────────────────────────────────────────────────────────
ok(sameEmail(' Sam@Example.com', 'sam@example.com'), 'case and spacing never decide whether two addresses are one person')
ok(!sameEmail('', '') && !sameEmail(null, null), '...and two blanks are not a match')
ok(!sameEmail('sam@example.com', 'sam@example.co'), '...a different address is a different person')
ok(maskEmail('sam@example.com') === 's**@example.com' && !maskEmail('samantha@example.com').includes('amantha'),
  'the page is told a MASKED address - enough to recognise, not to harvest')
ok(normalizeCode('123 456') === '123456' && normalizeCode('123-456') === '123456', 'spaces and dashes a person types are forgiven')
ok(normalizeCode('12345') === null && normalizeCode('abcdef') === null && normalizeCode(123456) === null, '...anything else is not a code')

const now = new Date('2026-10-15T12:00:00Z')
const fresh = { expires_at: '2026-10-15T12:05:00Z', attempts: 0, used_at: null }
ok(codeProblem(fresh, now) === null, 'a fresh code can be tried')
ok(!!codeProblem(null, now), 'no code asked for, nothing to try')
ok(/used/.test(codeProblem({ ...fresh, used_at: '2026-10-15T11:59:00Z' }, now) ?? ''), 'a used code is dead')
ok(/expired/.test(codeProblem({ ...fresh, expires_at: '2026-10-15T12:00:00Z' }, now) ?? ''), 'a code is dead AT its expiry, not a moment after')
ok(/Too many/.test(codeProblem({ ...fresh, attempts: MAX_ATTEMPTS }, now) ?? ''), `the ${MAX_ATTEMPTS}th wrong try kills it`)
ok(codeProblem({ ...fresh, attempts: MAX_ATTEMPTS - 1 }, now) === null, '...and not one sooner')
ok(codeRateProblem(CODES_PER_HOUR - 1) === null && !!codeRateProblem(CODES_PER_HOUR), 'a forwarded link cannot flood the client\'s inbox')

// ── the hash ───────────────────────────────────────────────────────────────
const c = makeCode()
ok(/^\d{6}$/.test(c), 'a code is six digits')
const h = hashCode(c, 'p1', 'Sam@Example.com')
ok(codeMatches(c, 'p1', 'sam@example.com', h), 'the right code for that job and address matches')
ok(!codeMatches(c, 'p2', 'sam@example.com', h), '...a hash from another job does not')
ok(!codeMatches(c, 'p1', 'other@example.com', h), '...nor for another address')
ok(!codeMatches(c === '000000' ? '000001' : '000000', 'p1', 'sam@example.com', h), '...nor a different code')
ok(!h.includes(c), 'only a keyed hash is stored, never the code')

const mail = portalLoginCodeEmail({ code: '123456', projectName: 'Oak St', minutes: 10 })
ok(mail.subject.includes('123456') || mail.text.includes('123456'), 'the email carries the code')
ok(/10 minutes/.test(mail.text) && !/\[object Object\]|undefined|null/.test(mail.text), '...and how long it lasts, in words')

// ── the routes ─────────────────────────────────────────────────────────────
const send = code('app/api/portal/[token]/login/code/route.ts')
ok(/clientEmailFor\(db, \(project as any\)\.customer_id\)/.test(send) && !/body\??\.email|payload\??\.email/.test(send),
  'the code goes to the address on the customer record - NEVER one the page supplies')
ok(/if \(countErr\) \{[\s\S]{0,260}status: 503/.test(send), 'a rate cap that cannot be read REFUSES - an unread limit on a public endpoint is no limit')
ok(send.indexOf("from('portal_login_codes').insert(") < send.indexOf('sendEmail('), 'the hash is written BEFORE the send')
ok(/code_hash: hashCode\(/.test(send) && !/\bcode,\s*\n|\bcode: code\b/.test(send.slice(send.indexOf('.insert('), send.indexOf('if (insErr)'))),
  '...and only the hash')
ok(/to: maskEmail\(email\)/.test(send), 'the page is told the masked address')

const verify = code('app/api/portal/[token]/login/verify/route.ts')
ok(/codeProblem\(row as any, new Date\(\)\)/.test(verify), 'used, expired and over-tried codes are refused')
ok(/attempts: \(row as any\)\.attempts \+ 1/.test(verify), 'a wrong code counts against the limit')
ok(/\.update\(\{ used_at:[\s\S]{0,200}\.is\('used_at', null\)/.test(verify),
  'a right code is CLAIMED by one conditional update, so two tabs cannot both spend it')
ok(verify.indexOf(".is('used_at', null)") < verify.indexOf('createUser('), '...before any session is minted')
ok(/app_metadata: \{ portal_client: true \}/.test(verify), 'the login is marked a portal client, in metadata the user cannot edit')
ok(!/user_metadata/.test(verify), '...never in user_metadata, which they can')

const status = code('app/api/portal/[token]/login/route.ts')
ok(/emailOnFile: onFile \? maskEmail\(onFile\) : null/.test(status), 'the status check hands back only a masked address')

const server = code('lib/portal-login-server.ts')
ok(/db\.auth\.getUser\(token\)/.test(server) && /sameEmail\(email, clientEmail\)/.test(server),
  'who is signed in comes from the AUTHENTICATED session, compared with the customer record')
ok(/timingSafeEqual/.test(server) && /randomInt/.test(server), 'codes come from the CSPRNG and compare in constant time')

// ── a client's login is not an account ─────────────────────────────────────
const layout = code('app/(dashboard)/layout.tsx')
ok(/app_metadata as any\)\?\.portal_client && !\(await currentProfile\(\)\)/.test(layout) && /redirect\('\/portal-account'\)/.test(layout),
  'a portal login with no profile is sent to a page that says what it is for, not an empty dashboard')
ok(/'\/portal-account'/.test(read('lib/hosts.ts')), '...which is an app path, served on the app host')

const card = code('components/client-thread/portal-change-order.tsx')
ok(/login\.state\.kind !== 'signed-in'[\s\S]{0,200}<PortalSignIn/.test(card) && /login\.state\.kind === 'signed-in' &&/.test(card),
  'the client is offered a sign-in box INSTEAD of buttons that would be refused')
ok(/Authorization: `Bearer \$\{access\}`/.test(card), '...and the answer is sent with their session')
const box = code('components/client-thread/portal-sign-in.tsx')
ok(/kind: 'failed'/.test(box) && /could not check whether you are signed in/.test(box),
  'a failure to ASK is not "signed out" - it says it could not check')
ok(/verifyOtp\(\{ token_hash: d\.tokenHash, type: 'magiclink' \}\)/.test(box), 'the code becomes a session in this browser')
ok(/autoComplete="one-time-code"/.test(box) && /inputMode="numeric"/.test(box), 'the code box is the one a phone fills from the email')

ok(/create table if not exists (public\.)?portal_login_codes/i.test(read('supabase/migrations/149_portal_login_codes.sql')),
  'the codes table is a migration')

done()
