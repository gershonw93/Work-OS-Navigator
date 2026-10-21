// QuickBooks step 2: production. Sealed tokens, a refresh that tells a dead
// grant from a bad minute, keys and files that never mix, a duplicate check
// before every create, and a failure that carries its way out.
//
// Each half of this was a way the move to real books could go wrong silently:
//   * tokens to a real company sitting in a column as plain text,
//   * one 503 from Intuit marking the connection expired, after which every
//     push answered "not connected" - a NORMAL state, logged nowhere,
//   * QBO_ENV flipped to production with the sandbox keys still in place,
//   * sandbox ids (invoice 292, vendor 58) used against the real file,
//   * a sub's vendor id shared by every GC that sub works for,
//   * an invoice adopted on its NUMBER alone - in real books the GC's own
//     INV-0004 belongs to some other client.

process.env.QBO_TOKEN_KEY = 'a'.repeat(64)
process.env.QBO_CLIENT_ID = 'sandbox-id'
process.env.QBO_CLIENT_SECRET = 'sandbox-secret'

import { sealToken, openToken, tokenKey, isEncryptedToken } from '../qbo-token-crypto'
import {
  parseQboEnv, qboEnvSetting,
  qboCredentials, qboConfigProblem, refreshIsFatal, QboTokenError, connectionUnusable, getValidConnection, SCOPES,
} from '../quickbooks'
import { realmDecision } from '../qbo-realm'
import { matchDuplicate, duplicateQuery, qboLiteral } from '../quickbooks-push'
import { retryFor, isResolved } from '../qbo-log-retry'
import { ok, done, code, read } from './_helpers'

// ── tokens at rest ───────────────────────────────────────────────────────────
const key = tokenKey()!
const sealed = sealToken('AB11-refresh', key)
ok(isEncryptedToken(sealed) && !sealed.includes('AB11-refresh'), 'a stored token is sealed - the database alone opens nothing')
ok(openToken(sealed, key) === 'AB11-refresh', '...and opens again with the key')
ok(sealToken('x', key) !== sealToken('x', key), '...with a fresh IV every time')
ok(openToken('legacy-plain', key) === 'legacy-plain', 'the sandbox row stored before this still reads (and is resealed on refresh)')
let threw = false
try { openToken(sealed, tokenKey('b'.repeat(64))) } catch { threw = true }
ok(threw, 'the WRONG key throws rather than handing Intuit "enc:v1:..." as a bearer')
ok(tokenKey('')=== null && tokenKey('passphrase')!.length === 32, 'no key is null; a passphrase is hashed to 32 bytes')

// ── keys never mix ───────────────────────────────────────────────────────────
const vars = { QBO_CLIENT_ID: 'sb', QBO_CLIENT_SECRET: 'sbs', QBO_TOKEN_KEY: 'k' }
ok(qboCredentials('sandbox', vars)?.clientId === 'sb', 'sandbox reads the old QBO_CLIENT_ID as before')
ok(qboCredentials('production', vars) === null, 'production NEVER falls back to it - flipping QBO_ENV alone cannot send sandbox keys to real books')
ok(qboCredentials('production', { ...vars, QBO_PRODUCTION_CLIENT_ID: 'p', QBO_PRODUCTION_CLIENT_SECRET: 'ps' })?.clientId === 'p',
  '...it reads only variables named production')
ok(qboCredentials('sandbox', { QBO_PRODUCTION_CLIENT_ID: 'p', QBO_PRODUCTION_CLIENT_SECRET: 'ps' }) === null, 'and the reverse')
ok(/QBO_TOKEN_KEY/.test(qboConfigProblem('production', { QBO_PRODUCTION_CLIENT_ID: 'p', QBO_PRODUCTION_CLIENT_SECRET: 'ps' }) ?? ''),
  'production without a token key is NOT configured - a real file\'s token is never stored in clear')
