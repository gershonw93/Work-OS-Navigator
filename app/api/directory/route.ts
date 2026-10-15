import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createDirectoryContact } from '@/lib/writes/directory-contact'
import { getActor, actorCan } from '@/lib/server-permissions'
import { billingLock } from '@/lib/api-guard'
import { directoryReadLevel, DIRECTORY_SHARE_FIELDS } from '@/lib/company-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function actorOf(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  return getActor(admin(), token)
}

const forbidden = () =>
  NextResponse.json({ error: 'You do not have permission to view directory.' }, { status: 403 })

// THE DIRECTORY, always the caller's own company's. `directory: view` reads it
// whole. Without it, `files: view` gets the slice the Files page's "Share
// documents" box reads (name, address, kind) - a Worker opens that box today
// and must not lose its suggestions - and nobody else gets anything.
export async function GET(request: Request) {
  const actor = await actorOf(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const level = directoryReadLevel(actor)
  if (!level) return forbidden()

  const db = admin()

  const myCompanyId = actor.companyId
  if (!myCompanyId) return NextResponse.json({ companies: [], contacts: [] })

  // Find all company IDs this company has a relationship with:
  // 1. Their own company
  // 2. Subcontractors on their projects (as GC)
  // 3. GC companies on projects they're subbed to (as Sub)
  // 4. Companies they explicitly added to the directory (added_by_company_id)
  const [projectsRes, subcontractsAsSubRes] = await Promise.all([
    db.from('projects').select('id').eq('gc_company_id', myCompanyId),
    db.from('subcontracts').select('project_id, companies!inner(id)').eq('company_id', myCompanyId),
  ])

  const myProjectIds = (projectsRes.data ?? []).map((p: any) => p.id)

  // Subs on my projects
  let subCompanyIds: string[] = []
  if (myProjectIds.length > 0) {
    const { data: subs } = await db
      .from('subcontracts')
      .select('company_id')
      .in('project_id', myProjectIds)
    subCompanyIds = (subs ?? []).map((s: any) => s.company_id).filter(Boolean)
  }

  // GC companies on projects I'm subbed to
  const mySubProjectIds = (subcontractsAsSubRes.data ?? []).map((s: any) => s.project_id).filter(Boolean)
  let gcCompanyIds: string[] = []
  if (mySubProjectIds.length > 0) {
    const { data: gcProjects } = await db
      .from('projects')
      .select('gc_company_id')
      .in('id', mySubProjectIds)
    gcCompanyIds = (gcProjects ?? []).map((p: any) => p.gc_company_id).filter(Boolean)
  }

  // All companies I've added myself (added_by_company_id column, if exists)
  const { data: addedCompanies } = await db
    .from('companies')
    .select('id')
    .eq('added_by_company_id', myCompanyId)
  const addedIds = (addedCompanies ?? []).map((c: any) => c.id)

  const visibleIds = Array.from(new Set([
    myCompanyId,
    ...subCompanyIds,
    ...gcCompanyIds,
    ...addedIds,
  ]))

  const { data: companies } = await db
    .from('companies')
    .select('*')
    .in('id', visibleIds)
    .order('name')

  // Check which companies have at least one profile (i.e. a real account), and
  // which already have an invite out. The second is what lets the Directory
  // say "Invited" after a reload - it used to live in page state only, so the
  // "Invite N contacts" count went back to counting people already asked.
  //
  // WHICH ONES CAME OUT OF A PHONE BOOK, so the Directory can be filtered down
  // to them. DERIVED, not stored: the import already writes
  // `google_contact_imports.company_record_id` pointing at the row it created,
  // so the fact is on disk and a second column on `companies` would be one
  // more thing to keep in step. Rides the same Promise.all - this list is
  // fetched on every visit to the page.
  const [{ data: profiles }, { data: invites }, { data: importedRows }] = await Promise.all([
    db.from('profiles').select('company_id').in('company_id', visibleIds),
    db.from('company_invites').select('company_id').in('company_id', visibleIds).eq('status', 'pending'),
    db.from('google_contact_imports')
      .select('company_record_id')
      .in('company_record_id', visibleIds)
      .eq('status', 'imported'),
  ])

  const companiesWithAccount = new Set((profiles ?? []).map(p => p.company_id))
  const companiesInvited = new Set((invites ?? []).map((i: any) => i.company_id))
  const companiesImported = new Set(
    (importedRows ?? []).map((r: any) => r.company_record_id).filter(Boolean),
  )

  const companiesResult = (companies ?? []).map(c => ({
    ...c,
    imported: companiesImported.has(c.id),
    has_account: companiesWithAccount.has(c.id),
    invite_pending: !companiesWithAccount.has(c.id) && companiesInvited.has(c.id),
  }))

  // `contacts` IS NOT A TABLE THIS APP WRITES TO. It holds zero rows: the
  // Directory's Add Contact, the inspector picker's Quick add and the permits
  // page's "save this inspector" all POST here, and this route inserts into
  // `companies`. The read used to sit here returning `[]` for ever, and two
  // callers merged that empty array into their lists as though it meant
  // something. Removed rather than left as a fallback nobody can distinguish
  // from "there are no contacts".
  if (level === 'share') {
    const slim = companiesResult.map((c: Record<string, unknown>) =>
      Object.fromEntries(DIRECTORY_SHARE_FIELDS.map(k => [k, c[k] ?? null])))
    return NextResponse.json({ companies: slim, contacts: [] })
  }
  return NextResponse.json({ companies: companiesResult, contacts: [] })
}

// QUICK ADD. Asked at `view`, deliberately: a Project Manager, Office Staff and
// a Field Supervisor all hold `directory: view` only and add contacts from the
// inspector and permit pickers today - `create` would take that away from
// every one of them. So: view, the billing lock by hand (a write gated at view
// does not get it from the gate), and the new row is tagged with the ACTOR's
// company, never one from the body.
export async function POST(request: Request) {
  const actor = await actorOf(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actorCan(actor, 'directory', 'view')) return forbidden()
  const myCompanyId = actor.companyId
  if (!myCompanyId) return NextResponse.json({ error: 'No company on this account.' }, { status: 409 })
  const locked = await billingLock(admin(), myCompanyId)
  if (locked) return locked

  const body = await request.json()
  // Everything after reading the body is `createDirectoryContact`, which
  // Claude's MCP server calls too.
  const result = await createDirectoryContact(admin(), { myCompanyId, body })
  return NextResponse.json(result.body, { status: result.status })
}
