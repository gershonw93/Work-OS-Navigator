import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function companyId(db: any, userId: string) {
  const { data } = await db.from('profiles').select('company_id').eq('id', userId).single()
  return data?.company_id ?? null
}

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cid = await companyId(db, user.id)
  const { data, error } = await db
    .from('budget_templates')
    .select('*, budget_template_items(*)')
    .eq('company_id', cid)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cid = await companyId(db, user.id)
  const { name, description, contractor_fee_percent, source, items } = await request.json()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

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
      sort_order: i.sort_order ?? idx,
    }))
  if (rows.length) await db.from('budget_template_items').insert(rows)

  return NextResponse.json({ template: { ...tpl, budget_template_items: rows } })
}
