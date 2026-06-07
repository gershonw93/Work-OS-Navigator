import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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

  const { data: invitation } = await db
    .from('bid_invitations')
    .select('id, status')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

  if (!invitation) return NextResponse.json({ error: 'Not invited to this package' }, { status: 403 })

  const { data: myBid } = await db
    .from('bids')
    .select('*')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

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

  const { data: profile } = await db
    .from('profiles')
    .select('company_id, full_name, companies(name)')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const formData = await request.formData()
  const amount = parseFloat(formData.get('amount') as string)
  const notes = formData.get('notes') as string | null
  const duration_days = formData.get('duration_days') ? parseInt(formData.get('duration_days') as string) : null
  const crew_size = formData.get('crew_size') ? parseInt(formData.get('crew_size') as string) : null
  const earliest_start_date = formData.get('earliest_start_date') as string | null
  const payment_terms = formData.get('payment_terms') as string | null
  const scope_categories_raw = formData.get('scope_categories') as string | null
  const scope_categories = scope_categories_raw ? JSON.parse(scope_categories_raw) : null
  const file = formData.get('proposal') as File | null

  if (!amount || isNaN(amount)) return NextResponse.json({ error: 'Bid amount is required' }, { status: 400 })

  // Look up project_id via the package
  const { data: pkg } = await db
    .from('bid_packages')
    .select('project_id, scope')
    .eq('id', params.packageId)
    .single()

  let proposal_url = null
  let proposal_storage_path = null

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

  const { data: existing } = await db
    .from('bids')
    .select('id, status')
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)
    .single()

  const isRevision = existing?.status === 'revision_requested'

  const bidData = {
    bid_package_id: params.packageId,
    company_id: profile.company_id,
    amount,
    notes: notes || null,
    duration_days,
    crew_size,
    earliest_start_date: earliest_start_date || null,
    payment_terms: payment_terms || null,
    ...(proposal_url ? { proposal_url, proposal_storage_path } : {}),
    ...(scope_categories ? { scope_categories } : {}),
    status: 'submitted',
    revision_note: null,
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

  await db.from('bid_invitations')
    .update({ status: 'accepted' })
    .eq('bid_package_id', params.packageId)
    .eq('company_id', profile.company_id)

  // Log to project activity
  if (pkg?.project_id) {
    const companyName = (profile.companies as any)?.name ?? (profile as any)?.full_name ?? 'A sub'
    const action = isRevision ? 'bid_revised' : existing ? 'bid_updated' : 'bid_submitted'
    const verb = isRevision ? 'resubmitted revised' : existing ? 'updated' : 'submitted'
    await logActivity(db, pkg.project_id, companyName, action,
      `${companyName} ${verb} bid for "${pkg.scope}" — $${Number(amount).toLocaleString()}`,
      { bid_id: bid?.id, package_id: params.packageId, amount, duration_days, crew_size }
    )
  }

  return NextResponse.json({ bid })
}
