// EVERY API HANDLER ASKS SOMETHING MORE THAN "ARE YOU SIGNED IN" - OR IS ON
// THIS LIST, WHICH MAY ONLY GET SHORTER.
//
// `middleware.ts` returns early for /api/, and every route runs on the
// service-role client, so RLS does not apply: a handler whose only check is a
// sign-in answers ANY account holding an id - an invited sub, a worker,
// another company's admin. Two sweeps closed about 160 of them. What is left
// below is PERSONAL: each one only ever reads or writes the caller's own rows
// (their notifications, their calendar link, a sub's own jobs and bids, the
// signup and invite flows), and each is pinned to that scope in
// `lockdown-personal.ts` / `lockdown-company.ts`.
//
// A NEW handler that checks only a sign-in fails here. Gate it
// (`requirePermission`, `jobGate`, `ownedProject`...) - or, if it truly only
// touches the caller's own rows, add it below AND pin its scoping.

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ok, done, code, root } from './_helpers'

const PERSONAL = new Set([
  'complete-signup POST', 'invite/accept POST',
  'me/permissions GET', 'me/tasks GET',
  'my-bids GET', 'my-bids/[packageId] GET', 'my-bids/[packageId] POST',
  'my-jobs GET', 'my-jobs/[projectId] GET', 'my-jobs/[projectId]/schedule/[itemId]/delay POST',
  'notifications GET', 'notifications PATCH', 'notifications/[notifId] PATCH', 'notifications/[notifId] DELETE',
  'notifications/audience GET',
  'settings/calendar GET', 'settings/calendar POST', 'settings/verify-delete-key POST',
  // Found when the scan learned to see a file's own sign-in helper (below).
  // Each touches only rows keyed on the caller's user id - pinned in
  // lockdown-personal.ts.
  'settings/notifications GET', 'settings/notifications PATCH',
  'me/device-token POST', 'me/device-token DELETE',
  'me/push-test GET', 'me/push-test POST',
])

const SIGNED_IN = /\.auth\.getUser\(|\bauth\(request\)|getUser\(request\)|currentUser\(/
const GATED = new RegExp([
  'requirePermission\\(', 'actorCan\\(', 'ownedProject\\(', 'ownsProject\\(', 'getActor\\(',
  'jobGate\\(', 'actorJobGate\\(', 'jobSide\\(', 'filesAccess\\(', 'complianceAccess\\(',
  'rfiSide\\(', 'rfiGcGate\\(', 'directoryGate\\(', 'gated\\(', 'isSuperAdmin\\(', 'requireSuperAdmin',
  'CRON_SECRET', 'mayManageCompanySetting\\(',
  // A hand-written admin check, same company as the record (invite links).
  "role !== 'admin'",
  // The roles editor's own helper: admin or manager of the caller's company.
  "\\['admin', 'manager'\\]\\.includes\\(",
  // A bid thread: the invite's own company or address (lib/bid-thread.ts).
  'canUseThread\\(',
].join('|'))

function routes(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(root(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root(), rel)).isDirectory()) out.push(...routes(rel))
    else if (name === 'route.ts') out.push(rel)
  }
  return out
}

// A FILE'S OWN SIGN-IN HELPER IS A SIGN-IN TOO. `GET /projects/[id]/quote`
// called `authUser(request)`, a three-line wrapper round `auth.getUser` defined
// at the top of the same file, so the pattern above never matched and the
// handler sailed past this scan answering any account with a project id -
// budget lines, payments received, hours clocked. Every local function whose
// body asks the auth server is added to the pattern for its own file - unless
// that body ALSO gates (the admin consoles' `gate()`, the roles route's
// `requireAdmin()`), in which case calling it is the gate, not a sign-in.
function localSignIns(src: string): RegExp | null {
  const names: string[] = []
  const fn = /^(?:async\s+)?function\s+(\w+)\s*\(/gm
  let f: RegExpExecArray | null
  while ((f = fn.exec(src))) {
    const end = src.indexOf('\n}', f.index)
    const body = src.slice(f.index, end < 0 ? undefined : end)
    if (SIGNED_IN.test(body) && !GATED.test(body)) names.push(f[1])
  }
  return names.length ? new RegExp(`\\b(?:${names.join('|')})\\(`) : null
}

// The widening has to SEE the case it was written for, or it is a guess.
ok(localSignIns(code('app/api/projects/[id]/quote/route.ts'))?.test('authUser(request)') === true,
  'the scan recognises a file-local sign-in helper (authUser in the quote route)')

const found: string[] = []
for (const file of routes('app/api')) {
  const src = code(file)
  const local = localSignIns(src)
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const next = src.indexOf('export async function', m.index + 10)
    const body = src.slice(m.index, next < 0 ? undefined : next)
    if ((SIGNED_IN.test(body) || local?.test(body)) && !GATED.test(body)) {
      found.push(`${file.replace('app/api/', '').replace(/\/route\.ts$/, '')} ${m[1]}`)
    }
  }
}

for (const h of found) ok(PERSONAL.has(h), `${h} checks more than a sign-in, or is a pinned PERSONAL route`)
ok(found.length <= PERSONAL.size, `sign-in-only handlers: ${found.length} (may only go DOWN from ${PERSONAL.size})`)
// The list must not hold stale entries either - a route that became gated
// comes OFF it, so the next one cannot quietly take its place.
for (const h of Array.from(PERSONAL)) ok(found.includes(h), `${h} is still sign-in only (else remove it from PERSONAL)`)
done()
