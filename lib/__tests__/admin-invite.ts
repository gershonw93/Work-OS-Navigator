// "I wanna make a spot where I can send an invite, so I'll put in first name,
// last name, and email address, and they'll get a nice email saying that
// they're invited, and they just sign up from there."
//
// The machinery for that already existed - `access_requests`, a token, the
// `/signup?invite=` unlock, resend and revoke - built for the WAITLIST, where a
// stranger asks and a super admin approves. Reusing it is right; the trap is
// that reusing the machinery quietly reuses the SENTENCE.
//
// `inviteEmail` says "You're approved" and "your access request is approved".
// That is true of somebody who applied and false of somebody the owner invited
// out of the blue, who is being asked to remember a request they never made.
// This is the same bug that split one template into three (lib/email.ts): a sub
// invited from the Directory was told they were approved for a beta they had
// never applied to. The audience is what differs, not the code path, so the
// fourth audience gets the fourth template and the ROW remembers which door it
// came through.
//
// The other half: the form asks for a first and a last name, and they are
// composed into the single `name` the table already has. A second pair of
// columns holding the same fact is how one person ends up spelled two ways.

import { invitePersonProblem, inviteFullName } from '../invite-person'
import { platformInviteEmail, inviteEmail } from '../email'
import { ok, done, code, read, readCombined } from './_helpers'

// ── the guard both doors ask ────────────────────────────────────────────────
const good = { firstName: 'Dana', lastName: 'Whitfield', email: 'dana@whitfieldbuild.com' }
ok(invitePersonProblem(good) === null, 'a complete invite is sendable')

for (const [patch, what] of [
  [{ firstName: '' }, 'no first name'],
  [{ firstName: '   ' }, 'a first name of spaces'],
  [{ lastName: '' }, 'no last name'],
  [{ email: '' }, 'no email'],
  [{ email: 'dana' }, 'an email with no @'],
  [{ email: 'dana@' }, 'an email with no domain'],
  [{ email: 'dana@build' }, 'a domain with no dot'],
  [{ email: 'dana@build.' }, 'a domain ending in a dot'],
  [{ email: 'a@b@c.com' }, 'two @s'],
  [{ email: 'dana whitfield@b.com' }, 'a space in the address'],
] as const) {
  const p = invitePersonProblem({ ...good, ...patch })
  ok(typeof p === 'string' && p.length > 0, `refused: ${what}`)
}

// Deliberately loose, for the reason `whoToCall` is: refusing a real address is
// a worse failure than letting a typo through, which bounces visibly.
for (const email of [
  'dana+sytenav@whitfieldbuild.com',
  "o'brien@build.co.uk",
  'dana.whitfield@sub.domain.construction',
]) {
  ok(invitePersonProblem({ ...good, email }) === null, `accepted a real address: ${email}`)
}

// ── ONE name, composed at the edge ──────────────────────────────────────────
ok(inviteFullName({ firstName: 'Dana', lastName: 'Whitfield' }) === 'Dana Whitfield',
  'a first and a last name become the one `name` the table stores')
ok(inviteFullName({ firstName: ' Dana ', lastName: ' Whitfield ' }) === 'Dana Whitfield',
  '...trimmed, so a stray space is not part of somebody\'s name')

const combined = readCombined()
ok(/access_requests[\s\S]*?ADD COLUMN IF NOT EXISTS source/.test(combined)
  || /ADD COLUMN IF NOT EXISTS source/.test(combined),
  'the row remembers which door it came through')
ok(!/first_name/.test(combined.slice(combined.indexOf('CREATE TABLE IF NOT EXISTS access_requests'),
  combined.indexOf('CREATE TABLE IF NOT EXISTS access_requests') + 800)),
  'ONE HOME: no second pair of name columns beside `name`')

// ── the fourth audience gets the fourth sentence ────────────────────────────
const invited = platformInviteEmail({ name: 'Dana Whitfield', inviteUrl: 'https://app.sytenav.com/signup?invite=abc' })
const approved = inviteEmail({ name: 'Dana Whitfield', inviteUrl: 'https://app.sytenav.com/signup?invite=abc' })

ok(!/approved/i.test(invited.text) && !/approved/i.test(invited.html),
  'THE BUG: somebody who never asked is not told their request was approved')
