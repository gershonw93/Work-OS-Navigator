import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: permits, error } = await db
    .from('permits')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permits: permits ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const formData = await request.formData()
  const permit_type = formData.get('permit_type') as string
  const permit_number = formData.get('permit_number') as string | null
  const description = formData.get('description') as string | null
  const status = formData.get('status') as string | null
  const issued_date = formData.get('issued_date') as string | null
  const expiry_date = formData.get('expiry_date') as string | null
  const issuing_authority = formData.get('issuing_authority') as string | null
  const inspector_name = formData.get('inspector_name') as string | null
  const inspector_phone = formData.get('inspector_phone') as string | null
  const notes = formData.get('notes') as string | null
  const file = formData.get('file') as File | null

  let file_url: string | null = null

  if (file && file.size > 0) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await db.storage
      .from('permits')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: signed } = await db.storage
      .from('permits')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

    file_url = signed?.signedUrl ?? null
  }

  const { data: permit, error } = await db
    .from('permits')
    .insert({
      project_id: params.id,
      permit_type,
      permit_number: permit_number || null,
      description: description || null,
      status: status || 'pending',
      issued_date: issued_date || null,
      expiry_date: expiry_date || null,
      issuing_authority: issuing_authority || null,
      inspector_name: inspector_name || null,
      inspector_phone: inspector_phone || null,
      notes: notes || null,
      file_url,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  const activityMessage = `Permit added: ${permit_type}${permit_number ? ' #' + permit_number : ''}`
  await logActivity(
    db,
    params.id,
    actorName,
    'permit_added',
    activityMessage,
    { permit_id: permit.id, permit_type, permit_number },
  )

  return NextResponse.json({ permit }, { status: 201 })
}
