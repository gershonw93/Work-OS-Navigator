import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { variance } from '@/lib/selections'

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
  return { db, user }
}

const FIELDS = [
  'category', 'item', 'location', 'allowance_amount', 'budget_line_item_id',
  'needed_by', 'lead_time_days', 'status', 'selected_option_id', 'selected_name',
  'selected_price', 'notes', 'sort_order',
]

export async function PATCH(request: Request, { params }: { params: { id: string; selId: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = ctx

  const body = await request.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f]

  // Recording the choice stamps who and when, so "when did they decide?" has an
  // answer months later when it matters.
  if (body.status === 'chosen' && !('selected_at' in body)) {
    patch.selected_at = new Date().toISOString()
  }

  const { data, error } = await db.from('project_selections')
    .update(patch).eq('id', params.selId).eq('project_id', params.id)
    .select('*, selection_options(*)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Turn an overage into a change order. This is the whole reason allowances
  // are tracked here rather than in someone's head - the difference is real
  // money and it needs a paper trail, not a conversation.
  if (body.create_change_order && data) {
    const over = variance(data)
    if (over != null && over !== 0) {
      const { data: co } = await db.from('change_orders').insert({
        project_id: params.id,
        title: `Selection: ${data.item}${data.location ? ` (${data.location})` : ''}`,
        description: `Client selected "${data.selected_name ?? 'an upgrade'}" at $${Number(data.selected_price).toLocaleString()} against an allowance of $${Number(data.allowance_amount).toLocaleString()}.`,
        amount: over,
        reason: 'Allowance variance on a client selection',
        requested_by_type: 'gc',
        status: 'pending',
      }).select('id').single()
      if (co) {
        await db.from('project_selections').update({ change_order_id: co.id }).eq('id', params.selId)
        return NextResponse.json({ selection: { ...data, change_order_id: co.id }, change_order_id: co.id })
      }
    }
  }

  void user
  return NextResponse.json({ selection: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; selId: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await ctx.db.from('project_selections')
    .delete().eq('id', params.selId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
