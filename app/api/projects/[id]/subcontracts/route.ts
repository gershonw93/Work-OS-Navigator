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
  const existingCompanyId = (form.get('existing_company_id') as string ?? '').trim()
  const companyName = (form.get('company_name') as string ?? '').trim()
  const trade = (form.get('trade') as string ?? '').trim()
  const scope = (form.get('scope') as string ?? '').trim()
  const contactEmail = (form.get('contact_email') as string ?? '').trim()
  const phone = (form.get('phone') as string ?? '').trim()
  const file = form.get('proposal') as File | null

  // Scope line items: [{ description, amount }]
  let lineItems: { description: string; amount: number | null }[] = []
  try {
    const raw = form.get('line_items') as string | null
    if (raw) lineItems = JSON.parse(raw)
  } catch { lineItems = [] }
  lineItems = (lineItems || []).filter(li => (li.description ?? '').trim() || li.amount)

  const amountRaw = (form.get('contract_amount') as string ?? '').replace(/[^0-9.]/g, '')
  // Contract amount = explicit value, else sum of line items
  const lineItemsTotal = lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0)
  const contractAmount = amountRaw ? parseFloat(amountRaw) : (lineItemsTotal || null)

  if (!existingCompanyId && !companyName) {
    return NextResponse.json({ error: 'Pick an existing subcontractor or enter a company name' }, { status: 400 })
  }

  // Either reuse an existing directory company, or create a new off-platform one
  let company: { id: string; name: string } | null = null
  if (existingCompanyId) {
    const { data: existing, error: exErr } = await db
      .from('companies').select('id, name').eq('id', existingCompanyId).single()
    if (exErr || !existing) return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 })
    company = existing
  } else {
    const newCompany: Record<string, unknown> = {
      name: companyName,
      type: 'subcontractor',
      trade: trade || null,
      contact_email: contactEmail || '',
      phone: phone || null,
      added_by_company_id: (profile as any)?.company_id ?? null,
    }
    let { data: created, error: companyErr } = await db.from('companies').insert(newCompany).select('id, name').single()
    // Retry without added_by_company_id if that column hasn't been added
    if (companyErr && (companyErr as any).code === '42703') {
      delete newCompany.added_by_company_id
      const retry = await db.from('companies').insert(newCompany).select('id, name').single()
      created = retry.data; companyErr = retry.error
    }
    if (companyErr || !created) return NextResponse.json({ error: companyErr?.message ?? 'Could not create company' }, { status: 500 })
    company = created
  }

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

  // Build a readable scope fallback from line items if no paragraph was typed
  const scopeText = scope || lineItems.map(li => li.description).filter(Boolean).join('; ') || trade || ''

  const insertSub: Record<string, unknown> = {
    project_id: params.id,
    company_id: company.id,
    scope: scopeText,
    trade: trade || scopeText || '',
    contract_amount: contractAmount,
    status: 'active',
    added_manually: true,
    proposal_url,
    line_items: lineItems,
  }

  let { data: subcontract, error: subErr } = await db.from('subcontracts').insert(insertSub).select().single()

  // Retry dropping optional columns one tier at a time if migrations haven't run yet
  if (subErr && (subErr as any).code === '42703') {
    delete insertSub.line_items
    let retry = await db.from('subcontracts').insert(insertSub).select().single()
    if (retry.error && (retry.error as any).code === '42703') {
      delete insertSub.added_manually
      delete insertSub.proposal_url
      retry = await db.from('subcontracts').insert(insertSub).select().single()
    }
    subcontract = retry.data
    subErr = retry.error
  }

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  await logActivity(
    db,
    params.id,
    (profile as any)?.full_name ?? 'Someone',
    'subcontractor_added',
    `Subcontractor added: ${company.name}${trade ? ` (${trade})` : ''}`,
    { subcontract_id: subcontract.id, company: company.name, trade },
  )

  return NextResponse.json({ subcontract }, { status: 201 })
}
