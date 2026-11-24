// A SUB IS ONE REAL COMPANY, AND EACH GC'S DIRECTORY ROW LINKS TO IT.
//
// Spec "Sub company login + dispatch", item 1, verified on the live database
// before the fix: an invite pointed INTO the GC's Directory row, so an
// owner-first sub's acceptance was refused and sat pending (1 live), an
// invite-first sub landed read-only inside the GC's row (2 live), and a
// second GC's invite was always refused. Since migration 169 the row LINKS
// to the sub's own company (lib/vendor-link.ts, lib/vendor-link-db.ts) and
// the sub reaches the job across the link (lib/sub-companies.ts).
//
// The spec's own repro is the centre of this file: create a sub company,
// invite the same email from GC A, then GC B - both should show as linked -
// and then the release tests, through the real gate.

import { ok, done, code } from './_helpers'

type Row = Record<string, any>
type Tables = Record<string, Row[]>

// Enough PostgREST, reads AND writes, for the accept path and the gate.
function fakeDb(t: Tables) {
  let n = 0
  return {
    tables: t,
    auth: { getUser: async (token: string) => ({ data: { user: token ? { id: token } : null } }) },
    from(table: string) {
      t[table] ??= []
      let filters: ((r: Row) => boolean)[] = []
      let op: { kind: 'select' | 'update' | 'insert' | 'upsert' | 'delete'; payload?: any } = { kind: 'select' }
      const match = () => t[table].filter(r => filters.every(f => f(r)))
      const run = () => {
        if (op.kind === 'insert' || op.kind === 'upsert') {
          const rows = (Array.isArray(op.payload) ? op.payload : [op.payload]).map((r: Row) => ({ id: r.id ?? `${table}-${++n}`, ...r }))
          for (const r of rows) {
            if (op.kind === 'upsert') {
              const at = t[table].findIndex(x => x.id === r.id)
              if (at >= 0) { t[table][at] = { ...t[table][at], ...r }; continue }
            }
            t[table].push(r)
          }
          return { data: rows, error: null }
        }
        if (op.kind === 'update') {
          const hit = match()
          // companies_one_link_per_gc: one link per GC per company (migration 169)
          if (table === 'companies' && op.payload.linked_company_id) {
            for (const r of hit) {
              const clash = t.companies.some(o => o.id !== r.id && o.added_by_company_id === r.added_by_company_id && o.linked_company_id === op.payload.linked_company_id)
              if (clash) return { data: null, error: { code: '23505', message: 'duplicate key' } }
            }
          }
          for (const r of hit) Object.assign(r, op.payload)
          return { data: hit, error: null }
        }
        if (op.kind === 'delete') {
          const hit = new Set(match()); t[table] = t[table].filter(r => !hit.has(r)); return { data: null, error: null }
        }
        return { data: match(), error: null }
      }
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
        in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return q },
        ilike: (c: string, p: string) => { const w = p.replace(/\\(.)/g, '$1').toLowerCase(); filters.push(r => String(r[c] ?? '').toLowerCase() === w); return q },
        or: (expr: string) => { const parts = expr.split(',').map(x => x.split('.eq.')); filters.push(r => parts.some(([c, v]) => r[c] === v)); return q },
        insert: (p: any) => { op = { kind: 'insert', payload: p }; return q },
        upsert: (p: any) => { op = { kind: 'upsert', payload: p }; return q },
        update: (p: any) => { op = { kind: 'update', payload: p }; return q },
        delete: () => { op = { kind: 'delete' }; return q },
        single: async () => { const r = run(); const d = Array.isArray(r.data) ? r.data[0] : r.data; return d ? { data: d, error: r.error } : { data: null, error: r.error ?? { message: 'no rows' } } },
        maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error } },
        then: (res: any, rej?: any) => Promise.resolve(run()).then(res, rej),
      }
      return q
    },
  } as any
}

const GC_A = 'gc-a', GC_B = 'gc-b'
const A_JOB = '11111111-1111-4111-8111-111111111111'
const B_JOB = '22222222-2222-4222-8222-222222222222'
const POOL_JOB = '33333333-3333-4333-8333-333333333333'

