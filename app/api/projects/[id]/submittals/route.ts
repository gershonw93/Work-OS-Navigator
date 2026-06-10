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

  const { data: submittals, error } = await db
    .from('submittals')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submittals: submittals ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, company_id')
    .eq('id', user.id)
    .single()

  const formData = await request.formData()
  const title = formData.get('title') as string
  const type = formData.get('type') as string
  const trade = formData.get('trade') as string | null
  const spec_section = formData.get('spec_section') as string | null
  const manufacturer = formData.get('manufacturer') as string | null
  const model_number = formData.get('model_number') as string | null
  const notes = formData.get('notes') as string | null
  const file = formData.get('file') as File | null

  if (!title || !type) {
    return NextResponse.json({ error: 'Title and type are required' }, { status: 400 })
  }

  let file_url: string | null = null

  if (file && file.size > 0) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await db.storage
      .from('submittals')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    const { data: signed } = await db.storage
      .from('submittals')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

    file_url = signed?.signedUrl ?? null
  }

  const { data: submittal, error } = await db
    .from('submittals')
    .insert({
      project_id: params.id,
      title,
      type,
      trade: trade || null,
      spec_section: spec_section || null,
      manufacturer: manufacturer || null,
      model_number: model_number || null,
      status: 'pending',
      notes: notes || null,
      file_url,
      submitted_by_company_id: (profile as any)?.company_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'submittal_added',
    `Submittal added: ${title} (${type})`,
    { submittal_id: submittal.id, title, type, trade },
  )

  return NextResponse.json({ submittal }, { status: 201 })
}
