import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { templateNameProblem } from '@/lib/budget-template-line'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'view')
  if (denied(gate)) return gate.denied
  const cid = gate.actor.companyId
  if (!cid) return NextResponse.json({ templates: [] })
  const { data, error } = await db
    .from('budget_templates')
    .select('*, budget_template_items(*)')
    .eq('company_id', cid)
    .order('created_at', { ascending: false })
    .order('sort_order', { referencedTable: 'budget_template_items', ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'edit')
  if (denied(gate)) return gate.denied
  const cid = gate.actor.companyId
  const user = { id: gate.actor.userId }
  const { name, description, contractor_fee_percent, source, items } = await request.json()
  const nameProblem = templateNameProblem(name)
  if (nameProblem) return NextResponse.json({ error: nameProblem }, { status: 400 })

  const { data: tpl, error } = await db
    .from('budget_templates')
    .insert({
      company_id: cid,
      name,
      description: description || null,
      contractor_fee_percent: Number(contractor_fee_percent) || 0,
      source: source || 'manual',
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (items ?? [])
    .filter((i: any) => i && (i.description ?? '').trim())
    .map((i: any, idx: number) => ({
      template_id: tpl.id,
      category: i.category || 'General',
      cost_code: i.cost_code || null,
      description: String(i.description).trim(),
      default_amount: i.default_amount != null && i.default_amount !== '' ? Number(i.default_amount) : null,
      cost_type: i.cost_type === 'soft' ? 'soft' : 'hard',
      sort_order: i.sort_order ?? idx,
    }))
  if (rows.length) {
    const { error: itemsError } = await db.from('budget_template_items').insert(rows)
    // Pre-migration fallback: cost_type column may not exist yet.
    if (itemsError && (itemsError as any).code === '42703') {
      await db.from('budget_template_items').insert(rows.map(({ cost_type: _omit, ...rest }: any) => rest))
    }
  }

  return NextResponse.json({ template: { ...tpl, budget_template_items: rows } })
}
