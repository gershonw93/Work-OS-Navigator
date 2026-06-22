/**
 * One-time backfill: repairs manual-sub bids that were created before the
 * scope_categories / payment_terms columns were populated.
 *
 * POST /api/admin/backfill-manual-bids
 * Requires a valid user session (service role used internally).
 *
 * Finds every subcontract where added_manually = true, looks up its matching
 * bid (via company_id + bid_package project_id), and writes the correct
 * scope_categories, payment_terms, proposal_url, and notes.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all manual subcontracts with their line items + payment schedule items
  const { data: subs, error: subsErr } = await db
    .from('subcontracts')
    .select('id, project_id, company_id, scope, trade, contract_amount, proposal_url, line_items')
    .eq('added_manually', true)

  if (subsErr) return NextResponse.json({ error: subsErr.message }, { status: 500 })
  if (!subs || subs.length === 0) return NextResponse.json({ repaired: 0 })

  const results: { subId: string; status: string; detail?: string }[] = []

  for (const sub of subs) {
    try {
      // Find the payment schedule for this sub
      const { data: scheduleRows } = await db
        .from('payment_schedule_items')
        .select('label, type, percentage, amount, order_index')
        .eq('subcontract_id', sub.id)
        .order('order_index')

      // Find the bid linked to this sub via bid_packages on the same project + same company
      const { data: bids } = await db
        .from('bids')
        .select('id, notes, scope_categories, payment_terms, proposal_url')
        .eq('company_id', sub.company_id)
        .eq('status', 'awarded')
        .in('bid_package_id',
          (await db
            .from('bid_packages')
            .select('id')
            .eq('project_id', sub.project_id)
            .eq('status', 'awarded')
          ).data?.map((p: any) => p.id) ?? []
        )

      if (!bids || bids.length === 0) {
        results.push({ subId: sub.id, status: 'no-bid-found' })
        continue
      }

      // Pick the bid that most looks like it needs repair (notes = URL or missing scope_categories)
      const bid = bids.find(
        (b: any) => !b.scope_categories || (b.notes && b.notes.startsWith('http'))
      ) ?? bids[0]

      const lineItems: any[] = Array.isArray(sub.line_items) ? sub.line_items : []

      // Build scope_categories
      const scopeItems = lineItems.map((li: any, i: number) => ({
        id: `li-${i}`,
        item: li.description || `Item ${i + 1}`,
        qty: li.qty ?? (li.amount != null ? 1 : null),
        unit_price: li.unit_price ?? (li.amount != null ? Number(li.amount) : null),
        included: true,
      }))
      const scopeCategories =
        scopeItems.length > 0
          ? [{ id: 'cat-0', category: sub.trade || 'Scope of Work', items: scopeItems }]
          : null

      // Build payment_terms text from schedule rows
      const paymentTermsText =
        scheduleRows && scheduleRows.length > 0
          ? scheduleRows
              .map(
                (p: any) =>
                  `${p.label || 'Payment'}${p.percentage != null ? ` — ${p.percentage}%` : ''}${p.amount != null ? ` ($${Number(p.amount).toLocaleString()})` : ''}`,
              )
              .join('\n')
          : null

      const scopeText = sub.scope || sub.trade || ''

      const bidUpdate: Record<string, unknown> = {
        notes: scopeText || null,
      }
      if (sub.proposal_url) bidUpdate.proposal_url = sub.proposal_url
      if (scopeCategories) bidUpdate.scope_categories = scopeCategories
      if (paymentTermsText) bidUpdate.payment_terms = paymentTermsText

      let { error: updErr } = await db.from('bids').update(bidUpdate).eq('id', bid.id)
      // If optional columns don't exist yet, retry with just notes + proposal_url
      if (updErr && (updErr as any).code === '42703') {
        const minimal: Record<string, unknown> = { notes: scopeText || null }
        if (sub.proposal_url) minimal.proposal_url = sub.proposal_url
        const retry = await db.from('bids').update(minimal).eq('id', bid.id)
        updErr = retry.error
      }

      if (updErr) {
        results.push({ subId: sub.id, status: 'error', detail: updErr.message })
      } else {
        results.push({ subId: sub.id, status: 'repaired', detail: `bid ${bid.id}` })
      }
    } catch (e: any) {
      results.push({ subId: sub.id, status: 'exception', detail: e?.message })
    }
  }

  return NextResponse.json({ repaired: results.filter(r => r.status === 'repaired').length, results })
}
