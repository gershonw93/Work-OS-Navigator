import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { asContractType } from '@/lib/contract-type'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Enforce what the UI hides. Field roles get view-only on projects, so
  // without this any signed-in user could rename a job or flip its status.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to edit this project.' }, { status: 403 })
  }

  const body = await request.json()
  const { name, address, client, type, status, start_date, end_date, customer_id, lat, lng, interior_sqft, exterior_sqft, billing_mode, default_retainage_pct, labor_rate, unit, floor, sellout_amount, contract_type } = body

  const updates: Record<string, unknown> = {}

  // name, type, status, billing_mode and default_retainage_pct are NOT NULL in
  // the schema, so `!= null` rather than `!== undefined`: a client sending null
  // is asking to unset something that cannot be unset, and Postgres rejects the
  // WHOLE update with a constraint message no user can act on. Null means
  // "leave it as it is".
  //
  // This is not hypothetical - switching a job to simple invoicing sent
  // default_retainage_pct: null, and the save died on a job that had never
  // billed anything.
  if (name != null) updates.name = name
  if (address !== undefined) updates.address = address
  if (lat !== undefined && lng !== undefined && lat != null && lng != null) { updates.lat = lat; updates.lng = lng; updates.geocoded_address = address }
  if (client !== undefined) updates.client = client
  if (type != null) updates.type = type
  if (status != null) updates.status = status
  if (start_date !== undefined) updates.start_date = start_date
  if (end_date !== undefined) updates.end_date = end_date
  if (customer_id !== undefined) updates.customer_id = customer_id || null
  if (interior_sqft !== undefined) updates.interior_sqft = interior_sqft
  if (exterior_sqft !== undefined) updates.exterior_sqft = exterior_sqft
  if (billing_mode != null) updates.billing_mode = billing_mode
  if (default_retainage_pct != null) updates.default_retainage_pct = default_retainage_pct
  if (labor_rate !== undefined) updates.labor_rate = Math.max(0, Number(labor_rate) || 0)
  // Kept out of `address` on purpose - an address with "Unit 3" on the end
  // can't be geocoded, which is what stranded bulk-created jobs off the map.
  if (unit !== undefined) updates.unit = (unit ?? '').toString().trim() || null
  if (floor !== undefined) updates.floor = (floor ?? '').toString().trim() || null
  // How the job pays. Validated against the same list the CHECK constraint
  // uses, so a bad value is a no-op rather than a 500 the user cannot act on.
  if (contract_type !== undefined) {
    updates.contract_type = asContractType(contract_type)
  }
  // Projected revenue. Null means "no figure yet", which is different from 0.
  if (sellout_amount !== undefined) {
    updates.sellout_amount = sellout_amount === null || sellout_amount === ''
      ? null
      : Math.max(0, Number(sellout_amount) || 0)
  }

  let { data, error } = await db
    .from('projects')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  // Pre-migration fallback: drop columns that may not exist yet, one class at a time.
  if (error && (error as any).code === '42703' && 'labor_rate' in updates) {
    const { labor_rate: _lr, ...noRate } = updates
    const retry = await db.from('projects').update(noRate).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && 'sellout_amount' in updates) {
    const { sellout_amount: _s, ...noSellout } = updates
    const retry = await db.from('projects').update(noSellout).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && 'contract_type' in updates) {
    const { contract_type: _c, ...noContract } = updates
    const retry = await db.from('projects').update(noContract).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('unit' in updates || 'floor' in updates)) {
    const { unit: _u, floor: _f, ...noUnit } = updates
    const retry = await db.from('projects').update(noUnit).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('billing_mode' in updates || 'default_retainage_pct' in updates)) {
    const { billing_mode: _b, default_retainage_pct: _r, ...noBilling } = updates
    const retry = await db.from('projects').update(noBilling).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('interior_sqft' in updates || 'exterior_sqft' in updates)) {
    const { interior_sqft: _i, exterior_sqft: _e, billing_mode: _b2, default_retainage_pct: _r2, ...withoutSqft } = updates
    const retry = await db.from('projects').update(withoutSqft).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ project: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 'edit' rather than 'delete': the Projects list has always offered delete to
  // anyone who can manage a project, and project_manager has edit without
  // delete. Gating on 'delete' would take that away from PMs, which is a
  // separate decision. This closes the actual hole - view-only roles.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to delete projects.' }, { status: 403 })
  }

  const { error } = await db.from('projects').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
