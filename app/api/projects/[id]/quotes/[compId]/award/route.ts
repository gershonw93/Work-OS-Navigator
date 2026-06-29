import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Award a winning quote: create (or reuse) a vendor company and a subcontract,
// so it flows into Financials, Schedule, Budget, and Compliance.
export async function POST(request: Request, { params }: { params: { id: string; compId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quote_id, vendor_type, budget_line_id, create_budget_line, budget_category } = await request.json()
  const companyType = vendor_type === 'supplier' ? 'supplier' : 'subcontractor'

  const { data: comp } = await db.from('quote_comparisons').select('*, quotes(*)').eq('id', params.compId).eq('project_id', params.id).single()
  if (!comp) return NextResponse.json({ error: 'Comparison not found' }, { status: 404 })
  if (comp.awarded_subcontract_id) return NextResponse.json({ error: 'This comparison has already been awarded.' }, { status: 409 })

  const quote = (comp.quotes ?? []).find((q: any) => q.id === quote_id)
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  if (quote.total_amount == null) return NextResponse.json({ error: 'This quote has no total amount — set one before awarding.' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()
  const myCompanyId = (profile as any)?.company_id ?? null
  const vendorName = quote.vendor_name || comp.title || 'Vendor'
  const niceTitle = comp.title && comp.title !== 'Untitled comparison' ? comp.title : null
  const scope = niceTitle || vendorName
  const trade = comp.trade || niceTitle || (companyType === 'supplier' ? 'Materials' : 'General')
  const contact = (quote.data?.contact ?? {}) as { name?: string | null; email?: string | null; phone?: string | null }

  // Find an existing vendor company by name in this GC's directory, else create one
  let companyId: string | null = null
  const { data: existing } = await db
    .from('companies')
    .select('id')
    .in('type', ['subcontractor', 'supplier'])
    .ilike('name', vendorName)
    .limit(1)
    .maybeSingle()
  if (existing) {
    companyId = existing.id
    // Backfill contact details from the quote if the company is missing them
    const backfill: Record<string, any> = {}
    if (contact.name) backfill.contact_name = contact.name
    if (contact.email) backfill.contact_email = contact.email
    if (contact.phone) backfill.phone = contact.phone
    if (Object.keys(backfill).length) await db.from('companies').update(backfill).eq('id', existing.id)
  } else {
    const { data: created, error: cErr } = await db
      .from('companies')
      .insert({
        name: vendorName,
        type: companyType,
        trade,
        contact_name: contact.name || null,
        contact_email: contact.email || `noemail+${Date.now()}@placeholder.com`,
        phone: contact.phone || null,
        insurance_status: 'missing',
        added_by_company_id: myCompanyId,
      })
      .select('id')
      .single()
    if (cErr) return NextResponse.json({ error: `Could not create vendor: ${cErr.message}` }, { status: 500 })
    companyId = created.id
  }

  // Create the subcontract
  const { data: sub, error: sErr } = await db
    .from('subcontracts')
    .insert({
      project_id: params.id,
      company_id: companyId,
      scope,
      trade,
      contract_amount: Number(quote.total_amount),
      status: 'active',
      added_manually: true,
      proposal_url: quote.file_url ?? null,
    })
    .select()
    .single()
  if (sErr) return NextResponse.json({ error: `Could not create subcontract: ${sErr.message}` }, { status: 500 })

  // Budget linkage: link an existing line, or create a new one for this contract
  if (budget_line_id) {
    await db.from('budget_line_items').update({ subcontract_id: sub.id }).eq('id', budget_line_id).eq('project_id', params.id)
  } else if (create_budget_line) {
    const { count } = await db.from('budget_line_items').select('*', { count: 'exact', head: true }).eq('project_id', params.id)
    await db.from('budget_line_items').insert({
      project_id: params.id,
      category: budget_category || trade,
      description: scope,
      budgeted_amount: Number(quote.total_amount),
      committed_amount: 0,
      actual_amount: 0,
      subcontract_id: sub.id,
      sort_order: count ?? 0,
    })
  }

  await db.from('quote_comparisons').update({ winning_quote_id: quote.id, awarded_subcontract_id: sub.id }).eq('id', params.compId)

  await logActivity(db, params.id, (profile as any)?.full_name ?? 'GC', 'quote_awarded',
    `Awarded "${comp.title}" to ${vendorName} for $${Number(quote.total_amount).toLocaleString()} (from quote comparison)`,
    { comparison_id: params.compId, quote_id: quote.id, subcontract_id: sub.id })

  return NextResponse.json({ subcontract: sub })
}
