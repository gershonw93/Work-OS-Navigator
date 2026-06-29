import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Apply a budget template (or copy another project's budget) into this project's
// budget. Amounts are BLANK by default; copy_amounts=true brings them in too.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { template_id, source_project_id, copy_amounts } = await request.json()
  const keepAmounts = !!copy_amounts

  // Build the line items to insert, from a template or another project
  let rows: { category: string; cost_code: string | null; description: string; amount: number | null }[] = []

  if (template_id) {
    const { data: items } = await db
      .from('budget_template_items')
      .select('*')
      .eq('template_id', template_id)
      .order('sort_order', { ascending: true })
    rows = (items ?? []).map((i: any) => ({
      category: i.category || 'General',
      cost_code: i.cost_code || null,
      description: i.description,
      amount: keepAmounts && i.default_amount != null ? Number(i.default_amount) : null,
    }))
  } else if (source_project_id) {
    const { data: items } = await db
      .from('budget_line_items')
      .select('*')
      .eq('project_id', source_project_id)
      .order('sort_order', { ascending: true })
    rows = (items ?? []).map((i: any) => ({
      category: i.category || 'General',
      cost_code: i.cost_code || null,
      description: i.description,
      amount: keepAmounts ? Number(i.budgeted_amount) || null : null,
    }))
  } else {
    return NextResponse.json({ error: 'Provide template_id or source_project_id' }, { status: 400 })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'Nothing to apply' }, { status: 400 })

  // Append after any existing lines
  const { count } = await db.from('budget_line_items').select('*', { count: 'exact', head: true }).eq('project_id', params.id)
  const base = count ?? 0

  const { data, error } = await db.from('budget_line_items').insert(
    rows.map((r, idx) => ({
      project_id: params.id,
      category: r.category,
      cost_code: r.cost_code,
      description: r.description,
      budgeted_amount: r.amount ?? 0,
      committed_amount: 0,
      actual_amount: 0,
      sort_order: base + idx,
    }))
  ).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: data?.length ?? 0 })
}
