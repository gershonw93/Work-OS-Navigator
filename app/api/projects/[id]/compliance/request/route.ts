import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Create a one-time link asking a company to upload compliance docs.
// Returns the token + the company's contact email so the UI can prefill a mailto.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { company_id, doc_types } = await request.json() as { company_id: string; doc_types: string[] }
  if (!company_id || !Array.isArray(doc_types) || doc_types.length === 0) {
    return NextResponse.json({ error: 'company_id and at least one doc type are required' }, { status: 400 })
  }

  const { data: company } = await db.from('companies').select('name, contact_email').eq('id', company_id).single()

  const linkToken = randomUUID().replace(/-/g, '')
  const { data: reqRow, error } = await db.from('compliance_requests').insert({
    project_id: params.id,
    company_id,
    token: linkToken,
    doc_types,
    vendor_name: company?.name ?? null,
    vendor_email: company?.contact_email ?? null,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const validEmail = company?.contact_email && !company.contact_email.includes('placeholder') ? company.contact_email : null
  return NextResponse.json({ request: reqRow, contact_email: validEmail, company_name: company?.name ?? null })
}
