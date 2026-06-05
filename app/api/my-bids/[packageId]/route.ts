import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { packageId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  // Fetch full package with project info and attachments
  const { data: pkg } = await db
    .from('bid_packages')
    .select(`
      id, scope, description, trade, due_date, status, requirements, specifications,
      projects ( id, name, address, type, start_date ),
      bid_package_attachments (
        id,
        project_plans ( id, name, plan_type, file_url )
      )
    `)
    .eq('id', params.packageId)
    .single()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })

  // Verify this company was invited
  const { data: invitation } = await db
    .from('bid_invitations')
    .select('id, status')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

  if (!invitation) return NextResponse.json({ error: 'Not invited to this package' }, { status: 403 })

  // Get existing bid if any
  const { data: myBid } = await db
    .from('bids')
    .select('*')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

  // Get compliance documents for this company
  const { data: compliance } = await db
    .from('compliance_documents')
    .select('type, status, expiry_date')
    .eq('company_id', profile.company_id)

  return NextResponse.json({ pkg, invitation, myBid: myBid ?? null, compliance: compliance ?? [] })
}

export async function POST(request: Request, { params }: { params: { packageId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const formData = await request.formData()
  const amount = parseFloat(formData.get('amount') as string)
  const notes = formData.get('notes') as string | null
  const duration_days = formData.get('duration_days') ? parseInt(formData.get('duration_days') as string) : null
  const crew_size = formData.get('crew_size') ? parseInt(formData.get('crew_size') as string) : null
  const earliest_start_date = formData.get('earliest_start_date') as string | null
  const payment_terms = formData.get('payment_terms') as string | null
  const file = formData.get('proposal') as File | null

  if (!amount || isNaN(amount)) return NextResponse.json({ error: 'Bid amount is required' }, { status: 400 })

  let proposal_url = null
  let proposal_storage_path = null

  // Upload proposal file if provided
  if (file && file.size > 0) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${profile.company_id}/${params.packageId}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await db.storage
      .from('proposals')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (!uploadError) {
      const { data: signedUrl } = await db.storage
        .from('proposals')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      proposal_url = signedUrl?.signedUrl ?? null
      proposal_storage_path = storagePath
    }
  }

  // Upsert bid (update if already submitted)
  const { data: existing } = await db
    .from('bids')
    .select('id')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

  const bidData = {
    bid_package_id: params.packageId,
    company_id: profile.company_id,
    amount,
    notes: notes || null,
    duration_days,
    crew_size,
    earliest_start_date: earliest_start_date || null,
    payment_terms: payment_terms || null,
    proposal_url,
    proposal_storage_path,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  }

  let bid
  if (existing) {
    const { data } = await db.from('bids').update(bidData).eq('id', existing.id).select().single()
    bid = data
  } else {
    const { data } = await db.from('bids').insert(bidData).select().single()
    bid = data
  }

  // Update invitation status to accepted
  await db.from('bid_invitations')
    .update({ status: 'accepted' })
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)

  return NextResponse.json({ bid })
}
