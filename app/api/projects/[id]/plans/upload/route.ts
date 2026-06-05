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

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string
  const planType = formData.get('plan_type') as string
  const folderId = formData.get('folder_id') as string | null

  if (!file || !name || !planType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!PLAN_TYPES.includes(planType as typeof PLAN_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 })
  }

  // Build storage path: project_id/folder_id/filename or project_id/filename
  const ext = file.name.split('.').pop()
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = folderId
    ? `${params.id}/${folderId}/${timestamp}-${safeName}`
    : `${params.id}/${timestamp}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await admin.storage
    .from('plans')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
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
