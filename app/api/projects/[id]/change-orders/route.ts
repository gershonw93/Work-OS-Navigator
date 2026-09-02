import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'change-orders', 'view')
  if (denied(viewGate)) return viewGate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: changeOrders, error } = await db
    .from('change_orders')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changeOrders: changeOrders ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'change-orders', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  const {
    title,
    description,
    amount,
    reason,
    requested_by_type,
    subcontract_id,
    budget_line_item_id,
  } = body

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  // THE BUDGET LINE THIS RAISES.
  //
  // The column has existed since migration 069 and `approvedChangesByLine`
  // reads it, but this route never accepted it - so every change order raised
  // from the Change Orders screen was an unmapped owner-side one, and
  // `scheduleOfValues` gave it a catch-all "Approved change orders" row rather
  // than raising the line it belongs to. A GC told "this line is $12,000 over
  // its scheduled value, raise a change order" could raise one, approve it, and
  // find the line exactly as over as before.
  //
  // Same rule the selections overage flow already follows: an overage that
  // floats free of its line is money the budget cannot see.
  //
  // Verified against THIS project, not trusted: an id from another job would
  // move money onto a budget nobody is looking at.
  let budgetLineId: string | null = null
  if (budget_line_item_id) {
    const { data: line } = await db
      .from('budget_line_items')
      .select('id')
      .eq('id', budget_line_item_id)
      .eq('project_id', params.id)
      .maybeSingle()
    if (!line) {
      return NextResponse.json({ error: 'That budget line is not on this project.' }, { status: 400 })
    }
    budgetLineId = budget_line_item_id
  }

  const row: Record<string, unknown> = {
    project_id: params.id,
    title,
    description: description || null,
    amount: amount ?? 0,
    reason: reason || null,
    requested_by_type: requested_by_type ?? 'gc',
    subcontract_id: subcontract_id || null,
    status: 'pending',
    budget_line_item_id: budgetLineId,
  }

  let { data: changeOrder, error } = await db.from('change_orders').insert(row).select().single()

  // Pre-migration fallback: the link column may not exist yet. Same shape as
  // the selections route, which hit this first.
  if (error && (error as any).code === '42703' && 'budget_line_item_id' in row) {
    const { budget_line_item_id: _b, ...noLink } = row
    const retry = await db.from('change_orders').insert(noLink).select().single()
    changeOrder = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'change_order_created',
    `Change order created: ${title}`,
    { change_order_id: changeOrder.id, title, amount, requested_by_type },
  )

  return NextResponse.json({ changeOrder }, { status: 201 })
}
