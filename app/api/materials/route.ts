import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function ctx(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('company_id, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return null
  return { db, user, companyId: profile.company_id, actorName: profile.full_name || 'Someone' }
}

// List material purchases across the company's projects, plus the projects list
// for the "which job" selector.
export async function GET(request: Request) {
  const c = await ctx(request)
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, companyId } = c

  const { data: projects } = await db
    .from('projects').select('id, name')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
    .order('name')
  const projectIds = (projects ?? []).map((p: any) => p.id)

  let materials: any[] = []
  if (projectIds.length) {
    const { data } = await db
      .from('material_purchases')
      .select('*')
      .in('project_id', projectIds)
      .order('purchase_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    const projName = new Map((projects ?? []).map((p: any) => [p.id, p.name]))
    materials = (data ?? []).map((m: any) => ({ ...m, project_name: projName.get(m.project_id) ?? 'Project' }))
  }

  return NextResponse.json({ materials, projects: projects ?? [] })
}

export async function POST(request: Request) {
  const c = await ctx(request)
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user, companyId, actorName } = c

  const body = await request.json()
  const { project_id, store_name, amount, tax, purchase_date, category, notes, receipt_url, line_items, budget_line_id, save_store, client_paid } = body
  if (!project_id) return NextResponse.json({ error: 'Pick which job this is for.' }, { status: 400 })

  // Optionally save the store as a supplier in the Directory (find or create by name).
  let store_company_id: string | null = null
  if (save_store && store_name?.trim()) {
    const { data: existing } = await db.from('companies').select('id').ilike('name', store_name.trim()).limit(1).maybeSingle()
    if (existing) store_company_id = existing.id
    else {
      const { data: created } = await db.from('companies').insert({
        name: store_name.trim(), type: 'supplier', trade: 'Materials',
        contact_email: `noemail+${Date.now()}@placeholder.com`, insurance_status: 'missing', added_by_company_id: companyId,
      }).select('id').single()
      store_company_id = created?.id ?? null
    }
  }

  const row = {
    project_id,
    company_id: store_company_id,
    budget_line_id: budget_line_id || null,
    store_name: store_name || null,
    amount: Number(amount) || 0,
    tax: tax != null && tax !== '' ? Number(tax) : null,
    purchase_date: purchase_date || null,
    category: category || null,
    notes: notes || null,
    receipt_url: receipt_url || null,
    line_items: line_items ?? null,
    client_paid: !!client_paid,
    created_by: user.id,
  }

  let { data, error } = await db.from('material_purchases').insert(row).select('*').single()
  // Pre-migration fallback: client_paid column may not exist yet.
  if (error && (error as any).code === '42703') {
    const { client_paid: _omit, ...withoutClientPaid } = row
    const retry = await db.from('material_purchases').insert(withoutClientPaid).select('*').single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, project_id, actorName, 'material_purchased',
    `Material receipt: ${store_name || 'purchase'} - $${Number(amount || 0).toLocaleString()}`,
    { material_id: data.id, store_name, amount }, user.id)

  return NextResponse.json({ material: data })
}