ok(!/access request/i.test(invited.text) && !/access request/i.test(invited.html),
  '...and is not told about a request they never made')
ok(/invit/i.test(invited.subject), 'the subject says what it is')
ok(/Dana/.test(invited.text) && /Dana/.test(invited.html), 'it greets them by first name')
ok(invited.text.includes('signup?invite=abc') && invited.html.includes('signup?invite=abc'),
  'and carries the link in both halves - a text-only client is not a dead end')

// The waitlist template still says the thing that is true THERE, so this was a
// split rather than a rewrite.
ok(/approved/i.test(approved.text), 'the waitlist approval still says "approved", which is true of it')
ok(invited.subject !== approved.subject, 'the two doors do not share a subject line')

// ── the route picks the template off the ROW, not off the caller ────────────
const route = code('app/api/admin/access-requests/route.ts')
ok(/row\.source === 'invite'[\s\S]{0,120}platformInviteEmail/.test(route),
  'delivery chooses by which door the row came through')
ok(/: inviteEmail\(/.test(route), '...and falls back to the waitlist template for a request')
{
  // Resend goes through the same function, so a resent invite cannot change
  // its story on the second send.
  const deliverAt = route.indexOf('async function deliverInvite')
  const resendAt = route.indexOf("if (action === 'resend')")
  ok(deliverAt > -1 && resendAt > -1 && /deliverInvite\(db, existing, origin\)/.test(route),
    'resend delivers through the same function rather than its own copy')
}

// ── an invite is born approved, because nobody applied ──────────────────────
// SCOPED TO THE POST HANDLER. The first version of this read the whole file -
// and the PATCH handler's approve branch also carries `status: 'approved'` and
// mints a token, so gutting the POST handler entirely left it green. A scan
// over a file that contains a second, correct copy of what it is looking for
// cannot fail for the thing it names.
const post = route.slice(route.indexOf('export async function POST'))
ok(post.length > 200, 'the POST handler is there to read')
ok(/source: 'invite'/.test(post), 'the row records that the owner started it')
ok(/status: 'approved'/.test(post) && /invite_token: randomUUID/.test(post),
  'THE ANSWER TO "do they need approving": no - the invite IS the approval, so the row is born approved with a token')
ok(/reviewed_at:/.test(post), '...and is stamped reviewed, because there is nothing left to review')
ok(/invitePersonProblem\(/.test(post),
  'and the ROUTE asks the same question the form does, because the form is not the only caller')

// ── the refusals a person can actually act on ───────────────────────────────
ok(/already has a SyteNav account/.test(route),
  'inviting somebody who already has an account says so, rather than minting a link to a signup they do not need')
ok(/Use Resend on their row/.test(route),
  'and a duplicate address points at the control that does what they meant')
ok(/friendlyDbError\(error\)/.test(route) && /console\.error\('\[admin\/invite\]/.test(route),
  'a database refusal is translated for the screen and kept raw in the log')
ok(!/error\.message \}, \{ status: 500/.test(route),
  'A POSTGRES MESSAGE IS NOT A USER-FACING MESSAGE - no raw duplicate-key sentence reaches the console')

// ── the form ────────────────────────────────────────────────────────────────
const form = code('components/admin/invite-person-form.tsx')
ok(/invitePersonProblem\(/.test(form),
  'the form asks at the FIELD, before sending - a server answer arrives as a whole request that did not happen')
ok(/disabled=\{sending\}/.test(form) && !/disabled=\{!/.test(form),
  'A DISABLED BUTTON EXPLAINS NOTHING: Send is disabled only in flight, never for an incomplete form')
ok((form.match(/\*/g) ?? []).length >= 3, 'every field is marked required rather than guessed at')
ok(/d\?\.error \?\?/.test(form), "the route's own reason is preferred over a generic shrug")
ok(/did not send/.test(form),
  'and a row created with no email sent SAYS so - an invite nobody received is the failure this screen exists to show')

// It lives in its own file. A component declared inside a component is a new
// type on every render, and this is the one part of the screen somebody types
// into - the requests list refreshing would take a half-typed name with it.
const page = code('app/admin/access-requests/page.tsx')
ok(/<InvitePersonForm/.test(page), 'the page mounts the form')
ok(!/function InvitePersonForm/.test(page), '...and does not declare it inside itself')


// ═══════════════════════════════════════════════════════════════════════════
// AN INVITE LINK THAT REALLY IS GOOD ONCE.
//
// The email has said so since it was written - "The link is personal to you and
// only works once" - and neither half was true. `invite_token` was matched on
// and never cleared, and the email box on the create-account form was editable,
// so ONE forwarded link minted unlimited accounts under any address, each a new
// company with its own free trial. Copy is a spec, and this is the enforcement
// the sentence had been describing for months.
// ═══════════════════════════════════════════════════════════════════════════

const signupRoute = code('app/api/complete-signup/route.ts')

// ── the promise, still made ─────────────────────────────────────────────────
// Read the raw file: this is a claim in an email body, and it is the reason
// every assertion below exists. If somebody deletes the sentence, the checks
// that enforce it should be reconsidered rather than left running on their own.
ok(/only works once/i.test(read('lib/email.ts')),
  'the invite email still promises the link works once')

// ── ...and now kept ─────────────────────────────────────────────────────────
ok(/invite_used_at/.test(signupRoute), 'signup reads whether the link has been spent')
ok(/if \(invite\?\.invite_used_at\)/.test(signupRoute), '...and refuses a link that has')
ok(/already been used/i.test(signupRoute), '...saying so in words somebody can act on')

// STAMPED AFTER THE PROFILE, never at the point the token is read. The other
// way round, a signup that died on the company insert would burn the invite and
// the only way back from our own error would be to ask us for another one.
const profileAt = signupRoute.indexOf("from('profiles')\n    .insert")
const stampAt = signupRoute.indexOf('invite_used_at: now.toISOString()')
ok(profileAt > 0 && stampAt > profileAt,
  'the link is spent only after the profile exists, so a failed signup can be retried')

// ── and only by the person it was sent to ───────────────────────────────────
// AGAINST THE AUTHENTICATED USER. `email` in the body is the client's claim
// about who it is; `user.email` came back from the auth server with the bearer
// token. Checking the claim leaves the door exactly as open as it was.
ok(/user\.email \?\? ''\)\.trim\(\)\.toLowerCase\(\)/.test(signupRoute),
  'the address is taken from the verified token, not from the request body')
ok(/invitedTo !== signingUp/.test(signupRoute), '...and a mismatch is refused')

// The form matches the route, so nobody meets that refusal by surprise having
// typed into a box we offered them.
const signupForm = code('app/(auth)/signup/page.tsx')
ok(/readOnly=\{!!prefill\?\.email\}/.test(signupForm),
  'the create-account form will not let the invited address be edited')
ok(/invite was sent to/i.test(signupForm),
  '...and says why the box cannot be typed in')

// ── the token and its stamp live and die together ───────────────────────────
// A fresh token beside a stamp from the old one is a link born dead: the
// console shows it sent, the customer clicks it, and the route says it has
// already been used - about a link nobody ever opened.
const adminRequests = code('app/api/admin/access-requests/route.ts')
ok((adminRequests.match(/invite_used_at: null/g) ?? []).length === 3,
  'approve, reject and reset each clear the stamp along with the token')

// THE SCREEN IS NOT THE ENFORCEMENT, so the route refuses a resend too - a
// second tab or a double press goes straight round a hidden button.
ok(/existing\.invite_used_at/.test(adminRequests), 'resend refuses a link that has been used')
const adminPage = code('app/admin/access-requests/page.tsx')
ok(/r\.invite_token && !r\.invite_used_at/.test(adminPage),
  '...and the console stops offering Copy, Resend and Send by hand on a dead one')
ok(/Account created \{formatDate\(r\.invite_used_at\)\}/.test(adminPage),
  'a spent link reads as an account created, not as an invite still waiting')

// ── the column ──────────────────────────────────────────────────────────────
const m120 = read('supabase/migrations/120_invite_single_use.sql').replace(/--[^\n]*/g, '')
ok(/ADD COLUMN IF NOT EXISTS invite_used_at TIMESTAMPTZ/.test(m120), 'the column exists')
ok(!/NOT NULL/.test(m120), '...and is nullable, because null is what "not used yet" looks like')
ok(/invite_used_at/.test(readCombined()), 'and the combined migration carries it')

done()
