import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { variance } from '@/lib/selections'
import { money } from '@/lib/validate'

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
  'selected_price', 'notes', 'sort_order', 'reference_url', 'reference_label',
  'change_requested_at', 'change_request_note', 'supplier_company_id', 'expected_delivery',
]

export async function PATCH(request: Request, { params }: { params: { id: string; selId: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = ctx

  const body = await request.json()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f]

  // The money fields have to make sense on the way through here too. Creating
  // a selection refused a negative allowance while EDITING one accepted it,
  // which is the same split the reviewer spotted on sub bills: "the guard
  // exists in one place and not the others".
  for (const [field, label] of [['allowance_amount', 'allowance'], ['selected_price', 'price']] as const) {
    if (patch[field] == null) continue
    const checked = money(patch[field], { allowZero: true, label })
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    patch[field] = checked.value
  }

  // Recording the choice stamps who and when, so "when did they decide?" has an
  // answer months later when it matters.
  if (body.status === 'chosen' && !('selected_at' in body)) {
    patch.selected_at = new Date().toISOString()
  }

  // Accepting a selection is a commitment of money, so it has to land somewhere
  // the money is tracked. A chosen selection with no budget line is a cost the
  // budget cannot see - which is the exact thing this board exists to prevent.
  //
  // The client picking on their own link is NOT blocked by this (that goes
  // through the portal route) - it is the GC accepting it that needs a home.
  const ACCEPTED = new Set(['chosen', 'ordered', 'installed'])
  if (typeof body.status === 'string' && ACCEPTED.has(body.status)) {
    const { data: current } = await db.from('project_selections')
      .select('budget_line_item_id').eq('id', params.selId).single()
    const lineId = 'budget_line_item_id' in patch ? patch.budget_line_item_id : current?.budget_line_item_id
    if (!lineId) {
      return NextResponse.json({
        error: 'Link this to a budget line first - or add a new one for it. An accepted selection is money, and it needs somewhere on the budget to land.',
        needs_budget_line: true,
      }, { status: 409 })
    }
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
      // Onto the SAME budget line the allowance came out of. An overage that
      // floats free of its line is money the budget cannot see.
      const co_row: Record<string, unknown> = {
        project_id: params.id,
        title: `Selection: ${data.item}${data.location ? ` (${data.location})` : ''}`,
        description: `Client selected "${data.selected_name ?? 'an upgrade'}" at $${Number(data.selected_price).toLocaleString()} against an allowance of $${Number(data.allowance_amount).toLocaleString()}.`,
        amount: over,
        reason: 'Allowance variance on a client selection',
        requested_by_type: 'gc',
        status: 'pending',
        budget_line_item_id: data.budget_line_item_id ?? null,
      }
      let co = (await db.from('change_orders').insert(co_row).select('id').single()).data
      // Pre-migration fallback: the link column may not exist yet.
      if (!co) {
        delete co_row.budget_line_item_id
        co = (await db.from('change_orders').insert(co_row).select('id').single()).data
      }
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
