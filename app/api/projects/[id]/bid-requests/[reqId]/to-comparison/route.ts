import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Pull a bid request's submissions into a Compare-Quotes comparison.
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: req } = await db.from('bid_requests')
    .select('*, bid_submissions(*, bid_invites(vendor_name))')
    .eq('id', params.reqId).eq('project_id', params.id).single()
  if (!req) return NextResponse.json({ error: 'Bid request not found' }, { status: 404 })

  const subs = req.bid_submissions ?? []
  if (!subs.length) return NextResponse.json({ error: 'No submissions to compare yet.' }, { status: 400 })

  const { data: comp, error: cErr } = await db.from('quote_comparisons').insert({
    project_id: params.id,
    title: req.title,
    trade: req.trade,
    requirements: req.description,
    created_by: user.id,
  }).select().single()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const rows = subs.map((s: any) => ({
    comparison_id: comp.id,
    file_url: s.file_url,
    file_name: s.file_name,
    vendor_name: s.submitted_by_name || s.bid_invites?.vendor_name || null,
    total_amount: s.amount != null ? Number(s.amount) : null,
    scope_summary: s.notes || null,
    data: {},
  }))
  await db.from('quotes').insert(rows)

  return NextResponse.json({ comparison_id: comp.id, quotes: rows.length })
}
