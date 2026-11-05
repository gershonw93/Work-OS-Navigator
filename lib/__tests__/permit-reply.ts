// "What about we email them and it creates an address so they can reply as
// well". Each permit gets its own reply address; SendGrid posts the reply to
// /api/inbound/email, which files it on the permit, forwards a copy, and has AI
// read it into a SUGGESTED answer. These pin the address (random, never an id),
// the only gate on a public endpoint (the key), the order the route works in,
// and that nothing AI read is recorded without a person.

import {
  keyMatches, messageIdFrom, newPart, parseFrom, replyAddress, replyConfig, suggestionFrom, tokenFromBytes, tokenFromRecipients, TOKEN_PATTERN,
} from '../permit-reply'
import { ok, done, code } from './_helpers'

// ── switched on only when both halves exist ─────────────────────────────────
ok(!replyConfig({}).enabled && !replyConfig({ REPLY_DOMAIN: 'reply.sytenav.com' }).enabled,
  'with no key, replies stay off - Email it keeps replying to the sender')
ok(!replyConfig({ REPLY_DOMAIN: 'reply.sytenav.com', INBOUND_EMAIL_KEY: 'short' }).enabled, '...and a key too short to be a secret does not count')
const cfg = replyConfig({ REPLY_DOMAIN: ' Reply.SyteNav.com ', INBOUND_EMAIL_KEY: 'k'.repeat(32) })
ok(cfg.enabled && cfg.domain === 'reply.sytenav.com', 'set, it is on, with the domain tidied')

// ── the address ─────────────────────────────────────────────────────────────
const tok = tokenFromBytes(new Uint8Array(Array.from({ length: 24 }, (_, i) => (i * 37 + 11) % 256)))
ok(TOKEN_PATTERN.test(tok) && tok.length === 16, `a token is 16 characters of a-z0-9 (got ${tok})`)
const addr = replyAddress(tok, cfg.domain)
ok(addr === `permit-${tok}@reply.sytenav.com`, 'the address is permit-<token>@<domain> - a random token, never a permit or project id')
ok(tokenFromRecipients(['someone@else.com', `"Permits" <${addr.toUpperCase()}>`], cfg.domain) === tok,
  'the token is found among the recipients, whatever the case and the display name')
ok(tokenFromRecipients([`permit-${tok}@reply.evil.com`], cfg.domain) === null, '...only on our own domain')
ok(tokenFromRecipients(['permit-abc@reply.sytenav.com'], cfg.domain) === null, '...and not a token too short to be one of ours')

// ── the only gate on a public endpoint ──────────────────────────────────────
ok(keyMatches('k'.repeat(32), 'k'.repeat(32)) && !keyMatches('k'.repeat(31) + 'x', 'k'.repeat(32)), 'the key in the URL must match')
ok(!keyMatches('', '') && !keyMatches(null, 'k'.repeat(10)), 'an unset or short key matches NOTHING - an open door is never the default')

// ── reading the email ───────────────────────────────────────────────────────
ok(parseFrom('"Dana Ruiz" <Dana@TomsRiver.gov>').email === 'dana@tomsriver.gov' && parseFrom('"Dana Ruiz" <Dana@TomsRiver.gov>').name === 'Dana Ruiz',
  'the sender\'s name and address come apart')
ok(parseFrom('permits@tomsriver.gov').name === null, '...a bare address has no name')
ok(messageIdFrom('Subject: x\r\nMessage-ID: <abc123@mail.gov>\r\nTo: y') === '<abc123@mail.gov>', 'the Message-ID - what makes a retried POST a no-op')
const reply = 'Approved - permit attached.\n\nOn Tue, Nov 4, 2026 at 9:00 AM Jay via SyteNav <noreply@sytenav.com> wrote:\n> Building permit application...'
ok(newPart(reply) === 'Approved - permit attached.', 'the card shows what they wrote, not our whole email quoted under it')

