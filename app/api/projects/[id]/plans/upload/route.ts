import { logActivity } from '@/lib/log-activity'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const PLAN_TYPES = ['architectural', 'structural', 'mep', 'civil', 'landscape', 'other'] as const

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Two ways in.
  //
  // JSON { storage_path } - the browser has ALREADY put the bytes in storage
  // through a signed URL, and this call only records it. That is the path the
  // Plans tab uses now, because posting a drawing through here means a ~4.5MB
  // body cap the platform enforces before any of this runs.
  //
  // multipart - the old path, still accepted so nothing that already calls it
  // breaks. Fine for a small file; it is the one with the ceiling.
  const contentType = request.headers.get('content-type') ?? ''
  let name: string, planType: string, folderId: string | null, storagePath: string
  let file: File | null = null

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({} as any))
    name = String(body?.name ?? '')
    planType = String(body?.plan_type ?? '')
    folderId = body?.folder_id ? String(body.folder_id) : null
    storagePath = String(body?.storage_path ?? '')
    if (!name || !planType || !storagePath) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // The signed URL was issued for this project's prefix; refuse anything
    // claiming a path outside it rather than trusting the client's word.
    if (!storagePath.startsWith(`${params.id}/`)) {
      return NextResponse.json({ error: 'That file does not belong to this project.' }, { status: 400 })
    }
    if (!PLAN_TYPES.includes(planType as typeof PLAN_TYPES[number])) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 })
    }
  } else {
    const formData = await request.formData()
    file = formData.get('file') as File | null
    name = formData.get('name') as string
    planType = formData.get('plan_type') as string
    folderId = formData.get('folder_id') as string | null

    if (!file || !name || !planType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!PLAN_TYPES.includes(planType as typeof PLAN_TYPES[number])) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 })
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    storagePath = folderId
      ? `${params.id}/${folderId}/${timestamp}-${safeName}`
      : `${params.id}/${timestamp}-${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from('plans')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
  }

  // Get a long-lived signed URL (10 years)
  const { data: signedUrlData } = await admin.storage
    .from('plans')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  const { data: plan, error: dbError } = await admin
    .from('project_plans')
    .insert({
      project_id: params.id,
      folder_id: folderId || null,
      name,
      plan_type: planType,
      file_url: signedUrlData?.signedUrl ?? '',
      storage_path: storagePath,
    })
    .select()
    .single()

  if (dbError) {
    // Clean up uploaded file if DB insert fails
    await admin.storage.from('plans').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Log activity
  const { data: uploader } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  const actorName = (uploader as any)?.full_name ?? 'Someone'
  await logActivity(admin, params.id, actorName, 'plan_uploaded',
    `Uploaded plan "${name}" (${planType})`,
    { plan_id: plan?.id, name, plan_type: planType }
  )

  return NextResponse.json({ plan })
}
