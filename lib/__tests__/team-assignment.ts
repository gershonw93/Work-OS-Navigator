// WHO IS ON THIS JOB, AND WHY A NAME MUST NOT ANSWER IT ACROSS COMPANIES.
//
// THE LEAK. Every assigned-only screen resolves "which jobs am I on" from
// `project_team_members`, and four copies of that chain ended with:
//
//     .from('project_team_members').select('project_id').or(conditions)
//     // conditions: [`email.eq.${email}`, `name.eq.${full_name}`]
//
// No company filter and no project filter, so the NAME half matched team rows
// across the WHOLE database. A field supervisor at one GC whose full name
// matched a row somebody typed at a different GC was handed that company's
// project. The live database had 8 such matches across 2 names.
//
// AND IT WAS THE MAIN PATH, not a rare edge: the fallback only runs when the
// profile_id match returns nothing, and nothing in the app ever WROTE
// profile_id - 64 of 73 live rows had it empty.
//
// THE OTHER HALF: matching an email exactly. Rows carry what a human typed
// ("Jay@..." beside "jay@..."), so a capital letter meant no match at all -
// a field supervisor with no projects and no error to explain it.
//
// Same rule as lib/inspector-link.ts, one table over: A NAME IS NOT A KEY.

import { myJobs, linkTeamRows } from '../my-jobs'
import { ok, done, code, exists, read, readCombined } from './_helpers'

// ── a Supabase stub, only the calls myJobs makes ────────────────────────────
interface Fake { tables: Record<string, any[]>; updates: { patch: any; ids: any[] }[] }

function fakeDb(tables: Record<string, any[]>): { db: any; log: Fake } {
  const log: Fake = { tables, updates: [] }
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      let pending: any = null
      const b: any = {
        select: () => b,
        update: (patch: any) => { pending = patch; return b },
        eq: (c: string, v: any) => { rows = rows.filter(r => r[c] === v); return b },
        is: (c: string, v: any) => { rows = rows.filter(r => (r[c] ?? null) === v); return b },
        in: (c: string, vs: any[]) => { rows = rows.filter(r => vs.includes(r[c])); return b },
        // PostgREST ilike with every wildcard escaped is an exact,
        // case-insensitive comparison - which is what myJobs asks for.
        ilike: (c: string, pat: string) => {
          const literal = String(pat).replace(/\\([%_\\])/g, '$1').toLowerCase()
          rows = rows.filter(r => String(r[c] ?? '').trim().toLowerCase() === literal)
          return b
        },
        or: (expr: string) => {
          const clauses = String(expr).split(',')
          rows = rows.filter(r => clauses.some(cl => {
            const [col, op, val] = cl.split('.')
            return op === 'eq' && String(r[col] ?? '') === val
          }))
          return b
        },
        then: (resolve: any) => {
          if (pending) log.updates.push({ patch: pending, ids: rows.map(r => r.id) })
          resolve({ data: rows, error: null })
        },
      }
      return b
    },
  }
  return { db, log }
}

const CO_A = 'company-a'
const CO_B = 'company-b'

// Two GCs. Each has a project. The SAME person's name appears on both teams -
// two different people who happen to share a name, which is the whole bug.
interface TeamRow {
  id: string; project_id: string; name: string
  email: string | null; profile_id: string | null
}
interface Fixture { projects: any[]; project_team_members: TeamRow[]; [table: string]: any[] }

const base = (): Fixture => ({
  projects: [
    { id: 'proj-a', gc_company_id: CO_A, created_by_company_id: CO_A },
    { id: 'proj-b', gc_company_id: CO_B, created_by_company_id: CO_B },
  ],
  project_team_members: [
    { id: 'tm-a', project_id: 'proj-a', name: 'Mike Rosenberg', email: null, profile_id: null },
    { id: 'tm-b', project_id: 'proj-b', name: 'Mike Rosenberg', email: null, profile_id: null },
  ],
})

