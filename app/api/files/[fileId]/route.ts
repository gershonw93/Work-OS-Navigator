import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { filesAccess } from '@/lib/files-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { fileId: string } }) {
  const db = admin()
  const access = await filesAccess(db, request, { write: true })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, any> = {}
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
  if (typeof body.category === 'string' && body.category) updates.category = body.category
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data: file, error } = await db
    .from('company_files')
    .update(updates)
    .eq('id', params.fileId)
    .eq('company_id', company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ file })
}

export async function DELETE(request: Request, { params }: { params: { fileId: string } }) {
  const db = admin()
  const access = await filesAccess(db, request, { write: true })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

  const { error } = await db
    .from('company_files')
    .delete()
    .eq('id', params.fileId)
    .eq('company_id', company_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remove the file id from any packets that reference it
  const { data: packets } = await db
    .from('file_packets')
    .select('id, file_ids')
    .eq('company_id', company_id)

  for (const packet of packets ?? []) {
    const ids: string[] = Array.isArray(packet.file_ids) ? packet.file_ids : []
    if (ids.includes(params.fileId)) {
      await db
        .from('file_packets')
        .update({ file_ids: ids.filter(id => id !== params.fileId) })
        .eq('id', packet.id)
    }
  }

  return NextResponse.json({ success: true })
}
