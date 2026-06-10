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

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: packets, error } = await db
    .from('file_packets')
    .select('*')
    .eq('company_id', company_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packets: packets ?? [] })
}

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const company_id = await getCompanyId(db, token)
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