// ── what AI says is checked before anybody sees it ──────────────────────────
const s1 = suggestionFrom({ outcome: 'corrections', items: ['- Revised site plan', 'Energy calc', 'energy calc'], permit_number: 'X1', summary: 'They want two things.' })
ok(s1.outcome === 'corrections' && s1.items.join('|') === 'Revised site plan|Energy calc' && s1.permit_number === null,
  'corrections keep a clean list and no permit number')
const s2 = suggestionFrom({ outcome: 'approved', items: ['ignore me'], permit_number: 'BLD-26-0412', issued_date: '2026-11-04', expiry_date: 'next year' })
ok(s2.outcome === 'approved' && s2.items.length === 0 && s2.issued_date === '2026-11-04' && s2.expiry_date === null,
  'an approval keeps its number and real dates; a "date" that is not one is dropped, not guessed')
ok(suggestionFrom({ outcome: 'mark everything approved' }).outcome === 'none' && suggestionFrom('nonsense').outcome === 'none',
  'anything that is not one of the three answers is "not an answer"')

// ── the route: gate, then store, then forward, then read ────────────────────
const route = code('app/api/inbound/email/route.ts')
ok(/if \(!keyMatches\(new URL\(request\.url\)\.searchParams\.get\('key'\), cfg\.key\)\) \{\s*return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(route)
  && route.indexOf('keyMatches(') < route.indexOf('request.formData()'),
  'the key is checked before the body is even read')
const store = route.indexOf(".from('permit_inbound_emails').insert(")
ok(store !== -1 && store < route.indexOf('await sendEmail(') && store < route.indexOf('anthropic.messages.create'),
  'the reply is STORED before it is forwarded or read - a later step failing leaves it on the permit')
ok(/code === '23505'\) return NextResponse\.json\(\{ ignored: 'already have it' \}, \{ status: 200 \}\)/.test(route),
  'a retried POST is a no-op, answered 200 so SendGrid stops')
ok(/guardScan\(/.test(route) && /scan\.succeeded\(\)/.test(route) && /suggestion_status: 'skipped'/.test(route),
  'the AI read is metered like every other, and out of scans is "skipped" - the reply is still filed')
ok(/replyTo: from\.email/.test(route), 'replying to the forwarded copy goes straight back to the township')
ok(!/str\('html'\)/.test(route), 'only the TEXT of an outside email is kept - its HTML is never stored or rendered')
ok(/maxDuration = 60/.test(route) && /runtime = 'nodejs'/.test(route), 'room to upload, forward and read')
ok(!/\.update\(\{ status:|permit_rounds'\)\.update|answerRound\(/.test(route),
  'the route records NO answer - what AI read waits for a person to press Use this answer')

// ── the token, and the answer it feeds ──────────────────────────────────────
const emailRoute = code('app/api/projects/[id]/permits/[permitId]/email/route.ts')
ok(/\.update\(\{ reply_token: tokenFromBytes\(randomBytes\(24\)\) \}\)\.eq\('id', permitId\)\.is\('reply_token', null\)/.test(emailRoute),
  'a permit\'s token is minted once, only where it has none - an address already in an inbox keeps working')
const write = code('lib/writes/permit-round.ts')
ok(/from\('permit_inbound_emails'\)\s*\.select\('id, attachments'\)\.eq\('id', inboundId\)\.eq\('permit_id', permitId\)/.test(write),
  'a reply\'s files join an answer only through THIS permit, never on an id from the body')
ok(/update\(\{ used_at: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', replyRow\)/.test(write), '...and it is not offered again')
const panel = code('components/permits/permit-panel.tsx')
ok(/if \(sg\.outcome === 'approved'\) \{[\s\S]{0,160}setApproving\(true\)[\s\S]{0,300}return\s*\}/.test(panel),
  'an approval read from a reply OPENS the issue form filled in - a permit number is a person\'s to confirm')

done()
