import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function POST(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const waiver_type = formData.get('waiver_type') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (waiver_type !== 'conditional' && waiver_type !== 'unconditional') {
    return NextResponse.json({ error: 'waiver_type must be conditional or unconditional' }, { status: 400 })
  }

  // Verify invoice exists and belongs to this project
  const { data: invoice, error: fetchError } = await db
    .from('invoices')
    .select('id, invoice_number')
    .eq('id', params.invoiceId)
    .single()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Build safe storage path
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${params.id}/${params.invoiceId}/${timestamp}-${safeName}`

  // Upload to Supabase storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await db.storage
    .from('lien-waivers')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Get 10-year signed URL (315360000 seconds)
  const { data: signedData, error: signError } = await db.storage
    .from('lien-waivers')
    .createSignedUrl(storagePath, 315360000)

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  // Update invoice row
  const { data: updatedInvoice, error: updateError } = await db
    .from('invoices')
    .update({
      lien_waiver_url: signedData.signedUrl,
      lien_waiver_type: waiver_type,
      lien_waiver_uploaded_at: new Date().toISOString(),
    })
    .eq('id', params.invoiceId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ invoice: updatedInvoice })
}
