import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { TRADE_SCOPES, scopeForTrade, type TradeScope } from '@/lib/trade-scopes'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The per-trade defaults, with this company's edits layered on top.
//
// Built-ins ship so the first RFQ is already right; a company's own version
// wins once they've edited it, because the second job should start from what
// they learned on the first.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()

  let overrides: any[] = []
  if (profile?.company_id) {
    try {
      const { data } = await db.from('company_trade_scopes').select('*').eq('company_id', profile.company_id)
      overrides = data ?? []
    } catch { /* table not there yet - built-ins only */ }
  }

  const byTrade = new Map(overrides.map(o => [String(o.trade).toLowerCase(), o]))

  const scopes: TradeScope[] = TRADE_SCOPES.map(base => {
    const o = byTrade.get(base.trade.toLowerCase())
    if (!o) return base
    return {
      ...base,
      package_type: o.package_type ?? base.package_type,
      material_by: o.material_by ?? base.material_by,
      included: (o.included?.length ? o.included : base.included),
      excluded: (o.excluded?.length ? o.excluded : base.excluded),
      ask_for: (o.ask_for?.length ? o.ask_for : base.ask_for),
    }
  })

  // A trade the company invented that isn't in the built-in list.
  for (const o of overrides) {
    if (!scopeForTrade(o.trade)) {
      scopes.push({
        trade: o.trade,
        package_type: o.package_type ?? 'turnkey',
        material_by: o.material_by ?? 'sub',
        included: o.included ?? [],
        excluded: o.excluded ?? [],
        ask_for: o.ask_for ?? [],
      })
    }
  }

  return NextResponse.json({ scopes })
}

// Save this company's version of a trade's defaults.
export async function PUT(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const trade = String(body.trade ?? '').trim()
  if (!trade) return NextResponse.json({ error: 'A trade is required' }, { status: 400 })

  const row = {
    company_id: profile.company_id,
    trade,
    package_type: body.package_type ?? null,
    material_by: body.material_by ?? null,
    included: Array.isArray(body.included) ? body.included : [],
    excluded: Array.isArray(body.excluded) ? body.excluded : [],
    ask_for: Array.isArray(body.ask_for) ? body.ask_for : [],
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await db
    .from('company_trade_scopes').select('id')
    .eq('company_id', profile.company_id).ilike('trade', trade).maybeSingle()

  const { error } = existing
    ? await db.from('company_trade_scopes').update(row).eq('id', existing.id)
    : await db.from('company_trade_scopes').insert(row)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
