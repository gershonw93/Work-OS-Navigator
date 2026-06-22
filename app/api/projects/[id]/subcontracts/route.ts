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

  const { data: subcontracts, error } = await db
    .from('subcontracts')
    .select('id, scope, companies(id, name)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subcontracts: subcontracts ?? [] })
}

// Manually add an off-platform subcontractor (GC enters everything; no invite/bid).
// Accepts multipart form-data so a proposal file can be uploaded at the same time.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()

  const form = await request.formData()
  const companyName = (form.get('company_name') as string ?? '').trim()
  const trade = (form.get('trade') as string ?? '').trim()
  const scope = (form.get('scope') as string ?? '').trim()
  const contactEmail = (form.get('contact_email') as string ?? '').trim()
  const phone = (form.get('phone') as string ?? '').trim()
  const amountRaw = (form.get('contract_amount') as string ?? '').replace(/[^0-9.]/g, '')
  const contractAmount = amountRaw ? parseFloat(amountRaw) : null
  const file = form.get('proposal') as File | null

  if (!companyName) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  // Create (or reuse) an off-platform subcontractor company in the same GC company space
  const { data: company, error: companyErr } = await db
    .from('companies')
    .insert({
      name: companyName,
      type: 'subcontractor',
      trade: trade || null,
      contact_email: contactEmail || '',
      phone: phone || null,
    })
    .select()
    .single()

  if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 500 })

  // Upload the proposal file if one was provided
  let proposal_url: string | null = null
  if (file && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/proposals/${Date.now()}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await db.storage.from('submittals').upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })
    if (!upErr) {
      const { data: signed } = await db.storage.from('submittals').createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      proposal_url = signed?.signedUrl ?? null
    }
  }

  const insertSub: Record<string, unknown> = {
    project_id: params.id,
    company_id: company.id,
    scope: scope || trade || '',
    trade: trade || scope || '',
    contract_amount: contractAmount,
    status: 'active',
    added_manually: true,
    proposal_url,
  }

  let { data: subcontract, error: subErr } = await db.from('subcontracts').insert(insertSub).select().single()

  // Retry without the new optional columns if the migration hasn't been run yet
  if (subErr && (subErr as any).code === '42703') {
    delete insertSub.added_manually
    delete insertSub.proposal_url
    const retry = await db.from('subcontracts').insert(insertSub).select().single()
    subcontract = retry.data
    subErr = retry.error
  }

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  await logActivity(
    db,
    params.id,
    (profile as any)?.full_name ?? 'Someone',
    'subcontractor_added',
    `Subcontractor added manually: ${companyName}${trade ? ` (${trade})` : ''}`,
    { subcontract_id: subcontract.id, company: companyName, trade },
  )

  return NextResponse.json({ subcontract }, { status: 201 })
}
