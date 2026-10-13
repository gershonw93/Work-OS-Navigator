// Claude FILING DOCUMENTS through the MCP server - "I send Claude a doc, it
// works out whether it is a bill, a certificate or whatever, and puts it where
// it goes, or asks when it is not sure."
//
// What must hold:
//   - add and edit only, and the area file writes nothing itself - every write
//     goes through the lib/writes function the app's route calls;
//   - the attachment is OPTIONAL everywhere, and every tool answers with the
//     in-app page (attach_url) where the person can drop the original;
//   - an attachment is a PDF or a photo of at most 3MB, and too big is a
//     SENTENCE that names that page, with nothing written;
//   - a compliance document's stored status FOLLOWS ITS DATE and Claude never
//     approves one;
//   - a sub from another job, or a job from another company, is refused;
//   - every handler on the compliance and Files routes this touches is gated -
//     they used to ask only "is somebody signed in", so any account holding a
//     job id could file, or approve, any company's certificate.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { DOCUMENTS_READ, DOCUMENTS_WRITE, DESTINATIONS } from '../mcp/areas/documents'
import { complianceStatusFor } from '../writes/compliance-document'
import { readDocument, MAX_DOCUMENT_BYTES } from '../writes/stored-document'
import { statusFromExpiry } from '../compliance-report'
import { RESOURCES, getEffectivePermissions, getRoleDefaults } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { ok, done, code } from './_helpers'

type Op = [string, ...unknown[]]
type Call = { table: string; ops: Op[] }
type Answer = { data?: unknown; error?: { message: string; code?: string } | null }
type Upload = { bucket: string; path: string; size: number }

function fakeDb(answer: (table: string, ops: Op[]) => Answer | undefined) {
  const calls: Call[] = []
  const uploads: Upload[] = []
  const removed: string[] = []
  const db: any = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const settle = () => {
        const a = answer(table, call.ops) ?? { data: [] }
        return { data: a.data ?? null, error: a.error ?? null }
      }
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: any) => resolve(settle())
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args])
            if (prop === 'maybeSingle' || prop === 'single') {
              const r = settle()
              return Promise.resolve(Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r)
            }
            return chain
          }
        },
      })
      return chain
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Buffer) => { uploads.push({ bucket, path, size: bytes.length }); return { error: null } },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://store/${bucket}/${path}` }, error: null }),
        remove: async (paths: string[]) => { removed.push(...paths); return { error: null } },
      }),
    },
  }
  return { db, calls, uploads, removed }
}
const has = (ops: Op[], method: string, ...args: unknown[]) =>
  ops.some(([m, ...a]) => m === method && args.every((x, i) => a[i] === x))
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any
const eqVal = (ops: Op[], key: string) => ops.find(([m, k]) => m === 'eq' && k === key)?.[2]
const written = (calls: Call[], table: string, method: 'insert' | 'update' | 'upsert' | 'delete') =>
  calls.filter(c => c.table === table && has(c.ops, method)).map(c => opArg(c.ops, method))

const actor = (role = 'admin'): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})
const WRITE = { canWrite: true, tokenId: 'tok1' }
const READ = { canWrite: false, tokenId: 'tok1' }

const pdf = (bytes: number, content_type = 'application/pdf') =>
  ({ filename: 'ACORD 25.pdf', content_type, data_base64: Buffer.alloc(bytes, 7).toString('base64') })

