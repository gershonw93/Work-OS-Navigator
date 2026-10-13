import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { complianceAccess, fileComplianceDocument } from '@/lib/writes/compliance-document'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const db = admin()
  // The GC sees every vendor on its job; a sub on the job sees its OWN
  // company's paperwork and nobody else's (My Jobs -> Compliance).
  const access = await complianceAccess(db, request, params.id, { write: false })
  if ('denied' in access) return access.denied

  let subQuery = db
    .from('subcontracts')
    .select('*, companies(id, name, type, contact_email)')
    .eq('project_id', params.id)
  if (access.scope === 'own-company') subQuery = subQuery.eq('company_id', access.companyId)
  const { data: subcontracts, error: subError } = await subQuery

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })

  // Deduplicate by company - one compliance card per company, not per subcontract
  const seen = new Set<string>()
  const subs = (subcontracts ?? []).filter((s: any) => {
    const cid = s.companies?.id
    if (!cid || seen.has(cid)) return false
    seen.add(cid)
    return true
  })
  const companyIds = subs.map((s: any) => s.companies?.id).filter(Boolean)

  let docs: any[] = []
  if (companyIds.length > 0) {
    const { data, error: docsError } = await db
      .from('compliance_documents')
      .select('*')
      .in('company_id', companyIds)
      .or(`project_id.eq.${params.id},project_id.is.null`)

    if (docsError) return NextResponse.json({ error: docsError.message }, { status: 500 })
    docs = data ?? []
  }

  // Pending document requests (one-time links awaiting upload)
  let requests: any[] = []
  if (companyIds.length > 0) {
    const { data: reqs } = await db
      .from('compliance_requests')
      .select('id, company_id, token, doc_types, status, created_at, submitted_at')
      .eq('project_id', params.id)
      .in('company_id', companyIds)
      .order('created_at', { ascending: false })
    requests = reqs ?? []
  }

  // Per-vendor decisions about what they actually owe. Company-wide rows and
  // rows for this job; the resolver picks which one wins.
  let requirements: any[] = []
  if (companyIds.length > 0) {
    const { data: reqs } = await db
      .from('compliance_requirements')
      .select('company_id, project_id, type, required, note')
      .in('company_id', companyIds)
      .or(`project_id.eq.${params.id},project_id.is.null`)
    requirements = reqs ?? []
  }

  return NextResponse.json({ subcontracts: subs, docs, requests, requirements })
}

/**
 * Mark a document as required or not for one vendor.
 *
 * Company-wide by default - "this sub has no employees" is a fact about the
 * sub, not about one job. Pass scope:'project' when a particular job insists on
 * something the vendor is otherwise excused from.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // What a vendor owes is the GC's decision, never the vendor's.
  const access = await complianceAccess(db, request, params.id, { write: true })
  if ('denied' in access) return access.denied
  if (access.scope !== 'owner') {
    return NextResponse.json({ error: 'Only the contractor running this job decides what a vendor owes.' }, { status: 403 })
  }
  const user = { id: access.actor.userId }

  const body = await request.json().catch(() => ({}))
  const { company_id, type, required, note, scope } = body
  if (!company_id || !type) {
    return NextResponse.json({ error: 'company_id and type are required' }, { status: 400 })
  }

  // Only vendors actually on this job, so a project id in the URL cannot be
  // used to edit requirements for a company that has nothing to do with it.
  const { data: onJob } = await db.from('subcontracts')
    .select('id').eq('project_id', params.id).eq('company_id', company_id).limit(1)
  if (!onJob?.length) {
    return NextResponse.json({ error: 'That vendor is not on this project' }, { status: 403 })
  }

  const project_id = scope === 'project' ? params.id : null
  const row = {
    company_id, project_id, type,
    required: required !== false,
    note: note || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  // The unique indexes are partial (one for project_id IS NULL, one for NOT
  // NULL), so onConflict cannot name a single constraint covering both scopes.
  // Look the row up and decide.
  const base = db.from('compliance_requirements').select('id')
    .eq('company_id', company_id).eq('type', type)
  const { data: match } = project_id === null
    ? await base.is('project_id', null).maybeSingle()
    : await base.eq('project_id', project_id).maybeSingle()

  let error
  if (match) {
    ({ error } = await db.from('compliance_requirements').update(row).eq('id', (match as any).id))
  } else {
    ({ error } = await db.from('compliance_requirements').insert(row))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const db = admin()
  const access = await complianceAccess(db, request, params.id, { write: true })
  if ('denied' in access) return access.denied

  const body = await request.json().catch(() => ({}))

  // A sub files for its OWN company, and does not approve its own paperwork -
  // the contractor does. Refused out loud rather than quietly downgraded: a
  // field the route drops answers exactly like one it saved.
  if (access.scope === 'own-company') {
    if (body?.company_id !== access.companyId) {
      return NextResponse.json({ error: 'You can only file documents for your own company.' }, { status: 403 })
    }
    if (body?.status === 'approved') {
      return NextResponse.json({ error: 'The contractor approves documents. Save it as Pending and they will review it.' }, { status: 400 })
    }
  }

  const result = await fileComplianceDocument(db, { userId: access.actor.userId, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}
