import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST: trigger invoice generation based on billing type
// - percent: generate invoice for (new_percent - last_billed_percent) * contract_amount
// - task: generate invoice for completed tasks not yet invoiced
// - weekly: generate invoice for this week's work (called automatically on load if >7 days since last)
export async function POST(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { billing_type, progress_percent, task_ids, week_start } = await request.json()

  const { data: sub } = await db
    .from('subcontracts')
    .select('*, companies(name)')
    .eq('id', params.subId)
    .eq('project_id', params.id)
    .single()

  if (!sub) return NextResponse.json({ error: 'Subcontract not found' }, { status: 404 })

  // Count existing invoices for numbering
  const { count } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const invoiceNumber = `INV-${params.id.slice(0, 4).toUpperCase()}-${String((count ?? 0) + 1).padStart(3, '0')}`

  let amount = 0
  let description = ''

  if (billing_type === 'percent') {
    // Calculate amount for percentage progress since last invoice
    const { data: lastInvoice } = await db
      .from('invoices')
      .select('amount')
      .eq('subcontract_id', params.subId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const totalPreviouslyBilled = (lastInvoice as any)?.amount ?? 0
    const previousPercent = sub.contract_amount > 0
      ? (totalPreviouslyBilled / sub.contract_amount) * 100
      : 0
    const newPercent = Math.min(progress_percent ?? 0, 100)
    const deltaPercent = Math.max(0, newPercent - previousPercent)
    amount = Math.round((deltaPercent / 100) * sub.contract_amount * 100) / 100
    description = `Progress billing: ${previousPercent.toFixed(0)}% → ${newPercent.toFixed(0)}% complete`

    if (amount <= 0) return NextResponse.json({ error: 'No new billable progress since last invoice' }, { status: 400 })

  } else if (billing_type === 'task') {
    // Sum up amounts for specified completed tasks
    if (!task_ids || task_ids.length === 0) return NextResponse.json({ error: 'No tasks selected' }, { status: 400 })
    const { data: tasks } = await db
      .from('project_tasks')
      .select('title, billing_amount')
      .in('id', task_ids)
      .eq('status', 'completed')

    const taskList = tasks ?? []
    amount = taskList.reduce((sum: number, t: any) => sum + Number(t.billing_amount ?? 0), 0)
    description = `Task completion billing: ${taskList.map((t: any) => t.title).join(', ')}`

    if (amount <= 0) return NextResponse.json({ error: 'Selected tasks have no billing amounts set' }, { status: 400 })

  } else if (billing_type === 'weekly') {
    amount = Number(sub.weekly_amount ?? 0)
    if (amount <= 0) return NextResponse.json({ error: 'No weekly amount configured on this subcontract' }, { status: 400 })
    const weekLabel = week_start
      ? new Date(week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    description = `Weekly billing — week of ${weekLabel}`
  } else {
    return NextResponse.json({ error: 'Invalid billing_type' }, { status: 400 })
  }

  const { data: invoice, error: invError } = await db
    .from('invoices')
    .insert({
      project_id: params.id,
      subcontract_id: params.subId,
      company_id: sub.company_id,
      company_name: (sub.companies as any)?.name ?? null,
      amount,
      description,
      invoice_number: invoiceNumber,
      status: 'pending_approval',
    })
    .select()
    .single()

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })

  // Notify GC
  const { data: gcProfiles } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', sub.company_id)
    .limit(1)

  return NextResponse.json({ invoice })
}