async function main() {
  ;(globalThis as any).__dirname = '/'
  const { linkPlan, isVendorInvite } = await import('../vendor-link')
  const { acceptVendorInvite, moveGuestToOwnCompany } = await import('../vendor-link-db')
  const { subAccountState, ownJobsRefusal } = await import('../sub-account')
  const { requirePermission } = await import('../api-guard')

  // ── the plan, every case ─────────────────────────────────────────────────
  const row = (over: Partial<Row> = {}) => ({ id: 'row', type: 'subcontractor', added_by_company_id: GC_A, linked_company_id: null, ...over }) as any
  const me = (companyId: string | null, companyType: string | null = null, companyIsDirectoryRow = false) => ({ companyId, companyType, companyIsDirectoryRow })
  ok(linkPlan(me(null), row()).do === 'create_company', 'plan: nobody yet -> a company of his own, never a seat in the GC\'s row')
  ok(linkPlan(me('pool', 'subcontractor'), row()).do === 'link', 'plan: a sub with his own company -> the row links to it')
  ok(linkPlan(me('pool', 'subcontractor'), row({ linked_company_id: 'pool' })).do === 'already', 'plan: already linked to him -> nothing to do')
  ok((linkPlan(me('pool', 'subcontractor'), row({ linked_company_id: 'other' })) as any).reason === 'row_taken',
    'plan: a row linked to ANOTHER business is refused - a GC cannot hand that seat to a new person')
  ok(linkPlan(me('row', 'subcontractor', true), row()).do === 'already', 'plan: an old-style guest IN this row -> nothing to do')
  ok(linkPlan(me('seat-a', 'subcontractor', true), row()).do === 'move_and_link', 'plan: a guest in ANOTHER GC\'s row -> his own company, then link (only on his accept)')
  ok((linkPlan(me('gc-c', 'gc'), row()) as any).reason === 'not_a_vendor', 'plan: a GC is never connected as somebody\'s sub by an invite')
  ok((linkPlan(me(null), row({ added_by_company_id: null })) as any).reason === 'not_a_directory_row', 'plan: only a Directory row can be linked')
  ok(isVendorInvite({ audience: null }, { type: 'subcontractor', added_by_company_id: GC_A }) && !isVendorInvite({ audience: 'team' }, { type: 'subcontractor', added_by_company_id: GC_A }),
    'an old invite (no audience) is read off its target; a stored audience wins')

  // ── THE SPEC'S REPRO: a sub company, invited by GC A, then by GC B ──────
  const t: Tables = {
    companies: [
      { id: GC_A, name: 'Alpha Builders', type: 'gc', added_by_company_id: null },
      { id: GC_B, name: 'Bravo Homes', type: 'gc', added_by_company_id: null },
      { id: 'pool', name: 'Blue Wave Pools', type: 'subcontractor', added_by_company_id: null, invited_only: false },
      { id: 'row-a', name: 'Blue Wave', type: 'subcontractor', added_by_company_id: GC_A, linked_company_id: null },
      { id: 'row-b', name: 'Blue Wave Pools LLC', type: 'subcontractor', added_by_company_id: GC_B, linked_company_id: null },
    ],
    profiles: [
      { id: 'owner', email: 'owner@bluewave.com', company_id: 'pool', role: 'admin' },
      { id: 'a-admin', email: 'a@alpha.com', company_id: GC_A, role: 'admin' },
    ],
    projects: [
      { id: A_JOB, gc_company_id: GC_A, created_by_company_id: GC_A },
      { id: B_JOB, gc_company_id: GC_B, created_by_company_id: GC_B },
      { id: POOL_JOB, gc_company_id: 'pool', created_by_company_id: 'pool' },
    ],
    subcontracts: [
      { id: 'sc-a', project_id: A_JOB, company_id: 'row-a' },
      { id: 'sc-b', project_id: B_JOB, company_id: 'row-b' },
    ],
    project_team_members: [],
    company_billing: [],
    company_roles: [],
  }
  const db = fakeDb(t)
  const owner = { id: 'owner', email: 'owner@bluewave.com', fullName: 'Pat Owner' }
  const a = await acceptVendorInvite(db, owner, 'row-a')
  const b = await acceptVendorInvite(db, owner, 'row-b')
  const byId = (id: string) => t.companies.find(c => c.id === id)!
  ok(a.ok && b.ok, 'owner-first: GC A\'s invite and then GC B\'s are both accepted (both were refused before)')
  ok(byId('row-a').linked_company_id === 'pool' && byId('row-b').linked_company_id === 'pool', '...and BOTH Directory rows show as linked to his one company')
  ok(t.profiles.find(p => p.id === 'owner')!.company_id === 'pool', '...and his profile never moved: an invite links, it does not take a business')
  ok(t.companies.filter(c => c.type === 'subcontractor').length === 3, '...and no company was created or merged by name')

  // ── release tests, through the real gate ─────────────────────────────────
  const call = async (who: string, job: string, resource: string, action: any = 'view') => {
    const g = await requirePermission(db, new Request(`https://app.sytenav.com/api/projects/${job}/x`, { headers: { Authorization: `Bearer ${who}` } }), resource, action)
    return 'denied' in g ? g.denied.status : g.side
  }
  ok(await call('owner', A_JOB, 'tasks') === 'sub' && await call('owner', B_JOB, 'tasks') === 'sub',
    'RELEASE: one sub linked to two GCs reaches each GC\'s job, on the sub side')
  ok(await call('owner', A_JOB, 'budget') === 403 && await call('owner', B_JOB, 'budget') === 403,
    '...and reads neither GC\'s money')
  ok(await call('a-admin', B_JOB, 'tasks') === 404, '...and GC A cannot read GC B\'s job through the sub they share')
  ok(await call('a-admin', POOL_JOB, 'tasks') === 404, 'RELEASE: a GC cannot see the sub\'s other customers\' jobs')

  // ── invite first: a brand-new person gets a company of his own ───────────
  t.profiles.push({ id: 'newbie', email: 'sam@fastelectric.com', company_id: null, role: null })
  t.companies.push({ id: 'row-elec', name: 'Fast Electric', type: 'subcontractor', trade: 'Electrical', phone: '555-0101', added_by_company_id: GC_A, linked_company_id: null })
  const n1 = await acceptVendorInvite(db, { id: 'newbie', email: 'sam@fastelectric.com', fullName: 'Sam' }, 'row-elec')
  const own = n1.ok ? byId(n1.companyId) : null
  ok(n1.ok && n1.created && !!own && own.id !== 'row-elec', 'invite-first: he gets his OWN company - not a read-only seat in the GC\'s row')
  ok(!!own && own.invited_only === true && own.name === 'Fast Electric' && own.trade === 'Electrical', '...born light (invited_only), named from what the GC typed')
  ok(t.profiles.find(p => p.id === 'newbie')!.role === 'admin' && byId('row-elec').linked_company_id === own?.id, '...he is its admin, and the GC\'s row links to it')
  ok(!t.company_billing.length, '...and no billing row: a sub is unmetered')

  // a GC that already has this business under another entry
  t.companies.push({ id: 'row-a2', name: 'Blue Wave (dup)', type: 'subcontractor', added_by_company_id: GC_A, linked_company_id: null })
  const dup = await acceptVendorInvite(db, owner, 'row-a2')
  ok(!dup.ok && (dup as any).reason === 'duplicate_entry', 'a second entry for the same business in ONE GC\'s book is refused with a sentence, never a 500')

  // a row already linked to somebody else
  t.profiles.push({ id: 'stranger', email: 'x@other.com', company_id: null, role: null })
  const taken = await acceptVendorInvite(db, { id: 'stranger', email: 'x@other.com', fullName: '' }, 'row-a')
  ok(!taken.ok && (taken as any).reason === 'row_taken' && t.profiles.find(p => p.id === 'stranger')!.company_id === null,
    'an invite to a row already linked to a business cannot be used to take it - and writes nothing')

  // ── the old-style guest: "Run your own jobs" moves only his login ───────
  t.companies.push({ id: 'seat', name: 'Volt Electric Co', type: 'subcontractor', added_by_company_id: GC_A, linked_company_id: null })
  t.profiles.push({ id: 'guest', email: 'vic@volt.com', company_id: 'seat', role: 'read_only' }, { id: 'guest2', email: 'jo@volt.com', company_id: 'seat', role: 'read_only' })
  t.subcontracts.push({ id: 'sc-volt', project_id: A_JOB, company_id: 'seat' })
  ok(subAccountState(byId('seat')) === 'guest', 'a login inside a GC\'s Directory row is a guest')
  ok(await call('guest', A_JOB, 'tasks') === 'sub', '...who reaches the GC\'s job today')
  const mv = await moveGuestToOwnCompany(db, { id: 'guest', email: 'vic@volt.com' }, 'seat')
  ok(mv.ok && t.profiles.find(p => p.id === 'guest')!.company_id === (mv as any).companyId && byId('seat').linked_company_id === (mv as any).companyId,
    'Run your own jobs: his own company, his login moved to it, and the seat he left links to it')
  ok(t.subcontracts.find(s => s.id === 'sc-volt')!.company_id === 'seat', '...every record stays on the GC\'s row')
  ok(await call('guest', A_JOB, 'tasks') === 'sub', '...and he still reaches the same GC job, across the link')
  const mv2 = await moveGuestToOwnCompany(db, { id: 'guest2', email: 'jo@volt.com' }, 'seat')
  ok(!mv2.ok && t.profiles.find(p => p.id === 'guest2')!.company_id === 'seat',
    'a SECOND person in that seat is told to join the first one\'s company - a second company could not be linked, and they would lose the GC\'s jobs')

  // ── light: no jobs or customers of your own until you choose ────────────
  ok(subAccountState({ type: 'subcontractor', invited_only: true }) === 'invited_only' && subAccountState({ type: 'gc' }) === 'open',
    'light vs open: only a company an invite made (or a guest seat) is light')
  ok(subAccountState({ type: 'gc', added_by_company_id: GC_A }) === 'open', '...a GC-typed Directory row is not a vendor seat')
  ok(!!(await ownJobsRefusal(db, own!.id)) && (await ownJobsRefusal(db, 'pool')) === null, 'ownJobsRefusal: the light company is refused, an existing sub is not')
  for (const f of ['lib/writes/project.ts', 'lib/writes/customer.ts', 'app/api/my-jobs/route.ts', 'app/api/projects/bulk/route.ts']) {
    const src = code(f)
    const at = src.indexOf('ownJobsRefusal(')
    const firstInsert = src.search(/\.from\('(projects|customers)'\)\s*\.insert\(|from\('(projects|customers)'\)\.insert\(/)
    ok(at > 0 && (firstInsert < 0 || at < firstInsert), `${f}: a light account is refused before anything is inserted`)
  }
  {
    const { createProject } = await import('../writes/project')
    const { createCustomer } = await import('../writes/customer')
    const before = t.projects.length
    const p1 = await createProject(db, { companyId: own!.id, body: { name: 'My own pool job' } })
    ok(p1.status === 403 && (p1.body as any).account === 'light' && t.projects.length === before,
      'createProject (the app AND Claude): a light account is refused, and nothing is written')
    const c1 = await createCustomer(db, { companyId: own!.id, body: { name: 'Mrs Smith' } })
    ok(c1.status === 403 && (c1.body as any).account === 'light' && !(t.customers ?? []).length, '...and so is createCustomer')
  }
  const runOwn = code('app/api/account/run-own-jobs/route.ts')
  ok(/profile\.role !== 'admin'/.test(runOwn) && !/body\./.test(runOwn), 'Run your own jobs: only the company admin opens a light company, and nothing comes from a body')

  // ── consent: a password reset never links an existing business ──────────
  const accept = code('app/api/invite/accept/route.ts')
  const vendorAt = accept.indexOf('const vendor = pending.find(p => p.vendor)')
  const vendorTail = vendorAt > 0 ? accept.slice(vendorAt) : ''
  ok(vendorTail.indexOf('if (existing?.company_id)') > 0 && vendorTail.indexOf('if (existing?.company_id)') < vendorTail.indexOf('acceptVendorInvite('),
    'invite/accept with no body links a vendor ONLY for somebody with no company yet - an existing business answers on the card')
  ok(/body\?\.invite_id/.test(accept) && /found\.vendor/.test(accept) && /decision === 'decline'/.test(accept),
    '...the card names its invite, which must be the caller\'s own pending vendor invite, and can be declined')
  ok(!!vendorTail && !/company_id: invite\.company_id,\s*role/.test(vendorTail),
    '...and a vendor is never written INTO the GC\'s Directory row any more')

  // ── the invite door ──────────────────────────────────────────────────────
  const invite = code('app/api/invite/route.ts')
  const branch = invite.indexOf('if (audience === \'vendor\' && vendorRow)')
  ok(branch > 0 && branch < invite.indexOf('generateLink('), 'an existing vendor account is handled BEFORE Supabase is asked for an invite link it would refuse')
  ok(/linkPlan\(/.test(invite.slice(branch)) && /GC_LINK_REFUSAL_TEXT\[plan\.reason\]/.test(invite), '...asked the same plan, so the GC learns at once when it cannot happen')
  ok(/vendorConnectEmail\(/.test(invite) && /audience: vendorRow \? 'vendor' : 'team'/.test(invite), '...sent a sign-in email with no credential, and the audience is stored on the row')
  const link = code('app/api/invite/[inviteId]/link/route.ts')
  ok(/added_by_company_id === profile\.company_id/.test(link), 'Copy link works for a vendor invite (it answered Not found on every one)')
  ok(/companies_one_link_per_gc/.test(code('supabase/migrations/169_directory_links.sql')), 'the database holds one link per GC per company')

  // ── ONE READER: no subcontract query asks for the caller's company alone ─
  const { execSync } = await import('node:child_process')
  const root = process.env.SYTENAV_ROOT ?? process.cwd()
  const files = execSync("grep -rl \"from('subcontracts')\" app lib --include=*.ts", { cwd: root }).toString().trim().split('\n').filter(f => f && !f.includes('__tests__'))
  const CALLER = /\.eq\('company_id',\s*(actor\.companyId|profile\.company_id|myCompanyId|gate\.actor\.companyId|who\.actor\.companyId|profile\?\.company_id)\)/
  const offenders: string[] = []
  for (const f of files) {
    const lines = code(f).split('\n')
    lines.forEach((l, i) => {
      if (!l.includes("from('subcontracts')")) return
      const win = lines.slice(i, i + 6).join(' ')
      const next = win.indexOf("from('", win.indexOf("from('subcontracts')") + 5)
      if (CALLER.test(next > 0 ? win.slice(0, next) : win)) offenders.push(`${f}:${i + 1}`)
    })
  }
  ok(files.length > 20, `the scan sees the subcontract queries (${files.length} files)`)
  ok(!offenders.length, `no subcontract query filters on the caller's company alone - it goes through vendorCompanyIds (${offenders.join(', ') || 'none'})`)

  // ON PLATFORM ON A JOB IS THE DIRECTORY'S ANSWER. The Subs & Team badge read
  // `added_manually` ("entered by hand, not through a bid"), so a sub who had
  // just connected to this GC still read "Not on platform" on the job.
  {
    const route = code('app/api/projects/[id]/team/route.ts')
    const page = code('app/(dashboard)/projects/[id]/team/page.tsx')
    ok(/linked_company_id/.test(route) && /on_platform/.test(route), 'the job roster derives on_platform from the link (and people under the row)')
    ok(!/added_manually\s*&&\s*<span[^>]*>Not on platform/.test(page), 'the badge no longer reads added_manually')
    ok(/on_platform\s*===\s*false\s*&&\s*<span[^>]*>Not on platform/.test(page), 'the badge shows only when the route says not on platform (a failed read shows nothing)')
  }

  // A SUB ON A GC'S JOB IS NOT OFFERED "EDIT PROJECT". The pencil showed for
  // everybody and the PATCH is refused to the sub lane, so it failed silently.
  {
    const route = code('app/api/my-jobs/[projectId]/route.ts')
    const page = code('app/(dashboard)/my-jobs/[projectId]/page.tsx')
    ok(/ownsJob:\s*owner === companyId/.test(route), 'the my-jobs route says whether the caller owns the job')
    ok(/data\?\.ownsJob\s*&&\s*\(\s*<button onClick=\{openEditProject\}/.test(page), 'Edit project is offered only on your own job')
  }

  done()
}

main()
