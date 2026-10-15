// The documents group of the lockdown: compliance scans and vendor requests,
// the inspection and permit scans, the takeoff parser, the map's geocode sweep,
// and Files / Packets / Sharing.
//
// Every one of these asked only "is somebody signed in" - the routes use the
// service-role client, so nothing but the route's own code limits what a
// caller reads or writes. The worst of them: file-shares/[id]/send looked the
// share up by id ALONE, so any account holding a share id could email another
// company's link to anybody; compliance/request named ANY company id and handed
// back its contact address; and the three scans spent a metered model call and
// stored a file against any job id at all.

import { ok, done, code } from './_helpers'

function handler(src: string, verb: string): string {
  const start = src.indexOf(`export async function ${verb}(`)
  if (start < 0) return ''
  const next = src.indexOf('export async function', start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}

const R = (p: string) => `app/api/${p}/route.ts`

// ── no bare sign-in left anywhere in the group ──────────────────────────────
const GROUP: [string, string[]][] = [
  ['projects/[id]/compliance/analyze', ['POST']],
  ['projects/[id]/compliance/request', ['POST']],
  ['projects/[id]/compliance/request/[reqId]/send', ['POST']],
  ['projects/[id]/inspections/analyze', ['POST']],
  ['projects/[id]/inspections/[inspectionId]/card', ['POST']],
  ['projects/[id]/permits/analyze', ['POST']],
  ['item-list/parse', ['POST']],
  ['projects/geocode', ['POST']],
  ['files/upload-url', ['POST']],
  ['files/[fileId]', ['PATCH', 'DELETE']],
  ['files/packets', ['GET', 'POST']],
  ['files/packets/[packetId]', ['PATCH', 'DELETE']],
  ['file-shares/[id]', ['PATCH', 'DELETE']],
  ['file-shares/[id]/send', ['POST']],
]
for (const [path, verbs] of GROUP) {
  const src = code(R(path))
  ok(!/auth\.getUser\(|getCompanyId\(|scanActorFor\(/.test(src),
    `${path}: no bare "are you signed in" check left`)
  for (const v of verbs) {
    const h = handler(src, v)
    ok(h.length > 0, `${path} ${v}: handler found (fixture sanity)`)
    ok(/complianceAccess\(|requirePermission\(|filesAccess\(/.test(h), `${path} ${v}: asks a permission gate`)
  }
}
// GET /file-shares shares a file with POST, which keeps its own gate (pinned
// by billing-trial.ts); only GET is ours.
ok(/filesAccess\(db, request, \{ write: false/.test(handler(code(R('file-shares')), 'GET')),
  'file-shares GET: files: view, scoped to the company')
ok(!/auth\.getUser\(/.test(handler(code(R('file-shares')), 'GET')), '...and no bare sign-in left in it')

// ── compliance ──────────────────────────────────────────────────────────────
{
  const analyze = code(R('projects/[id]/compliance/analyze'))
  ok(/complianceAccess\(db, request, params\.id, \{ write: true \}\)/.test(analyze),
    'compliance scan: the same door as filing the document it fills in')
  ok(analyze.indexOf('complianceAccess(') < analyze.indexOf('guardScan('),
    '...asked BEFORE the meter row is written')
  ok(/guardScan\(db, access\.actor/.test(analyze), '...and the meter is charged to the gated actor')

  for (const p of ['projects/[id]/compliance/request', 'projects/[id]/compliance/request/[reqId]/send']) {
    const src = code(R(p))
    ok(/complianceAccess\(db, request, params\.id, \{ write: true \}\)/.test(src), `${p}: compliance: edit (with the billing lock)`)
    ok(/access\.scope !== 'owner'/.test(src), `${p}: the GC's job only - a sub on the job does not send requests`)
  }
  const req = code(R('projects/[id]/compliance/request'))
  ok(/companyOnJob\(db, params\.id, company_id\)/.test(req),
    'request: only a company ON this job can be asked - not any company id, with its address handed back')
  ok(req.indexOf('companyOnJob(') < req.indexOf("from('companies')"), '...checked before its contact address is read')
  const send = code(R('projects/[id]/compliance/request/[reqId]/send'))
  ok(/eq\('id', params\.reqId\)\.eq\('project_id', params\.id\)\.maybeSingle\(\)/.test(send),
    'send: only a request filed on THIS job - the job is what was gated')
  ok(send.indexOf('complianceAccess(') < send.indexOf('readSendBody('), 'send: gated before the body is read')
}

// ── inspection and permit scans ─────────────────────────────────────────────
for (const [p, resource] of [
  ['projects/[id]/inspections/analyze', 'inspections'],
  ['projects/[id]/inspections/[inspectionId]/card', 'inspections'],
  ['projects/[id]/permits/analyze', 'permits'],
] as const) {
  const src = code(R(p))
  ok(new RegExp(`requirePermission\\(db, request, '${resource}', 'edit'\\)`).test(src), `${p}: ${resource}: edit`)
  ok(/ownedProject\(db, gate\.actor, params\.id/.test(src), `${p}: on a job the caller's company owns`)
  ok(src.indexOf('ownedProject(') < src.indexOf('guardScan('), `${p}: both asked BEFORE the meter row`)
  ok(/guardScan\(db, gate\.actor/.test(src), `${p}: metered against the gated actor`)
}
{
  const card = code(R('projects/[id]/inspections/[inspectionId]/card'))
  const check = card.indexOf(".eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()")
  ok(check > 0 && check < card.indexOf('guardScan(') && check < card.indexOf('.upload('),
    'card: the inspection is on this job before a scan is spent or a file stored')
}

// ── takeoff parser and geocode sweep ────────────────────────────────────────
{
  const parse = code(R('item-list/parse'))
  ok(/requirePermission\(db, request, 'request-quotes', 'view'\)/.test(parse),
    "parse: the Request Quotes screen's gate - it reads the upload and writes nothing")
  ok(parse.indexOf('requirePermission(') < parse.indexOf('formData('), '...asked before the file is read')
  const geo = code(R('projects/geocode'))
  ok(/requirePermission\(db, request, 'projects', 'view'\)/.test(geo),
    'geocode: a real person with a company, on the Projects screen the map is drawn on')
  ok(/gc_company_id\.eq\.\$\{profile\.company_id\},created_by_company_id\.eq\.\$\{profile\.company_id\}/.test(geo),
    "...and only ever the caller's own company's jobs are sent to the paid geocoder")
  ok(geo.indexOf('requirePermission(') < geo.indexOf('lookUpAddress('), '...asked before any lookup')
}

// ── Files, Packets, Sharing: always the caller's company ────────────────────
{
  const file = code(R('files/[fileId]'))
  for (const v of ['PATCH', 'DELETE']) {
    const h = handler(file, v)
    ok(/filesAccess\(db, request, \{ write: true \}\)/.test(h), `files/[fileId] ${v}: files gate with the billing lock`)
    ok(/\.eq\('id', params\.fileId\)\s*\.eq\('company_id', company_id\)/.test(h), `files/[fileId] ${v}: only this company's file`)
  }
  const packets = code(R('files/packets'))
  ok(/filesAccess\(db, request, \{ write: false \}\)/.test(handler(packets, 'GET')), 'packets GET: files: view, no lock on a read')
  ok(/eq\('company_id', company_id\)/.test(handler(packets, 'GET')), "packets GET: only this company's packets")
  ok(/filesAccess\(db, request, \{ write: true \}\)/.test(handler(packets, 'POST')), 'packets POST: with the billing lock')
  const packet = code(R('files/packets/[packetId]'))
  for (const v of ['PATCH', 'DELETE']) {
    const h = handler(packet, v)
    ok(/filesAccess\(db, request, \{ write: true \}\)/.test(h), `packets/[packetId] ${v}: with the billing lock`)
    ok(/\.eq\('id', params\.packetId\)\s*\.eq\('company_id', company_id\)/.test(h), `packets/[packetId] ${v}: only this company's packet`)
  }
  const up = code(R('files/upload-url'))
  ok(/filesAccess\(db, request, \{ write: true \}\)/.test(up), 'upload-url: files gate with the billing lock')
  ok(/const path = `\$\{company_id\}\//.test(up), "...and the path is inside the caller's own company folder")

  const share = code(R('file-shares/[id]'))
  for (const v of ['PATCH', 'DELETE']) {
    ok(/filesAccess\(db, request, \{\s*write: true/.test(handler(share, v)), `file-shares/[id] ${v}: files gate with the billing lock`)
  }
  ok((share.match(/\.eq\('company_id', profile\.company_id\)/g) ?? []).length >= 4,
    "file-shares/[id]: every read and write is matched on the caller's company")
  const send = code(R('file-shares/[id]/send'))
  ok(/filesAccess\(db, request, \{ write: true \}\)/.test(send), 'file-shares send: files gate with the billing lock')
  ok(/eq\('id', params\.id\)\.eq\('company_id', access\.companyId\)\.maybeSingle\(\)/.test(send),
    "THE HOLE: the share it mails is the caller's company's, not any id somebody holds")
  ok(send.indexOf('filesAccess(') < send.indexOf('readSendBody('), 'file-shares send: gated before the body is read')
}

// ── behaviour: filesAccess against a fake db ────────────────────────────────
type Row = Record<string, unknown> | null
function fakeDb(opts: { user?: boolean; profile?: Row; billing?: Row }) {
  const builder = (table: string) => {
    const result = () => {
      if (table === 'profiles') return { data: opts.profile ?? null, error: opts.profile ? null : { message: 'none' } }
      if (table === 'company_billing') return { data: opts.billing ?? null, error: null }
      return { data: table === 'company_roles' ? [] : null, error: null }
    }
    const b: any = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      single: async () => result(), maybeSingle: async () => result(),
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    }
    return b
  }
  return {
    auth: { getUser: async () => ({ data: { user: opts.user === false ? null : { id: 'U1', user_metadata: {} } } }) },
    from: builder,
  } as any
}
const req = (auth = true) => new Request('http://x/api/files', { headers: auth ? { Authorization: 'Bearer t' } : {} })
const status = (g: any) => ('denied' in g ? g.denied.status : 200)

;(async () => {
  // next/server's compiled bundle reads __dirname, which an ES module does not
  // have; loading the gate lazily, after providing one, keeps the runner as is.
  ;(globalThis as any).__dirname = '/'
  const { filesAccess } = await import('../files-access')
  ok(status(await filesAccess(fakeDb({}), req(false), { write: false })) === 401, 'no token is a 401')
  ok(status(await filesAccess(fakeDb({ user: false }), req(), { write: false })) === 401, 'a token that resolves to nobody is a 401')

  const worker = { role: 'worker', company_id: 'C1', permission_overrides: null }
  const g = await filesAccess(fakeDb({ profile: worker }), req(), { write: true })
  ok(!('denied' in g) && g.companyId === 'C1',
    'a worker keeps Files - every role the page offers Upload/Rename/Delete to still gets through')

  const denied = { role: 'worker', company_id: 'C1', permission_overrides: { files: { view: false } } }
  ok(status(await filesAccess(fakeDb({ profile: denied }), req(), { write: false })) === 403,
    'somebody whose files permission is switched off is refused')

  const orphan = { role: 'admin', company_id: null, permission_overrides: null }
  ok(status(await filesAccess(fakeDb({ profile: orphan }), req(), { write: false })) === 401,
    'a profile with no company is refused - a Files row is always a company\'s')
  const kept = await filesAccess(fakeDb({ profile: orphan }), req(), {
    write: false, noCompany: () => new Response(JSON.stringify({ shares: [] }), { status: 200 }) as any,
  })
  ok(status(kept) === 200, '...answered the way that route always answered it')

  const locked = { company_id: 'C1', status: 'canceled' }
  ok(status(await filesAccess(fakeDb({ profile: worker, billing: locked }), req(), { write: true })) === 402,
    'a write on a locked account is a 402 - the lock requirePermission skips at view')
  ok(status(await filesAccess(fakeDb({ profile: worker, billing: locked }), req(), { write: false })) === 200,
    '...and a read on one still works: a locked account stays fully readable')

  done()
})()
