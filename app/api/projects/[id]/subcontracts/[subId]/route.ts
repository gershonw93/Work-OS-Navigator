import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Subcontract fields
  const allowed = ['scope', 'trade', 'contract_amount', 'line_items', 'status', 'billing_type', 'progress_percent', 'weekly_amount', 'billing_notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  // Company fields (name / contact) live on the companies table
  const companyUpdates: Record<string, unknown> = {}
  if (body.company_name !== undefined) companyUpdates.name = body.company_name
  if (body.contact_email !== undefined) companyUpdates.contact_email = body.contact_email
  if (body.phone !== undefined) companyUpdates.phone = body.phone

  let data: any = null
  if (Object.keys(updates).length > 0) {
    let res = await db.from('subcontracts').update(updates).eq('id', params.subId).eq('project_id', params.id).select('*, companies(id, name)').single()
    // Retry without line_items if that column isn't migrated yet
    if (res.error && (res.error as any).code === '42703' && 'line_items' in updates) {
      const u = { ...updates }; delete u.line_items
      res = await db.from('subcontracts').update(u).eq('id', params.subId).eq('project_id', params.id).select('*, companies(id, name)').single()
    }
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    data = res.data
  } else {
    const res = await db.from('subcontracts').select('*, companies(id, name)').eq('id', params.subId).eq('project_id', params.id).single()
    data = res.data
  }

  if (Object.keys(companyUpdates).length > 0 && data?.company_id) {
    await db.from('companies').update(companyUpdates).eq('id', data.company_id)
  }

  return NextResponse.json({ subcontract: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Clean up dependent rows first (best-effort), then the subcontract
  await db.from('payment_schedule_items').delete().eq('subcontract_id', params.subId)
  await db.from('schedule_items').delete().eq('subcontract_id', params.subId)

  const { error } = await db.from('subcontracts').delete().eq('id', params.subId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
