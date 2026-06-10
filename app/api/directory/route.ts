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

  // Fetch ALL companies regardless of type
  const { data: companies } = await db
    .from('companies')
    .select('*')
    .order('name')

  // Check which companies have at least one profile (i.e. a real account)
  const { data: profiles } = await db
    .from('profiles')
    .select('company_id')

  const companiesWithAccount = new Set((profiles ?? []).map(p => p.company_id))

  const companiesResult = (companies ?? []).map(c => ({
    ...c,
    has_account: companiesWithAccount.has(c.id),
  }))

  // Try to fetch contacts table — gracefully fall back if it doesn't exist
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
    // contacts table doesn't exist — return empty array
    contactsResult = []
  }

  return NextResponse.json({ companies: companiesResult, contacts: contactsResult })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  }

  // Attempt to set extra column — if it doesn't exist Supabase will just ignore or error
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
