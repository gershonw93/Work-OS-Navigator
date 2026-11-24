import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { vendorCompanyIds, holdsSubcontract } from '@/lib/sub-companies'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function POST(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  // A sub uploads the waiver for THEIR OWN bill from My Jobs, so this opts in
  // to the sub side (`subOwnRecord`) and then checks the record below: on a job
  // the caller does not own, the bill has to be their company's.
  const gate = await requirePermission(admin(), request, 'invoices', 'edit', { subOwnRecord: true })
  if (denied(gate)) return gate.denied

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

  // Verify invoice exists and belongs to this project. The comment always
  // said so and the query never asked: any bill id on the platform was
  // accepted, under whatever job the URL named.
  const { data: invoice, error: fetchError } = await db
    .from('invoices')
    .select('id, invoice_number, company_id, subcontracts ( company_id )')
    .eq('id', params.invoiceId)
    .eq('project_id', params.id)
    .maybeSingle()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // ...and on somebody else's job, it is the caller's OWN bill. The company is
  // read off the subcontract the bill is against - the record of who holds
  // the work - and only then off the bill itself.
  if (gate.side !== 'gc') {
    const holder = (invoice as any).subcontracts?.company_id ?? (invoice as any).company_id ?? null
    if (!holdsSubcontract(await vendorCompanyIds(db, gate.actor.companyId), holder)) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
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