const ymd = (days: number) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The company owns job p1; sub1 has a subcontract on it; `existing` is a COI already filed for sub1. */
function db(opts: { existing?: Record<string, unknown> | null; folders?: string[]; extra?: (t: string, ops: Op[]) => Answer | undefined } = {}) {
  return fakeDb((t, ops) => {
    const e = opts.extra?.(t, ops); if (e) return e
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', company_id: 'c1', role: 'admin' } }
    if (t === 'projects') return { data: [{ id: 'p1', name: 'Maple Street Duplex' }] }
    if (t === 'subcontracts') {
      const onJob = eqVal(ops, 'project_id') === 'p1' && (eqVal(ops, 'company_id') ?? 'sub1') === 'sub1'
      return { data: onJob ? [{ id: 'sc1', company_id: 'sub1', companies: { id: 'sub1', name: 'Ace Electric', type: 'sub' } }] : [] }
    }
    if (t === 'compliance_documents' && has(ops, 'upsert')) return { data: { id: 'cd1', ...opArg(ops, 'upsert') } }
    if (t === 'compliance_documents' && has(ops, 'maybeSingle')) return { data: opts.existing ?? null }
    if (t === 'plan_folders' && has(ops, 'maybeSingle')) {
      const id = eqVal(ops, 'id')
      return { data: (opts.folders ?? ['f1']).includes(id as string) && eqVal(ops, 'project_id') === 'p1' ? { id } : null }
    }
    if (has(ops, 'insert')) return { data: { id: 'new1', ...opArg(ops, 'insert') } }
    return { data: [] }
  })
}
const run = (d: any, name: string, args: Record<string, unknown>, opts = WRITE, who = actor()) => callTool(d, who, name, args, opts) as Promise<any>

/** One handler's source, from its `export async function` to the next. */
function handler(src: string, h: string): string {
  const start = src.indexOf(`export async function ${h}`)
  if (start < 0) return ''
  const next = src.slice(start + 10).search(/export async function /)
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next)
}

