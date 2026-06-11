import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const { data: inspections, error } = await db
    .from('inspections')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspections: inspections ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const inspection_type = formData.get('inspection_type') as string
  const trade = formData.get('trade') as string | null
  const status = formData.get('status') as string | null
  const scheduled_date = formData.get('scheduled_date') as string | null
  const inspector_name = formData.get('inspector_name') as string | null
  const inspector_phone = formData.get('inspector_phone') as string | null
  const scheduling_phone = formData.get('scheduling_phone') as string | null
  const notes = formData.get('notes') as string | null
  const file = formData.get('file') as File | null

  let card_image_url: string | null = null

  if (file && file.size > 0) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await db.storage
      .from('inspections')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (!uploadError) {
      const { data: signed } = await db.storage
        .from('inspections')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      card_image_url = signed?.signedUrl ?? null
    }
  }

  const { data: inspection, error } = await db
    .from('inspections')
    .insert({
      project_id: params.id,
      inspection_type: inspection_type ?? null,
      trade: trade || null,
      status: status ?? 'not_scheduled',
      scheduled_date: scheduled_date || null,
      inspector_name: inspector_name || null,
      inspector_phone: inspector_phone || null,
      scheduling_phone: scheduling_phone || null,
      notes: notes || null,
      card_image_url,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspection }, { status: 201 })
}
