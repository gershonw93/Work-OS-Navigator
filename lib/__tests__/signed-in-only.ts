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
])

const SIGNED_IN = /\.auth\.getUser\(|\bauth\(request\)|getUser\(request\)|currentUser\(/
const GATED = new RegExp([
  'requirePermission\\(', 'actorCan\\(', 'ownedProject\\(', 'ownsProject\\(', 'getActor\\(',
  'jobGate\\(', 'actorJobGate\\(', 'jobSide\\(', 'filesAccess\\(', 'complianceAccess\\(',
  'rfiSide\\(', 'rfiGcGate\\(', 'directoryGate\\(', 'gated\\(', 'isSuperAdmin\\(', 'requireSuperAdmin',
  'CRON_SECRET', 'mayManageCompanySetting\\(',
  // A hand-written admin check, same company as the record (invite links).
  "role !== 'admin'",
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

const found: string[] = []
for (const file of routes('app/api')) {
  const src = code(file)
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const next = src.indexOf('export async function', m.index + 10)
    const body = src.slice(m.index, next < 0 ? undefined : next)
    if (SIGNED_IN.test(body) && !GATED.test(body)) {
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
