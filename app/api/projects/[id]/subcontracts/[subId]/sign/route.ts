import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function POST(
  request: Request,
  { params }: { params: { id: string; subId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const {
    data: { user },
  } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { signer_type, signer_name, signature_data_url } = body as {
    signer_type: 'gc' | 'sub'
    signer_name: string
    signature_data_url: string
  }

  if (!signer_type || !signer_name || !signature_data_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (signer_type !== 'gc' && signer_type !== 'sub') {
    return NextResponse.json({ error: 'signer_type must be gc or sub' }, { status: 400 })
  }

  // Decode base64 data URL → buffer
  const base64Data = signature_data_url.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  const timestamp = Date.now()
  const storagePath = `${params.id}/${params.subId}/${signer_type}-${timestamp}.png`

  const { error: uploadError } = await db.storage
    .from('signatures')
    .upload(storagePath, buffer, {
      contentType: 'image/png',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: signedUrlData } = await db.storage
    .from('signatures')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year signed URL

  const signatureUrl = signedUrlData?.signedUrl ?? storagePath

  // Fetch existing subcontract to check if other side is already signed
  const { data: existing, error: fetchError } = await db
    .from('subcontracts')
    .select('gc_signed_at, sub_signed_at')
    .eq('id', params.subId)
    .eq('project_id', params.id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const now = new Date().toISOString()

  const updates: Record<string, unknown> =
    signer_type === 'gc'
      ? {
          gc_signed_at: now,
          gc_signed_by: signer_name,
          gc_signature_url: signatureUrl,
        }
      : {
          sub_signed_at: now,
          sub_signed_by: signer_name,
          sub_signature_url: signatureUrl,
        }

  const gcSigned = signer_type === 'gc' ? true : !!existing?.gc_signed_at
  const subSigned = signer_type === 'sub' ? true : !!existing?.sub_signed_at
  if (gcSigned && subSigned) {
    updates.fully_executed_at = now
  }

  const { data, error } = await db
    .from('subcontracts')
    .update(updates)
    .eq('id', params.subId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subcontract: data })
}