ok(qboConfigProblem('sandbox', vars) === null, 'sandbox with its keys is configured')
ok(SCOPES === 'com.intuit.quickbooks.accounting', 'the only scope asked for is accounting')

// ── QBO_ENV is read forgivingly, and the card can say what it read ────────
ok(parseQboEnv('production') === 'production' && parseQboEnv(' Production ') === 'production' && parseQboEnv('"production"') === 'production',
  'production is production whatever its case, spaces or quotes')
ok(parseQboEnv('sandbox') === 'sandbox' && parseQboEnv(undefined) === 'sandbox' && parseQboEnv('prod') === 'sandbox', 'anything else is still sandbox')
const seen = qboEnvSetting({ QBO_ENV: 'Production ', QBO_PRODUCTION_CLIENT_SECRET: 'shh', QBO_TOKEN_KEY: 'k' })
ok(seen.qboEnvRaw === '"Production "' && seen.resolvesTo === 'production', 'the card shows the raw value, quoted, so a stray space is visible')
ok(!JSON.stringify(seen).includes('shh') && seen.productionClientSecret && !seen.productionClientId, 'secrets are reported as set or missing, never their values')
ok(/mayManageCompanySetting\(gate\.actor\) \? \{ envSetting/.test(code('app/api/quickbooks/status/route.ts')), '...and only an admin is shown it')

// ── a dead grant vs a bad minute ─────────────────────────────────────────────
ok(refreshIsFatal(new QboTokenError(400, '{"error":"invalid_grant"}')), 'invalid_grant ends the connection')
ok(!refreshIsFatal(new QboTokenError(503, 'Service Unavailable')), 'a 503 does not')
ok(!refreshIsFatal(new TypeError('fetch failed')), 'nor does a request that never got an answer')
ok(connectionUnusable({ environment: 'sandbox', status: 'connected' }, 'production') === 'wrong_environment',
  'a sandbox connection is never used by a production deploy')
ok(connectionUnusable({ environment: 'production', status: 'connected' }, 'sandbox') === 'wrong_environment', '...or the reverse')
ok(connectionUnusable({ environment: 'sandbox', status: 'expired' }, 'sandbox') === 'needs_reconnect', 'the old "expired" reads as needs reconnect')

// ── one file per account ─────────────────────────────────────────────────────
const sandboxFile = { realmId: '9341454915437215', environment: 'sandbox' }
ok(realmDecision({ bound: null, incoming: sandboxFile, takenByOtherAccount: false }) === 'connect', 'a first connection connects')
ok(realmDecision({ bound: sandboxFile, incoming: sandboxFile, takenByOtherAccount: false }) === 'connect', 'reconnecting the SAME file keeps every id')
ok(realmDecision({ bound: sandboxFile, incoming: { realmId: '123', environment: 'production' }, takenByOtherAccount: false }) === 'other_file',
  'a production file is refused while the ids belong to the sandbox one')
ok(realmDecision({ bound: sandboxFile, incoming: { realmId: '9341454915437215', environment: 'production' }, takenByOtherAccount: false }) === 'other_file',
  '...even if the realm number happened to match - the environment is part of the file')
ok(realmDecision({ bound: null, incoming: sandboxFile, takenByOtherAccount: true }) === 'file_taken', 'a file another account holds is refused')

// ── the duplicate check: number + party + amount ─────────────────────────────
const rows = [
  { Id: '50', DocNumber: 'INV-0004', CustomerRef: { value: '7' }, TotalAmt: 1200 },
  { Id: '51', DocNumber: 'INV-0004', CustomerRef: { value: '9' }, TotalAmt: 1200 },
  { Id: '52', DocNumber: 'INV-0005', CustomerRef: { value: '7' }, TotalAmt: 0, PrivateNote: 'Voided' },
]
ok(matchDuplicate(rows, { entity: 'Invoice', doc: 'INV-0004', partyId: '9', amount: 1200 }).id === '51', 'same number, customer and amount is the same invoice')
ok(matchDuplicate(rows, { entity: 'Invoice', doc: 'inv-0004 ', partyId: '9', amount: 1200.004 }).id === '51', '...matched in cents, number trimmed and case-folded')
const clash = matchDuplicate(rows, { entity: 'Invoice', doc: 'INV-0004', partyId: '11', amount: 1200 })
ok(clash.id === null && clash.numberClash, 'the GC\'s OWN INV-0004 for another client is NOT adopted - it is reported as a number used twice')
ok(matchDuplicate(rows, { entity: 'Invoice', doc: 'INV-0004', partyId: '7', amount: 900 }).id === null, 'a different amount is not a duplicate')
ok(matchDuplicate(rows, { entity: 'Invoice', doc: 'INV-0005', partyId: '7', amount: 0 }).id === null, 'a voided record never matches')
ok(matchDuplicate([{ Id: '9', PaymentRefNum: 'chk 1043', CustomerRef: { value: '7' }, TotalAmt: 500 }],
  { entity: 'Payment', doc: 'CHK 1043', partyId: '7', amount: 500 }).id === '9', 'a Payment matches on its PaymentRefNum')
ok(matchDuplicate([{ Id: '3', DocNumber: 'SN-1', VendorRef: { value: '4' }, TotalAmt: 50 }],
  { entity: 'Bill', doc: 'SN-1', partyId: '4', amount: 50 }).id === '3', 'a Bill matches on number + VENDOR + amount')
ok(duplicateQuery({ entity: 'Invoice', doc: "O'Brien-1", partyId: '1', amount: 1 }) === "select * from Invoice where DocNumber = 'O\\'Brien-1'",
  'the query escapes a quote in the number')
ok(/CustomerRef = '7' and TxnDate = '2026-10-19'/.test(duplicateQuery({ entity: 'Payment', doc: 'x', partyId: '7', amount: 1, txnDate: '2026-10-19' }) ?? ''),
  'a Payment is looked up by customer and date - its reference field is not queryable')
ok(duplicateQuery({ entity: 'Bill', doc: '', partyId: '1', amount: 1 }) === null, 'no number, no query - and the push says the check could not run')
ok(qboLiteral("a'b") === "'a\\'b'", 'qboLiteral escapes')

// ── a failure carries its way out ────────────────────────────────────────────
const fail = { entity_type: 'bill', entity_id: 'B1', action: 'create', status: 'error', message: 'Object Not Found', created_at: '2026-10-19T10:00:00Z' }
const r1 = retryFor(fail)
ok(r1?.kind === 'sync' && r1.entity === 'bills' && r1.ids[0] === 'B1', 'a failed bill push retries THAT bill through Sync bills')
ok(retryFor({ ...fail, entity_type: 'bill_payment', action: 'void', message: 'Void: x' })?.kind === 'sync', 'a failed un-pay void retries through Retry voids')
ok(retryFor({ ...fail, action: 'void', message: 'Void: refused (deleted here)' })?.kind === 'hint', 'a refused delete says to delete again - the record was kept')
ok(retryFor({ ...fail, entity_type: 'connection', entity_id: null })?.kind === 'hint', 'a dead sign-in says reconnect')
ok(retryFor({ ...fail, status: 'success' }) === null, 'a success offers nothing')
const later = { ...fail, status: 'success', created_at: '2026-10-19T11:00:00Z' }
ok(isResolved(fail, [fail, later]), 'a failure put right by a later success is marked resolved')
ok(!isResolved(fail, [fail, { ...later, entity_id: 'B2' }]), '...by a success for THAT record, not another')

// ── the code paths, by source ────────────────────────────────────────────────
const cb = code('app/api/quickbooks/callback/route.ts')
ok(cb.indexOf('realmDecision(') > 0 && cb.indexOf('realmDecision(') < cb.indexOf(".upsert("), 'the callback decides the file BEFORE storing anything')
ok(/decision !== 'connect'\)\s*\{\s*await revokeToken/.test(cb), '...and a refused file has its grant handed back to Intuit')
const upsert = cb.slice(cb.indexOf(".upsert("), cb.indexOf("onConflict: 'company_id'"))
ok(/tokenColumns\(t, now\)/.test(upsert) && !/access_token: t\./.test(upsert) && !/refresh_token: t\./.test(upsert), 'the callback stores sealed tokens only')
ok(/qbo_realm_id: realmId, qbo_environment: QBO_ENV/.test(cb), '...and records the file the account\'s ids now belong to')
ok(/if \(!qboConfigured\(\)\) return back/.test(cb), 'a deploy that cannot seal tokens stores none')

const dis = code('app/api/quickbooks/disconnect/route.ts')
ok(dis.indexOf('revokeToken(') > 0 && dis.indexOf('revokeToken(') < dis.indexOf('.delete()'), 'Disconnect revokes at Intuit before forgetting the row')

const qb = code('lib/quickbooks.ts')
ok(/openToken\(row\.access_token\)/.test(qb) && /openToken\(row\.refresh_token\)/.test(qb), 'every read opens the sealed tokens')
ok(/refreshIsFatal\(err\)/.test(qb) && /status: 'needs_reconnect'/.test(qb), 'only a fatal refusal marks the connection for reconnecting')
ok(/again\.refresh_token !== row\.refresh_token/.test(qb), 'a refresh another request already rotated is not mistaken for a dead grant')

const push = code('lib/quickbooks-push.ts')
const creates = [
  ["qboFetch(conn, 'salesreceipt', {", 'SalesReceipt'], ["qboFetch(conn, 'bill', {\n        method: 'POST',\n        body: JSON.stringify(payload)", 'Bill'],
  ["qboFetch(conn, 'billpayment', {", 'BillPayment'], ["qboFetch(conn, 'invoice', {", 'Invoice'],
]
for (const [needle, entity] of creates) {
  const at = push.indexOf(needle)
  const before = push.slice(Math.max(0, at - 700), at)
  ok(at > 0 && new RegExp(`findDuplicate\\(conn, \\{ entity: '${entity}'`).test(before), `${entity}: the duplicate check runs before the create`)
}
ok((push.match(/entity: 'Payment', doc: probe\.PaymentRefNum/g) ?? []).length === 2, 'both Payment creates (single and split cheque) are checked')
ok(!/existingInvoiceIdByDocNumber/.test(push), 'the number-only invoice adoption is gone')
ok(/existingNamedId\(conn, 'Customer'/.test(push) && /existingNamedId\(conn, 'Vendor'/.test(push), 'customers and vendors already in the file are adopted by name')

// A sub's vendor id is per FILE now. Nothing outside the migration reads the old column.
for (const f of ['lib/quickbooks-push.ts', 'app/api/quickbooks/sync/route.ts']) {
  const src = code(f)
  ok(!/from\('companies'\)[^\n]*qbo_vendor_id/.test(src) && !/\.update\(\{ qbo_vendor_id/.test(src) && !/co\??\.qbo_vendor_id/.test(src),
    `${f} never reads or writes companies.qbo_vendor_id - a sub is shared by every GC it works for`)
  ok(/quickbooks_vendor_links|linkedVendorId/.test(src), `${f} goes through the per-file links`)
}

const sync = code('app/api/quickbooks/sync/route.ts')
ok((sync.match(/\.gte\('created_at', syncFrom\)/g) ?? []).length === 4, 'after Start fresh the backlog leaves older money alone (bills, bill payments, payments, invoices)')
ok(/ids \? '1970-01-01'/.test(sync), '...but a record retried by id is still pushed')

const fresh = code('app/api/quickbooks/start-fresh/route.ts')
ok(fresh.indexOf("from('quickbooks_id_archive').insert") < fresh.indexOf('.update(t.clear)'), 'Start fresh archives each id BEFORE clearing it')
ok(/body\.confirm !== true/.test(fresh) && /mayManageCompanySetting/.test(fresh), '...only for an admin who confirmed')

const vercel = JSON.parse(read('vercel.json'))
const cron = vercel.crons.find((c: any) => c.path === '/api/cron/quickbooks-refresh')
ok(!!cron && !/\*\//.test(cron.schedule), 'the sign-ins are renewed by a DAILY cron (no sub-daily step the Hobby plan refuses)')
ok(/forceRefresh: true/.test(code('app/api/cron/quickbooks-refresh/route.ts')), '...which renews even a token that is not near expiry')

const privacy = read('lib/legal/privacy.ts')
ok(/com\.intuit\.quickbooks\.accounting/.test(privacy) && /encrypted \(AES-256\)/.test(privacy), 'the privacy policy names the one scope and the encryption')
ok(/QuickBooks Online/.test(read('lib/legal/terms.ts')), 'the terms cover the QuickBooks connection')
ok(/robots: \{ index: false/.test(read('app/auth/quickbooks/disconnected/page.tsx')), 'the Disconnect URL page exists and is not indexed')

// ── the refresh, run against a fake Intuit ───────────────────────────────────
type Row = Record<string, any>
async function runRefresh(reply: { status: number; body: string }, start: Row) {
  const row: Row = { ...start }
  const logs: Row[] = []
  const db: any = {
    from(table: string) {
      const q: any = {
        select() { return q }, eq() { return q },
        maybeSingle() { return Promise.resolve({ data: table === 'quickbooks_connections' ? { ...row } : null }) },
        update(patch: Row) { if (table === 'quickbooks_connections') Object.assign(row, patch); return q },
        insert(r: Row) { if (table === 'quickbooks_sync_log') logs.push(r); return Promise.resolve({ error: null }) },
        then(res: any) { return Promise.resolve({ data: null, error: null }).then(res) },
      }
      return q
    },
  }
  ;(globalThis as any).fetch = async () => ({ ok: reply.status < 400, status: reply.status, text: async () => reply.body, json: async () => JSON.parse(reply.body) })
  const conn = await getValidConnection(db, 'C1')
  return { conn, row, logs }
}
const stale: Row = {
  company_id: 'C1', realm_id: 'R', environment: 'sandbox', status: 'connected',
  access_token: sealToken('old-access', key), refresh_token: sealToken('old-refresh', key),
  access_expires_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z', last_refresh_error: null,
}

async function main() {
  const good = await runRefresh({ status: 200, body: JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, x_refresh_token_expires_in: 8726400 }) }, stale)
  ok(good.conn?.access_token === 'new-access', 'a stale access token is renewed')
  ok(isEncryptedToken(good.row.refresh_token) && openToken(good.row.refresh_token, key) === 'new-refresh', '...and the ROTATED refresh token is stored, sealed')
  ok(!!good.row.last_refreshed_at && good.row.last_refresh_error === null, '...with when, so the card can say it')

  const dead = await runRefresh({ status: 400, body: '{"error":"invalid_grant"}' }, stale)
  ok(dead.conn === null && dead.row.status === 'needs_reconnect', 'invalid_grant: the connection needs reconnecting')
  ok(dead.logs.length === 1 && dead.logs[0].status === 'error' && /reconnect/i.test(dead.logs[0].message), '...and the log says so, once')

  const blip = await runRefresh({ status: 503, body: 'down' }, stale)
  ok(blip.conn === null && blip.row.status === 'connected', 'a 503: this push misses, the CONNECTION stays')
  ok(blip.logs.length === 1 && /try again/i.test(blip.logs[0].message), '...and the miss is visible in the log, not silent')

  const wrong = await runRefresh({ status: 200, body: '{}' }, { ...stale, environment: 'production' })
  ok(wrong.conn === null, 'a production row is never used by this (sandbox) deploy')

  done()
}
main()
