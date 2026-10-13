import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_FIELDS = ['scope', 'trade', 'description', 'due_date'] as const

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; packageId: string } },
) {
  // The old Bids tab (folded into Request Quotes by 081). It answered any
  // login; it now asks `bids` and that the caller's company owns the job.
  const gate = await requirePermission(admin(), request, 'bids', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(admin(), gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: pkg, error } = await db
    .from('bid_packages')
    .update(updates)
    .eq('id', params.packageId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: pkg })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; packageId: string } },
) {
  // The old Bids tab (folded into Request Quotes by 081). It answered any
  // login; it now asks `bids` and that the caller's company owns the job.
  const gate = await requirePermission(admin(), request, 'bids', 'delete')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(admin(), gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('bid_packages')
    .delete()
    .eq('id', params.packageId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
