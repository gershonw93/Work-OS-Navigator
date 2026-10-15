import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { filesAccess } from '@/lib/files-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { packetId: string } }) {
  const db = admin()
  const access = await filesAccess(db, request, { write: true })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

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
  const db = admin()
  const access = await filesAccess(db, request, { write: true })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

  const { error } = await db
    .from('file_packets')
    .delete()
    .eq('id', params.packetId)
    .eq('company_id', company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
