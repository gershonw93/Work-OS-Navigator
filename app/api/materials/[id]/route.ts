import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function userId(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user?.id ?? null
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!(await userId(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const k of ['project_id', 'store_name', 'category', 'notes', 'purchase_date', 'budget_line_id']) {
    if (body[k] !== undefined) updates[k] = body[k] || null
  }
  if (body.amount !== undefined) updates.amount = Number(body.amount) || 0
  if (body.tax !== undefined) updates.tax = body.tax === '' || body.tax == null ? null : Number(body.tax)

  const { data, error } = await db.from('material_purchases').update(updates).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ material: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  if (!(await userId(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await admin().from('material_purchases').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
