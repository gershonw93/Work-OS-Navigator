import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { SELECTION_CATEGORIES, categoryDef, itemsForType } from '@/lib/selections'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  return { db, user, company_id: profile?.company_id ?? null }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = ctx

  const { data, error } = await db
    .from('project_selections')
    .select('*, selection_options(*)')
    .eq('project_id', params.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  // Pre-migration: say so plainly instead of a 500 the page can't explain.
  if (error && ((error as any).code === '42P01' || /does not exist/i.test(error.message))) {
    return NextResponse.json({ selections: [], budget_lines: [], portal_token: null, needs_migration: true })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Budget lines to hang an allowance off, and the portal link so the board can
  // offer "send this to the client" without a second place to look it up.
  const [{ data: lines }, { data: project }] = await Promise.all([
    db.from('budget_line_items').select('id, category, description, budgeted_amount').eq('project_id', params.id).order('sort_order'),
    db.from('projects').select('client_portal_token, client, start_date, type').eq('id', params.id).single(),
  ])

  return NextResponse.json({
    selections: data ?? [],
    budget_lines: lines ?? [],
    portal_token: project?.client_portal_token ?? null,
    client_name: project?.client ?? null,
    project_start: project?.start_date ?? null,
    // Drives which categories arrive pre-ticked on the seed checklist.
    project_type: project?.type ?? null,
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user, company_id } = ctx

  const body = await request.json()

  // Starting a board from the standard categories. Far more useful than an
  // empty page - most houses need most of these, and deleting is faster than
  // remembering.
  if (body.seed) {
    const wanted: string[] = Array.isArray(body.categories) && body.categories.length
      ? body.categories
      : SELECTION_CATEGORIES.map(c => c.category)

    // The kind of job also decides which ITEMS make sense. A medical suite that
    // asked for Cabinets still shouldn't get laundry cabinets.
    const { data: proj } = await db.from('projects').select('type').eq('id', params.id).single()
    const type = proj?.type ?? null

    const { data: existing } = await db.from('project_selections')
      .select('category, item').eq('project_id', params.id)
    const seen = new Set((existing ?? []).map(e => `${e.category}|${e.item}`.toLowerCase()))

    const rows: any[] = []
    let order = (existing?.length ?? 0) * 10
    for (const cat of SELECTION_CATEGORIES) {
      if (!wanted.includes(cat.category)) continue
      for (const item of itemsForType(cat, type)) {
        if (seen.has(`${cat.category}|${item}`.toLowerCase())) continue
        rows.push({
          project_id: params.id, company_id, category: cat.category, item,
          lead_time_days: cat.lead_time_days, status: 'pending',
          sort_order: (order += 10), created_by: user.id,
        })
      }
    }
    if (!rows.length) return NextResponse.json({ created: 0 })
    const { error } = await db.from('project_selections').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ created: rows.length })
  }

  const item = String(body.item ?? '').trim()
  if (!item) return NextResponse.json({ error: 'What is being selected?' }, { status: 400 })
  const category = String(body.category ?? 'Other').trim() || 'Other'

  const { data: last } = await db.from('project_selections')
    .select('sort_order').eq('project_id', params.id)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db.from('project_selections').insert({
    project_id: params.id,
    company_id,
    category,
    item,
    location: body.location || null,
    allowance_amount: body.allowance_amount ?? null,
    budget_line_item_id: body.budget_line_item_id || null,
    needed_by: body.needed_by || null,
    lead_time_days: body.lead_time_days ?? categoryDef(category)?.lead_time_days ?? null,
    notes: body.notes || null,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
  }).select('*, selection_options(*)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ selection: data })
}
