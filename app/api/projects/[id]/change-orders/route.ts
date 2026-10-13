import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createChangeOrder } from '@/lib/writes/change-order'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

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
  // A change order is the GC's contract with its client and its subs; a sub's
  // admin holds `change-orders: edit` at their own company.
  const owned = await ownedProject(admin(), gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // Everything after the gate is `createChangeOrder`, which Claude's MCP server calls too.
  const result = await createChangeOrder(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}
