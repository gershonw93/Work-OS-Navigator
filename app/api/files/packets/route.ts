import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { filesAccess } from '@/lib/files-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const db = admin()
  const access = await filesAccess(db, request, { write: false })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

  const { data: packets, error } = await db
    .from('file_packets')
    .select('*')
    .eq('company_id', company_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packets: packets ?? [] })
}

export async function POST(request: Request) {
  const db = admin()
  const access = await filesAccess(db, request, { write: true })
  if ('denied' in access) return access.denied
  const company_id = access.companyId

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Packet name is required' }, { status: 400 })

  const { data: packet, error } = await db
    .from('file_packets')
    .insert({
      company_id,
      name,
      description: body.description || null,
      file_ids: Array.isArray(body.file_ids) ? body.file_ids : [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet }, { status: 201 })
}
