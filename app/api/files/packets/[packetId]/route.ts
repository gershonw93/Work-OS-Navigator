import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getCompanyId(db: ReturnType<typeof admin>, token: string) {
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  return (profile as any)?.company_id ?? null
}

export async function PATCH(request: Request, { params }: { params: { packetId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.description === 'string') updates.description = body.description || null
  if (Array.isArray(body.file_ids)) updates.file_ids = body.file_ids
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data: packet, error } = await db
    .from('file_packets')
    .update(updates)
    .eq('id', params.packetId)
    .eq('company_id', company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet })
}

export async function DELETE(request: Request, { params }: { params: { packetId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('file_packets')
    .delete()
    .eq('id', params.packetId)
    .eq('company_id', company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
