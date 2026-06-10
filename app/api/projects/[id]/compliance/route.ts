import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: subcontracts, error: subError } = await db
    .from('subcontracts')
    .select('*, companies(id, name)')
    .eq('project_id', params.id)

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })

  const subs = subcontracts ?? []
  const companyIds = subs.map((s: any) => s.companies?.id).filter(Boolean)

  let docs: any[] = []
  if (companyIds.length > 0) {
    const { data, error: docsError } = await db
      .from('compliance_documents')
      .select('*')
      .in('company_id', companyIds)
      .or(`project_id.eq.${params.id},project_id.is.null`)

    if (docsError) return NextResponse.json({ error: docsError.message }, { status: 500 })
    docs = data ?? []
  }

  return NextResponse.json({ subcontracts: subs, docs })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { company_id, type, status, expiry_date, notes, file_url } = body

  if (!company_id || !type) {
    return NextResponse.json({ error: 'company_id and type are required' }, { status: 400 })
  }

  // Upsert on company_id + type (+ project_id)
  const { data: doc, error } = await db
    .from('compliance_documents')
    .upsert(
      {
        company_id,
        project_id: params.id,
        type,
        status: status ?? 'pending',
        expiry_date: expiry_date ?? null,
        notes: notes ?? null,
        file_url: file_url ?? null,
      },
      { onConflict: 'company_id,type,project_id' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ doc }, { status: 201 })
}
