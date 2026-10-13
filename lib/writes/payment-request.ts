import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStages, isRequestable, percentOfTotal } from '@/lib/payment-stages'
import { friendlyDbError } from '@/lib/db-error'
import { money, percent } from '@/lib/validate'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Raising a payment request (a deposit or a quoted stage) - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/payment-requests` unchanged. The route
// keeps its sign-in check; this is everything after it.
//
// RAISING IS NOT ASKING. The row is born `pending` (the column default) with
// `sent_at` NULL, and nothing here emails anybody. The client portal shows only
// requests WITH a `sent_at`, which only the separate send route stamps on a
// confirmed send - so a request raised here is one the client cannot see yet.
// Nothing here touches QuickBooks: a request is an ask, and the money that
// settles it is a client_payment recorded elsewhere.
//
// The amount for a stage is recomputed HERE from the estimate rather than
// trusted from the caller. A number the client is about to be asked for must
// come from the quote they agreed, not from whatever the page last rendered -
// the estimate total can change between the page loading and the button being
// pressed.
// ─────────────────────────────────────────────────────────────────────────────

export async function createPaymentRequest(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const stageIndex = Number.isInteger(body?.stage_index) ? Number(body.stage_index) : null

  let label: string
  let amount: number
  let dueHint: string | null = null

  if (stageIndex != null) {
    const { data: project } = await db.from('projects').select('payment_stages, quote_total').eq('id', projectId).single()
    const stages = resolveStages((project as any)?.payment_stages, (project as any)?.quote_total)
    const stage = stages.find(s => s.index === stageIndex)
    if (!stage) return { status: 404, body: { error: 'That payment stage is no longer on the estimate.' } }
    if (!isRequestable(stage)) {
      return { status: 400, body: { error: 'That stage has no amount yet - set an estimate total, or type an amount instead.' } }
    }
    label = stage.label
    amount = stage.amount!
    dueHint = stage.dueHint
  } else {
    label = String(body?.label ?? '').trim() || 'Deposit'
    dueHint = typeof body?.due_hint === 'string' ? body.due_hint.trim() || null : null

    if (body?.percent != null && String(body.percent).trim() !== '') {
      // A percentage is resolved against the estimate HERE, never taken as a
      // figure from the browser. The client is about to be asked for this
      // number; it has to come from the quote, not from what a page happened
      // to render before the estimate was last edited.
      const { data: project } = await db.from('projects').select('quote_total').eq('id', projectId).single()
      // percent() keeps the sign and then judges it. The old line stripped
      // the minus with the currency symbols, so -10% arrived as 10%.
      const checked = percent(body.percent)
      if (!checked.ok) {
        return { status: 400, body: { error: checked.error } }
      }
      const pct = checked.value
      const resolved = percentOfTotal(pct, (project as any)?.quote_total)
      if (resolved == null) {
        return {
          status: 400,
          body: {
            error: `${pct}% of what? This job's estimate has no total yet - set one on the Estimate tab, or ask for a dollar amount.`,
          },
        }
      }
      amount = resolved
      // Say so on the request itself, so a month later it is obvious where the
      // figure came from and it can be checked against the quote.
      if (!/%/.test(label)) label = `${label} (${pct}%)`
    } else {
      // THE BUG THIS FIXES. This line used to strip everything that was not a
      // digit or a dot - including the minus - and only THEN ask whether the
      // amount was positive. Asking a client for -$500 raised a request for
      // $500. The guard below was always correct; it never saw a negative,
      // because the clean above had already turned it into one.
      const checked = money(body?.amount)
      if (!checked.ok) {
        return { status: 400, body: { error: checked.error } }
      }
      amount = checked.value
    }
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const creatorName: string | null = (profile as any)?.full_name ?? null

  const { data, error } = await db.from('client_payment_requests').insert({
    project_id: projectId,
    label,
    amount,
    due_hint: dueHint,
    stage_index: stageIndex,
    // Null stays null: an unknown name is not "via Claude" either.
    created_by: creatorName == null ? null : withVia(creatorName, via),
  }).select().single()

  if (error) {
    // The partial unique index. Asking twice for the same stage is a
    // double-click, not an intention.
    if ((error as any).code === '23505') {
      return { status: 409, body: { error: 'You have already asked for that stage and it is still outstanding.' } }
    }
    return { status: 500, body: { error: friendlyDbError(error) } }
  }

  return { status: 200, body: { request: data } }
}
