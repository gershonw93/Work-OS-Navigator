import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Re-tag a photo after upload (sub / category / caption) or delete it.
export async function PATCH(request: Request, { params }: { params: { id: string; logId: string; photoId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, any> = {}
  if ('subcontract_id' in body) updates.subcontract_id = body.subcontract_id || null
  if ('category' in body) updates.category = body.category || null
  if ('caption' in body) updates.caption = body.caption || null

  const { data, error } = await db
    .from('daily_log_photos')
    .update(updates)
    .eq('id', params.photoId)
    .eq('daily_log_id', params.logId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photo: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; logId: string; photoId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('daily_log_photos').delete().eq('id', params.photoId).eq('daily_log_id', params.logId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
