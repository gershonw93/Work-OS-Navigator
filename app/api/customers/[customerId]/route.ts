import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { pushCustomer } from '@/lib/quickbooks-push'
import { requirePermission, denied } from '@/lib/api-guard'
import { updateCustomer } from '@/lib/writes/customer'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// THESE THREE ASKED ONLY "ARE YOU SIGNED IN", so a role denied Customers could
// read, rewrite or DELETE a client card by its id. Each now takes the
// `customers` permission for what it does: view, edit, and delete - the last
// is admin and manager only, and nothing in the app offers it to anybody else
// (no screen calls this DELETE today). Every query stays scoped to the
// caller's own company, as it always was.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const gate = await requirePermission(admin(), request, 'customers', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params

  const { data: customer, error } = await admin()
    .from('customers')
    .select('*, projects(id, name, status, address, start_date, type, parent_project_id, is_site)')
    .eq('id', customerId)
    .eq('gc_company_id', companyId)
    .single()

  if (error || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // A site stands in for the jobs underneath it, same as the projects list -
  // otherwise a 40-unit building buries everything else this customer has.
  const all = ((customer as any).projects ?? []) as any[]
  const grouped = all.some(p => p.parent_project_id)
  if (grouped) {
    const counts: Record<string, number> = {}
    for (const p of all) if (p.parent_project_id) counts[p.parent_project_id] = (counts[p.parent_project_id] ?? 0) + 1
    ;(customer as any).projects = all
      .filter(p => !p.parent_project_id)
      .map(p => ({ ...p, child_count: counts[p.id] ?? 0 }))
  }

  return NextResponse.json({ customer })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const gate = await requirePermission(admin(), request, 'customers', 'edit')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params
  const body = await request.json()

  const result = await updateCustomer(admin(), { companyId, customerId, body })
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status })

  // Same as the collection route: a correction here reaches the books.
  await pushCustomer(admin(), customerId)

  return NextResponse.json(result.body)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const gate = await requirePermission(admin(), request, 'customers', 'delete')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params

  const { error } = await admin()
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('gc_company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