async function main() {
  const area = code('lib/mcp/areas/documents.ts')
  const all = [...DOCUMENTS_READ, ...DOCUMENTS_WRITE]

  // ── the tools are there, and add or edit only ─────────────────────────────
  for (const n of ['document_destinations', 'list_compliance', 'list_files', 'list_plan_sheets']) {
    ok(ALL_TOOLS.some(t => t.name === n && !('write' in t)), `${n} is a READ tool the dispatcher knows`)
  }
  for (const n of ['file_compliance_document', 'file_document', 'add_plan_sheet']) {
    ok(ALL_TOOLS.some(t => t.name === n && (t as any).write === true), `${n} is a WRITE tool the dispatcher knows`)
  }
  ok(DOCUMENTS_WRITE.every(t => t.action === 'create' || t.action === 'edit'), 'no tool here asks for delete')
  ok(all.every(t => !/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name)), 'no tool is named for a forbidden act')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok(all.every(t => keys.has(t.resource)), 'every tool names a real permission resource')
  ok(!/\.(insert|update|upsert|delete|upload|remove)\(/.test(area), 'THE AREA FILE WRITES NOTHING ITSELF - rows and files go through lib/writes')
  ok(DOCUMENTS_WRITE.every(t => 'document' in ((t.inputSchema as any).properties ?? {}) && !((t.inputSchema as any).required ?? []).includes('document')),
    'every filing tool TAKES a document and none REQUIRES one')
  ok(!/compliance\/request|analyze/.test(area), 'neither emailing a sub for paperwork nor the model scan is reachable from here')

  // ── the catalogue names tools that exist ──────────────────────────────────
  for (const d of DESTINATIONS) {
    if (d.tool) ok(ALL_TOOLS.some(t => t.name === d.tool), `document_destinations sends "${d.kind}" to ${d.tool}, which exists`)
    ok(d.ask_when_unsure.length > 0, `...and says what to ask when "${d.kind}" is not clear`)
  }
  ok(/create_sub_bill/.test(JSON.stringify(DESTINATIONS)) && /file_compliance_document/.test(JSON.stringify(DESTINATIONS)) && /file_document/.test(JSON.stringify(DESTINATIONS)),
    '...including bills, certificates and the catch-all')
  {
    const { db: d, calls } = db()
    const r = await run(d, 'document_destinations', {}, READ, actor('worker'))
    ok('data' in r && r.data.destinations.every((x: any) => /^https?:\/\/.+\//.test(x.attach_url)), 'every destination carries an absolute attach_url, even for a worker')
    ok(!calls.some(c => c.table !== 'projects'), '...and reading it touches no table - it is pure data')
  }

  // ── each tool's lib function is the one the route calls ───────────────────
  const pairs: [string, string, string][] = [
    ['fileComplianceDocument', 'app/api/projects/[id]/compliance/route.ts', 'file_compliance_document'],
    ['recordCompanyFile', 'app/api/files/route.ts', 'file_document'],
    ['recordPlanSheet', 'app/api/projects/[id]/plans/upload/route.ts', 'add_plan_sheet'],
  ]
  for (const [fn, route, tool] of pairs) {
    ok(new RegExp(`await ${fn}\\(`).test(code(route)), `${route} calls ${fn}`)
    ok(new RegExp(`await ${fn}\\(`).test(area), `...and so does ${tool}`)
  }

  // ── every handler on every route touched here is gated ────────────────────
  const routes: [string, Record<string, RegExp[]>][] = [
    ['app/api/projects/[id]/compliance/route.ts', {
      GET: [/complianceAccess\(db, request, params\.id, \{ write: false \}\)/],
      PUT: [/complianceAccess\(db, request, params\.id, \{ write: true \}\)/, /access\.scope !== 'owner'/],
      POST: [/complianceAccess\(db, request, params\.id, \{ write: true \}\)/],
    }],
    ['app/api/projects/[id]/compliance/[docId]/route.ts', { PATCH: [/requirePermission\(db, request, 'compliance', 'edit'\)/, /ownedProject\(/, /project_id === params\.id/] }],
    ['app/api/files/route.ts', {
      GET: [/requirePermission\(db, request, 'files', 'view'\)/],
      POST: [/requirePermission\(db, request, 'files', 'view'\)/, /billingLock\(db, company_id\)/],
    }],
    ['app/api/projects/[id]/plans/upload/route.ts', { POST: [/requirePermission\(admin, request, 'plans', 'create'\)/, /ownedProject\(/] }],
  ]
  for (const [file, gates] of routes) {
    const src = code(file)
    const handlers = Array.from(src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)).map(m => m[1])
    ok(handlers.length === Object.keys(gates).length && handlers.every(h => h in gates), `${file}: every handler is listed here (${handlers.join(', ')})`)
    for (const h of handlers) {
      const body = handler(src, h)
      ok(!!gates[h] && gates[h].every(re => re.test(body)), `${file} ${h} is gated`)
      ok(!/auth\.getUser\(/.test(body), `${file} ${h} no longer settles for "somebody is signed in"`)
    }
  }
  const access = code(X
  ok(/requirePermission\(db, request, 'projects', 'view'\)/.test(access) && /ownsProject\(actor\.companyId/.test(access),
    'the compliance gate resolves the person and asks whether their company OWNS the job')
  ok(/actorCan\(actor, 'compliance', 'view'\)/.test(access) && /companyOnJob\(db, projectId, actor\.companyId\)/.test(access),
    '...the owner needs compliance; anyone else only sees their OWN company, and only when they are on the job')
  ok(/opts\.write \? billingLock/.test(access), '...and a write meets the billing lock')
  const post = handler(code('app/api/projects/[id]/compliance/route.ts'), 'POST')
  ok(/body\?\.company_id !== access\.companyId/.test(post), 'a sub files for its OWN company only')
  ok(/body\?\.status === 'approved'/.test(post), '...and cannot approve its own paperwork')
  const get = handler(code('app/api/projects/[id]/compliance/route.ts'), 'GET')
  ok(/scope === 'own-company'\) subQuery = subQuery\.eq\('company_id', access\.companyId\)/.test(get), 'a sub READS only its own company\'s documents')

  // ── the document rules ────────────────────────────────────────────────────
  {
    const big = readDocument(pdf(MAX_DOCUMENT_BYTES + 1), 'https://app/x/compliance') as any
    ok(!!big?.problem && /over 3MB, too big to send through Claude/.test(big.problem) && /https:\/\/app\/x\/compliance/.test(big.problem),
      'TOO BIG IS A SENTENCE that names the page to drop it on')
    ok(!('problem' in (readDocument(pdf(MAX_DOCUMENT_BYTES), 'x') as any)), '...and exactly 3MB is fine')
    ok(/PDF or a photo/.test((readDocument(pdf(10, 'text/html'), 'x') as any).problem), 'a type that is not a PDF or photo is refused')
    ok(readDocument(undefined, 'x') === null, 'no document is not an error')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(200), document: pdf(MAX_DOCUMENT_BYTES + 10) })
    ok('error' in r && /too big/.test(r.error) && /\/projects\/p1\/compliance/.test(r.error), 'an oversized COI is refused with the sentence and the Compliance tab')
    ok(!written(calls, 'compliance_documents', 'upsert').length && !uploads.length, '...and nothing is stored or filed')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', document: pdf(100, 'application/zip') })
    ok('error' in r && !written(calls, 'compliance_documents', 'upsert').length && !uploads.length, 'a wrong file type is refused before anything is stored')
  }

  // ── compliance: the date decides, and Claude never approves ───────────────
  for (const [days, want] of [[-3, 'expired'], [0, 'expiring_soon'], [10, 'expiring_soon'], [200, 'pending']] as [number, string][]) {
    const { db: d, calls } = db()
    await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(days), status: 'approved' } as any)
    const row = written(calls, 'compliance_documents', 'upsert')[0]
    ok(row?.status === want, `a COI dated ${days} days out is stored "${want}" - even when asked to approve it`)
    const shown = statusFromExpiry(row ?? { status: 'pending', expiry_date: null })
    ok(!(shown === 'expired' && row?.status !== 'expired') && !(row?.status === 'expired' && shown !== 'expired'),
      '...and the stored status never contradicts what the date says')
  }
  {
    const { db: d, calls } = db()
    await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'w9', entity_type: 'llc', ein_last4: '1234' })
    const row = written(calls, 'compliance_documents', 'upsert')[0]
    ok(row?.status === 'pending' && row?.expiry_date === null, 'an UNDATED document (a W-9) is filed pending for a person to review')
    ok(/EIN …1234/.test(row?.notes ?? ''), '...with the details written the way the Compliance form writes them')
  }
  ok([-400, -1, 0, 1, 29, 31, 3650].every(n => complianceStatusFor(ymd(n)) !== ('approved' as any)) && complianceStatusFor(null) === 'pending',
    'complianceStatusFor never answers "approved"')
  {
    const { db: d, calls } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'w9', ein_last4: '12-3456789' })
    ok('error' in r && !written(calls, 'compliance_documents', 'upsert').length, 'a FULL EIN is refused - last four only')
  }

  // ── compliance: whose, and which job ──────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi' }, READ)
    ok('error' in r && !written(calls, 'compliance_documents', 'upsert').length, 'a READ-ONLY connection cannot file')
  }
  {
    const { db: d, calls } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p-other', company_id: 'sub1', type: 'coi' })
    ok('error' in r && !written(calls, 'compliance_documents', 'upsert').length, 'ANOTHER COMPANY\'S JOB is refused')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub-elsewhere', type: 'coi', document: pdf(100) })
    ok('error' in r && /not a vendor on this job/.test(r.error), 'A SUB WHO IS NOT ON THIS JOB is refused')
    ok(!written(calls, 'compliance_documents', 'upsert').length && !uploads.length, '...before anything is stored')
  }
  {
    const { db: d, calls } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi' }, WRITE, actor('project_manager'))
    ok('error' in r && !written(calls, 'compliance_documents', 'upsert').length, 'compliance VIEW (a Project Manager by default) cannot file through Claude')
  }

  // ── compliance: with no file, and replacing one ───────────────────────────
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(200), insurer: 'Acme Mutual' })
    const row = written(calls, 'compliance_documents', 'upsert')[0]
    ok('data' in r && row?.company_id === 'sub1' && row?.project_id === 'p1' && row?.file_url === null && !uploads.length, 'WITH NO FILE the details are still filed')
    ok(/\/projects\/p1\/compliance$/.test(r.data?.attach_url ?? '') && r.data?.file_attached === false, '...and the answer says where to drop the original')
    ok(written(calls, 'project_activity', 'insert')[0]?.actor_name === 'Dana Reyes via Claude', '...credited "Dana via Claude" in the job history')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(200), document: pdf(2048) })
    const row = written(calls, 'compliance_documents', 'upsert')[0]
    ok('data' in r && uploads[0]?.bucket === 'submittals' && /^compliance\/sub1\/coi-\d+-ACORD_25\.pdf$/.test(uploads[0]?.path ?? ''),
      'a file is stored where the sub\'s own upload link stores it')
    ok(row?.file_url === `https://store/submittals/${uploads[0]?.path}` && r.data?.file_attached === true, '...and the document points at it')
  }
  {
    const existing = { id: 'cd0', expiry_date: ymd(5), notes: 'GL $1,000,000', file_url: 'https://store/old.pdf' }
    const { db: d, calls } = db({ existing })
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(370) })
    ok('error' in r && /already has a COI/.test(r.error) && !written(calls, 'compliance_documents', 'upsert').length,
      'REPLACING one already on file is refused unless asked for - creating is not destroying')
  }
  {
    const existing = { id: 'cd0', expiry_date: ymd(5), notes: 'GL $1,000,000', file_url: 'https://store/old.pdf' }
    const { db: d, calls } = db({ existing })
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', expiry_date: ymd(370), replaces_existing: true })
    const row = written(calls, 'compliance_documents', 'upsert')[0]
    ok('data' in r && r.data.replaced === true && row?.expiry_date === ymd(370), 'with replaces_existing the renewal is filed')
    ok(row?.file_url === 'https://store/old.pdf' && row?.notes === 'GL $1,000,000', '...and a field left out keeps what was on file rather than being wiped')
  }
  {
    const { db: d, uploads, removed } = db({ extra: (t, ops) => (t === 'compliance_documents' && has(ops, 'upsert') ? { error: { message: 'boom' } } : undefined) })
    const r = await run(d, 'file_compliance_document', { project_id: 'p1', company_id: 'sub1', type: 'coi', document: pdf(100) })
    ok('error' in r && uploads.length === 1 && removed.includes(uploads[0].path), 'a refused filing takes its stored file with it')
  }

  // ── Files ─────────────────────────────────────────────────────────────────
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_document', { name: 'GL certificate 2026', category: 'Insurance' })
    ok('data' in r && r.data.created === false && /\/files$/.test(r.data.attach_url) && !written(calls, 'company_files', 'insert').length && !uploads.length,
      'WITH NO FILE a Files entry is not invented - the answer says where to drop it')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_document', { name: 'GL certificate 2026', category: 'Insurance', document: pdf(500), company_id: 'c2' } as any)
    const ins = written(calls, 'company_files', 'insert')[0]
    ok('data' in r && uploads[0]?.bucket === 'company-files' && /^c1\/\d+-ACORD_25\.pdf$/.test(uploads[0]?.path ?? ''),
      'a file is stored in the ACTOR\'s company folder, never one from the arguments')
    ok(ins?.company_id === 'c1' && ins?.category === 'Insurance' && ins?.size_bytes === 500 && ins?.file_type === 'application/pdf', '...and recorded in Files')
  }
  {
    const { db: d, calls } = db()
    const r = await run(d, 'file_document', { name: 'x', category: 'Secret', document: pdf(10) })
    ok('error' in r && !written(calls, 'company_files', 'insert').length, 'a folder Files does not have is refused')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'file_document', { name: 'x', document: pdf(MAX_DOCUMENT_BYTES + 1) })
    ok('error' in r && /too big/.test(r.error) && /\/files/.test(r.error) && !uploads.length && !written(calls, 'company_files', 'insert').length,
      'an oversized file for Files is refused with the sentence')
  }

  // ── Plans ─────────────────────────────────────────────────────────────────
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'add_plan_sheet', { project_id: 'p1', name: 'A-101', plan_type: 'architectural' })
    ok('data' in r && r.data.created === false && /\/projects\/p1\/plans$/.test(r.data.attach_url) && !written(calls, 'project_plans', 'insert').length && !uploads.length,
      'WITH NO FILE no blank plan sheet is made - the answer is the Plans tab')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'add_plan_sheet', { project_id: 'p1', name: 'A-101', plan_type: 'architectural', folder_id: 'f1', document: pdf(800) })
    const ins = written(calls, 'project_plans', 'insert')[0]
    ok('data' in r && uploads[0]?.bucket === 'plans' && /^p1\/f1\/\d+-ACORD_25\.pdf$/.test(uploads[0]?.path ?? ''), 'a sheet is stored where the Plans upload stores it')
    ok(ins?.project_id === 'p1' && ins?.storage_path === uploads[0]?.path && ins?.plan_type === 'architectural', '...and recorded with its storage path')
  }
  {
    const { db: d, calls, uploads } = db()
    const r = await run(d, 'add_plan_sheet', { project_id: 'p1', name: 'A-101', plan_type: 'architectural', folder_id: 'f-elsewhere', document: pdf(800) })
    ok('error' in r && !uploads.length && !written(calls, 'project_plans', 'insert').length, 'a folder on another job is refused')
  }
  {
    const { db: d, uploads } = db()
    const r = await run(d, 'add_plan_sheet', { project_id: 'p1', name: 'A-101', plan_type: 'architectural', document: pdf(800, 'image/heic') })
    ok('error' in r && !uploads.length, 'a type the Plans viewer cannot open is refused')
  }
  {
    const { db: d, calls } = db()
    const r = await run(d, 'add_plan_sheet', { project_id: 'p1', name: 'A-101', plan_type: 'architectural', document: pdf(10) }, WRITE, actor('office_staff'))
    ok('error' in r && !written(calls, 'project_plans', 'insert').length, 'plans VIEW (office staff by default) cannot add a sheet')
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  {
    const { db: d } = db({
      extra: (t) => t === 'compliance_documents'
        ? { data: [{ id: 'cd1', company_id: 'sub1', project_id: 'p1', type: 'coi', status: 'approved', expiry_date: ymd(-2), notes: null, file_url: 'u' }] }
        : t === 'compliance_requirements' ? { data: [] } : undefined,
    })
    const r = await run(d, 'list_compliance', { project_id: 'p1' }, READ)
    const coi = r.data?.vendors?.[0]?.documents?.find((x: any) => x.type === 'coi')
    ok(coi?.status === 'Expired' && coi?.file_attached === true, 'list_compliance reads a lapsed "approved" COI as Expired, as the tab does')
    ok(r.data?.vendors?.[0]?.company_id === 'sub1' && /\/projects\/p1\/compliance$/.test(r.data?.attach_url), '...naming the vendor id and the page')
  }
  {
    const { db: d } = db({ extra: t => (t === 'compliance_documents' ? { error: { message: 'boom' } } : undefined) })
    const r = await run(d, 'list_compliance', { project_id: 'p1' }, READ)
    ok('error' in r, 'A FAILED READ IS AN ERROR, never "nothing on file"')
  }
  {
    const { db: d, calls } = db({ extra: t => (t === 'company_files' ? { data: [{ id: 'f1', name: 'W-9', category: 'W-9', file_url: 'https://secret' }] } : undefined) })
    const r = await run(d, 'list_files', {}, READ)
    const q = calls.find(c => c.table === 'company_files')
    ok('data' in r && r.data.files[0]?.name === 'W-9' && !JSON.stringify(r.data).includes('https://secret'), 'list_files names the files without handing out their signed links')
    ok(!!q && eqVal(q.ops, 'company_id') === 'c1', '...and reads only the actor\'s own company')
  }
  {
    const { db: d } = db({ extra: t => (t === 'company_files' || t === 'project_plans' ? { error: { message: 'boom' } } : undefined) })
    ok('error' in (await run(d, 'list_files', {}, READ)) && 'error' in (await run(d, 'list_plan_sheets', { project_id: 'p1' }, READ)), '...and a failed read of either is an error')
  }

  done()
}

main()
