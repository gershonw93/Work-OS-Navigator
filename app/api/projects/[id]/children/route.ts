import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The jobs grouped under a site, with each one's budget roll-up. This is the
// only view where a building's units are totalled, so the numbers are computed
// here rather than making the page fetch a budget per unit.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: site } = await db
    .from('projects').select('id, name, address').eq('id', params.id).single()

  let { data: rows, error } = await db
    .from('projects')
    .select('id, name, status, unit, floor, address, sellout_amount')
    .eq('parent_project_id', params.id)
    .order('created_at', { ascending: true })

  // Pre-migration fallbacks: sellout may not exist yet, and before that the
  // parent link itself may not - in which case nothing is grouped at all.
  if (error && (error as any).code === '42703') {
    const retry = await db
      .from('projects')
      .select('id, name, status, unit, floor, address')
      .eq('parent_project_id', params.id)
      .order('created_at', { ascending: true })
    if (retry.error) return NextResponse.json({ site: site ?? null, children: [] })
    rows = retry.data as any
    error = null
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows ?? []).map(r => r.id)
  const budgeted = new Map<string, number>()
  const actual = new Map<string, number>()

  if (ids.length) {
    const { data: lines } = await db
      .from('budget_line_items')
      .select('project_id, budgeted_amount, actual_amount')
      .in('project_id', ids)
    for (const l of lines ?? []) {
      budgeted.set(l.project_id, (budgeted.get(l.project_id) ?? 0) + Number(l.budgeted_amount ?? 0))
      actual.set(l.project_id, (actual.get(l.project_id) ?? 0) + Number(l.actual_amount ?? 0))
    }
  }

  // Units sort naturally: 2 before 10, and "3B" beside "3A".
  const children = (rows ?? [])
    .map(r => ({
      ...r,
      budgeted: budgeted.get(r.id) ?? 0,
      actual: actual.get(r.id) ?? 0,
      sellout: (r as any).sellout_amount != null ? Number((r as any).sellout_amount) : null,
    }))
    .sort((a, b) => {
      const key = (r: any) => r.unit ?? r.floor ?? r.name ?? ''
      return String(key(a)).localeCompare(String(key(b)), undefined, { numeric: true, sensitivity: 'base' })
    })

  return NextResponse.json({ site: site ?? null, children })
}