void (async () => {
  // ── THE LEAK ────────────────────────────────────────────────────────────────
   await (async () => {
    const { db } = fakeDb(base())
    const mine = await myJobs(db, 'user-1', {
      full_name: 'Mike Rosenberg', email: null, company_id: CO_A,
    })
    ok(mine.projectIds.includes('proj-a'),
      'THE LEAK: a name match still finds my OWN company\'s job')
    ok(!mine.projectIds.includes('proj-b'),
      '...and NOT the namesake\'s job at another company - which it used to hand over')
    ok(mine.projectIds.length === 1, '...exactly one job, not both')
   })()

  // With no company known, a name cannot be scoped, so it answers nothing rather
  // than falling back to the whole table.
   await (async () => {
    const { db } = fakeDb(base())
    const mine = await myJobs(db, 'user-1', {
      full_name: 'Mike Rosenberg', email: null, company_id: null,
    })
    ok(mine.projectIds.length === 0,
      'with no company to scope by, a name resolves to NOTHING rather than to everyone\'s')
   })()

  // ── EMAIL IS AN IDENTITY, AND CASE MUST NOT DECIDE ──────────────────────────
   await (async () => {
    const t = base()
    t.project_team_members = [
      // The row's NAME deliberately differs from the profile's, so only the
      // address can satisfy this - otherwise the name branch rescues the
      // lookup and the assertion passes while the address match is broken.
      { id: 'tm-a', project_id: 'proj-a', name: 'J. Rosen (site)', email: 'Jay@26realtygroup.com', profile_id: null },
    ]
    const { db } = fakeDb(t)
    const mine = await myJobs(db, 'user-1', {
      full_name: 'Jay Rosen', email: 'jay@26realtygroup.com', company_id: CO_A,
    })
    ok(mine.projectIds.includes('proj-a'),
      'THE LOCKOUT: a typed "Jay@..." still matches a stored "jay@..."')
    ok(mine.memberIds.includes('tm-a'), '...and reports the team row, which tasks hang off')
   })()

  // An address is an identity, so it reaches across a company boundary on
  // purpose - that is how a sub or vendor appears on a GC's job.
   await (async () => {
    const t = base()
    t.project_team_members = [
      { id: 'tm-b', project_id: 'proj-b', name: 'Someone Else', email: 'sub@trade.com', profile_id: null },
    ]
    const { db } = fakeDb(t)
    const mine = await myJobs(db, 'user-1', { full_name: 'A Sub', email: 'sub@trade.com', company_id: CO_A })
    ok(mine.projectIds.includes('proj-b'),
      'an EMAIL match does cross companies - a sub on a GC\'s job is the point')
   })()

  // A near-miss must not match. `_` is a PostgREST wildcard; escaping it is why.
   await (async () => {
    const t = base()
    t.project_team_members = [
      // A DIFFERENT name on the row, so only the address is under test - the
      // first version of this shared one name with the profile, so the name
      // branch matched and the assertion proved nothing about escaping.
      { id: 'tm-a', project_id: 'proj-a', name: 'Not This Person', email: 'axb@trade.com', profile_id: null },
    ]
    const { db } = fakeDb(t)
    const mine = await myJobs(db, 'user-1', { full_name: 'Someone', email: 'a_b@trade.com', company_id: CO_A })
    ok(mine.projectIds.length === 0,
      'an underscore in an address is a literal, not a wildcard that matches a stranger')
   })()

  // ── THE FOREIGN KEY WINS ────────────────────────────────────────────────────
   await (async () => {
    const t = base()
    t.project_team_members = [
      { id: 'tm-a', project_id: 'proj-a', name: 'Mike Rosenberg', email: null, profile_id: 'user-1' },
      { id: 'tm-b', project_id: 'proj-b', name: 'Mike Rosenberg', email: null, profile_id: null },
    ]
    const { db } = fakeDb(t)
    const mine = await myJobs(db, 'user-1', { full_name: 'Mike Rosenberg', email: null, company_id: CO_A })
    ok(mine.projectIds.length === 1 && mine.projectIds[0] === 'proj-a',
      'a real profile_id answers on its own - the string fallbacks never run')
   })()

  // ── CLAIMING THE ROWS ───────────────────────────────────────────────────────
   await (async () => {
    const t = base()
    t.project_team_members = [
      { id: 'tm-1', project_id: 'proj-a', name: 'Jay', email: 'Jay@26realtygroup.com', profile_id: null },
      { id: 'tm-2', project_id: 'proj-b', name: 'Jay', email: 'jay@26realtygroup.com', profile_id: null },
      { id: 'tm-3', project_id: 'proj-a', name: 'Someone', email: 'other@x.com', profile_id: null },
      { id: 'tm-4', project_id: 'proj-a', name: 'Jay', email: 'jay@26realtygroup.com', profile_id: 'someone-else' },
    ]
    const { db, log } = fakeDb(t)
    const n = await linkTeamRows(db, 'user-1', 'JAY@26RealtyGroup.com')
    ok(n === 2, 'linking claims every unclaimed row with that address, whatever the case')
    const ids = log.updates.flatMap(u => u.ids)
    ok(ids.includes('tm-1') && ids.includes('tm-2'), '...both of them')
    ok(!ids.includes('tm-3'), '...and not somebody else\'s row')
    ok(!ids.includes('tm-4'), '...and never one already claimed by another account')
    ok(log.updates.every(u => u.patch.profile_id === 'user-1'), '...writing the foreign key')
   })()

   await (async () => {
    const { db, log } = fakeDb(base())
    ok(await linkTeamRows(db, 'user-1', null) === 0 && log.updates.length === 0,
      'no address means no linking, and no blind write')
   })()

  // ── ONE HOME: no copy of the chain left anywhere ────────────────────────────
  const CALLERS = [
    'app/api/projects/route.ts',
    'app/api/projects/stats/route.ts',
    'lib/server-permissions.ts',
    'app/api/me/tasks/route.ts',
    'app/api/me/inspections/route.ts',
  ]
  for (const f of CALLERS) {
    const src = code(f)
    ok(/myJobs\(/.test(src), `${f.split('/').slice(-2).join('/')}: asks myJobs`)
    ok(!/name\.eq\.\$\{/.test(src) && !/email\.eq\.\$\{/.test(src),
      `...and builds no PostgREST filter string out of a name or an address`)
  }
  // The interpolated `.or()` is also an injection into filter grammar: a name
  // with a comma in it reparsed into different filters entirely.
  for (const f of [...CALLERS, 'lib/my-jobs.ts']) {
    ok(!/\.or\(conditions\.join|\.or\(conds\.join/.test(code(f)),
      `${f.split('/').slice(-2).join('/')}: no or()-joined condition list`)
  }
  // myJobs itself must scope the name branch by project.
  const resolver = code('lib/my-jobs.ts')
  ok(/\.eq\('name', fullName\)[\s\S]{0,80}\.in\('project_id'/.test(resolver),
    'myJobs: the name match is constrained to a list of this company\'s projects')
  ok(/company_id/.test(resolver), '...which it gets from the caller\'s own company')

  // Every caller must actually READ company_id, or the name branch is silently
  // dead for it - the same shape as selecting a column that does not exist.
  for (const f of CALLERS) {
    if (!/myJobs\(/.test(code(f))) continue
    ok(/company_id/.test(code(f)),
      `${f.split('/').slice(-2).join('/')}: selects company_id, so the name branch can run`)
  }

  // ── the back-fill ships with it ─────────────────────────────────────────────
  ok(exists('supabase/migrations/111_link_team_members_to_profiles.sql'),
    'the existing rows are back-filled by a migration, not left to heal one login at a time')
  const mig = read('supabase/migrations/111_link_team_members_to_profiles.sql')
  ok(/lower\(btrim\(tm\.email\)\) = lower\(btrim\(p\.email\)\)/.test(mig),
    '...matching the address case-insensitively')
  ok(/profile_id IS NULL/.test(mig), '...only rows nobody has claimed')
  ok(/count\(\*\)[\s\S]{0,160}= 1/.test(mig),
    '...and refusing an address that two profiles share, rather than guessing which')
  ok(/111/.test(readCombined()) || /link_team_members_to_profiles/.test(readCombined()),
    '...and it is in the combined fresh-install file')

  ok(/linkTeamRows/.test(code('app/api/invite/accept/route.ts')),
    'accepting an invite claims the rows that were typed before the account existed')


  done()
})()
