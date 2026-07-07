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

  const { template_id, source_project_id, copy_amounts, items, merge } = await request.json()
  const keepAmounts = !!copy_amounts

  // Build the line items to insert, from a template or another project
  let rows: { category: string; cost_code: string | null; description: string; amount: number | null }[] = []

  if (Array.isArray(items) && items.length) {
    // Direct import (e.g. an uploaded estimate/budget sheet)
    rows = items
      .filter((i: any) => i?.description)
      .map((i: any) => ({
        category: i.category || 'General',
        cost_code: i.cost_code || null,
        description: String(i.description),
        amount: i.default_amount != null ? Number(i.default_amount) : (i.amount != null ? Number(i.amount) : null),
      }))
  } else if (template_id) {
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
    return NextResponse.json({ error: 'Provide items, template_id, or source_project_id' }, { status: 400 })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'Nothing to apply' }, { status: 400 })

  // Merge mode: rows whose description matches an existing line (case/spacing
  // insensitive) UPDATE that line's budgeted amount; the rest are added as new.
  // Existing lines not present in the sheet are never touched or deleted.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  let updated = 0
  if (merge) {
    const { data: existing } = await db
      .from('budget_line_items')
      .select('id, description')
      .eq('project_id', params.id)
    const byDesc = new Map<string, string>()
    for (const l of existing ?? []) {
      const key = norm(l.description ?? '')
      if (key && !byDesc.has(key)) byDesc.set(key, l.id)
    }
    const remaining: typeof rows = []
    for (const r of rows) {
      const matchId = byDesc.get(norm(r.description))
      if (matchId) {
        if (r.amount != null) {
          const { error } = await db.from('budget_line_items').update({ budgeted_amount: r.amount }).eq('id', matchId)
          if (!error) updated++
        }
        byDesc.delete(norm(r.description)) // one sheet row per line
      } else {
        remaining.push(r)
      }
    }
    rows = remaining
  }

  // Append the (remaining) rows after any existing lines
  let inserted = 0
  if (rows.length) {
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
    inserted = data?.length ?? 0
  }

  return NextResponse.json({ inserted, updated })
}
