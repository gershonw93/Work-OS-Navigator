import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  // Get the user's company
  const { data: profile } = await db
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const myCompanyId = profile?.company_id
  if (!myCompanyId) return NextResponse.json({ companies: [], contacts: [] })

  // Find all company IDs this company has a relationship with:
  // 1. Their own company
  // 2. Subcontractors on their projects (as GC)
  // 3. GC companies on projects they're subbed to (as Sub)
  // 4. Companies they explicitly added to the directory (added_by_company_id)
  const [projectsRes, subcontractsAsSubRes] = await Promise.all([
    db.from('projects').select('id').eq('gc_company_id', myCompanyId),
    db.from('subcontracts').select('project_id, companies!inner(id)').eq('company_id', myCompanyId),
  ])

  const myProjectIds = (projectsRes.data ?? []).map((p: any) => p.id)

  // Subs on my projects
  let subCompanyIds: string[] = []
  if (myProjectIds.length > 0) {
    const { data: subs } = await db
      .from('subcontracts')
      .select('company_id')
      .in('project_id', myProjectIds)
    subCompanyIds = (subs ?? []).map((s: any) => s.company_id).filter(Boolean)
  }

  // GC companies on projects I'm subbed to
  const mySubProjectIds = (subcontractsAsSubRes.data ?? []).map((s: any) => s.project_id).filter(Boolean)
  let gcCompanyIds: string[] = []
  if (mySubProjectIds.length > 0) {
    const { data: gcProjects } = await db
      .from('projects')
      .select('gc_company_id')
      .in('id', mySubProjectIds)
    gcCompanyIds = (gcProjects ?? []).map((p: any) => p.gc_company_id).filter(Boolean)
  }

  // All companies I've added myself (added_by_company_id column, if exists)
  const { data: addedCompanies } = await db
    .from('companies')
    .select('id')
    .eq('added_by_company_id', myCompanyId)
  const addedIds = (addedCompanies ?? []).map((c: any) => c.id)

  const visibleIds = Array.from(new Set([
    myCompanyId,
    ...subCompanyIds,
    ...gcCompanyIds,
    ...addedIds,
  ]))

  const { data: companies } = await db
    .from('companies')
    .select('*')
    .in('id', visibleIds)
    .order('name')

  // Check which companies have at least one profile (i.e. a real account)
  const { data: profiles } = await db
    .from('profiles')
    .select('company_id')
    .in('company_id', visibleIds)

  const companiesWithAccount = new Set((profiles ?? []).map(p => p.company_id))

  const companiesResult = (companies ?? []).map(c => ({
    ...c,
    has_account: companiesWithAccount.has(c.id),
  }))

  // Try to fetch contacts table - gracefully fall back if it doesn't exist
  let contactsResult: unknown[] = []
  try {
    const { data: contacts, error } = await db
      .from('contacts')
      .select('*')
      .order('name')
    if (!error) {
      contactsResult = contacts ?? []
    }
  } catch {
    // contacts table doesn't exist - return empty array
    contactsResult = []
  }

  return NextResponse.json({ companies: companiesResult, contacts: contactsResult })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get user's company so we can tag the new entry as added by them
  const { data: userProfile } = await admin()
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  const myCompanyId = userProfile?.company_id ?? null

  const body = await request.json()
  const {
    name,
    type = 'subcontractor',
    trade,
    contact_email,
    phone,
    address,
    license_number,
    website,
    // Inspector-specific
    specialty,
    jurisdiction,
    certification_number,
    notes,
  } = body

  if (!name || !contact_email) {
    return NextResponse.json({ error: 'Name and contact email are required' }, { status: 400 })
  }

  const validTypes = ['gc', 'subcontractor', 'inspector', 'supplier', 'worker', 'other']
  const safeType = validTypes.includes(type) ? type : 'other'

  // Build extra JSONB payload for inspector/supplier fields
  const extra: Record<string, string> = {}
  if (specialty) extra.specialty = specialty
  if (jurisdiction) extra.jurisdiction = jurisdiction
  if (certification_number) extra.certification_number = certification_number
  if (notes) extra.notes = notes
  if (website) extra.website = website

  const insertPayload: Record<string, unknown> = {
    name,
    type: safeType,
    trade: trade || null,
    contact_email,
    phone: phone || null,
    address: address || null,
    license_number: license_number || null,
    insurance_status: 'missing',
    added_by_company_id: myCompanyId,
  }

  // Attempt to set extra column - if it doesn't exist Supabase will just ignore or error
  if (Object.keys(extra).length > 0) {
    insertPayload.extra = extra
  }

  const { data, error } = await admin()
    .from('companies')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    // If the error is about the extra column not existing, retry without it
    if (error.message?.includes('extra') || error.code === '42703') {
      const { extra: _extra, ...payloadWithoutExtra } = insertPayload as Record<string, unknown> & { extra?: unknown }
      const { data: data2, error: error2 } = await admin()
        .from('companies')
        .insert(payloadWithoutExtra)
        .select()
        .single()
      if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
      return NextResponse.json({ company: data2 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ company: data })
}
