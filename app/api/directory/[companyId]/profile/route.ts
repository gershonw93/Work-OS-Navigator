import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { ownedProjectsFilter } from '@/lib/project-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// A Directory card's profile: what this company does for US. It checked only
// "signed in" and read by company id alone, so any account could fetch any
// company's subcontracts, bills, payment schedule and insurance documents
// across every GC it works for. Now: `directory: view`, a company this one has
// a relationship with (the same set the Directory list shows), and only the
// rows on jobs the viewer's company is on.
export async function GET(request: Request, { params }: { params: { companyId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'directory', 'view')
  if (denied(gate)) return gate.denied
  const mine = gate.actor.companyId
  if (!mine) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { companyId } = params

  // The jobs the viewer's company is on: ones it owns, and ones it is subbed to.
  const [{ data: owned }, { data: subbed }] = await Promise.all([
    db.from('projects').select('id, gc_company_id').or(ownedProjectsFilter(mine)),
    db.from('subcontracts').select('project_id, projects(gc_company_id)').eq('company_id', mine),
  ])
  const ownedIds = (owned ?? []).map((p: any) => p.id as string)
  const myJobs = Array.from(new Set([...ownedIds, ...(subbed ?? []).map((s: any) => s.project_id as string).filter(Boolean)]))

  const { data: company } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Is this company one the viewer's Directory shows? Own company, one it
  // added, a sub on one of its jobs, or the GC on a job it is subbed to.
  const gcOfMine = (subbed ?? []).some((s: any) => s.projects?.gc_company_id === companyId)
  let related = companyId === mine || (company as any).added_by_company_id === mine || gcOfMine
  if (!related && ownedIds.length) {
    const { count } = await db.from('subcontracts').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).in('project_id', ownedIds)
    related = (count ?? 0) > 0
  }
  // Same words as a company that does not exist: the answer leaks nothing.
  if (!related) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const onMyJobs = myJobs.length ? myJobs : ['00000000-0000-0000-0000-000000000000']

  const [{ data: subcontracts }, { data: complianceDocs }, { data: invoices }] = await Promise.all([
    db.from('subcontracts')
      .select('id, scope, trade, contract_amount, status, projects(id, name, status)')
      .eq('company_id', companyId)
      .in('project_id', onMyJobs)
      .order('created_at', { ascending: false }),
    // A company-wide document (no job) is theirs to show the GCs they work
    // for; a job's document only to whoever is on that job.
    db.from('compliance_documents')
      .select('*')
      .eq('company_id', companyId)
      .or(`project_id.is.null,project_id.in.(${onMyJobs.join(',')})`)
      .order('type'),
    db.from('invoices')
      .select('id, invoice_number, amount, status, due_date, issued_date, description, project_id, projects(name)')
      .eq('company_id', companyId)
      .in('project_id', onMyJobs)
      .order('issued_date', { ascending: false })
      .limit(20),
  ])

  const subIds = (subcontracts ?? []).map((s: any) => s.id)
  let payments: any[] = []
  if (subIds.length > 0) {
    const { data: psi } = await db
      .from('payment_schedule_items')
      .select('*, subcontracts(scope, projects(name))')
      .in('subcontract_id', subIds)
      .order('order_index')
    payments = psi ?? []
  }

  return NextResponse.json({
    company,
    subcontracts: subcontracts ?? [],
    complianceDocs: complianceDocs ?? [],
    invoices: invoices ?? [],
    payments,
  })
}
