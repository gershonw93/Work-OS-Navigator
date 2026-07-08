import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of ['cost_code', 'category', 'description', 'notes', 'subcontract_id']) {
    if (key in body) updates[key] = body[key] || null
  }
  for (const key of ['budgeted_amount', 'committed_amount', 'actual_amount', 'sort_order']) {
    if (key in body) updates[key] = Number(body[key]) || 0
  }
  if ('space_type' in body) updates.space_type = body.space_type === 'interior' || body.space_type === 'exterior' ? body.space_type : null

  let { data, error } = await db
    .from('budget_line_items')
    .update(updates)
    .eq('id', params.lineId)
    .eq('project_id', params.id)
    .select()
    .single()

  // Pre-migration fallback: space_type column may not exist yet.
  if (error && (error as any).code === '42703' && 'space_type' in updates) {
    const { space_type: _omit, ...withoutSpaceType } = updates
    const retry = await db
      .from('budget_line_items')
      .update(withoutSpaceType)
      .eq('id', params.lineId)
      .eq('project_id', params.id)
      .select()
      .single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: line } = await db.from('budget_line_items').select('description').eq('id', params.lineId).single()

  const { error } = await db
    .from('budget_line_items')
    .delete()
    .eq('id', params.lineId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'budget_line_removed',
    `Budget line removed: ${line?.description || 'line item'}`, { line_id: params.lineId }, user.id)

  return NextResponse.json({ ok: true })
}
