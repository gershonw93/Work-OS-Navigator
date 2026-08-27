import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveStages, isRequestable } from '@/lib/payment-stages'
import { friendlyDbError } from '@/lib/db-error'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return user ? { db, user } : null
}

/**
 * The deposits and stage payments you have asked the client for.
 *
 * Returns the estimate's payment stages alongside the requests, already
 * matched up, because every caller needs both to answer the only question that
 * matters on screen: "which of these have I actually asked for?"
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const a = await auth(request)
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = a

  const [{ data: project }, { data: requests }] = await Promise.all([
    // NOT `client_email` - projects has no such column, and Supabase answers a
    // bad column with data: null for the WHOLE row, so the stage list would
    // have come back empty with no error anywhere. The client's address lives
    // on `customers` and is resolved by /api/projects/[id]/client-email, which
    // ClientInvoices already uses.
    db.from('projects').select('payment_stages, quote_total, client_portal_token, client').eq('id', params.id).single(),
    db.from('client_payment_requests').select('*').eq('project_id', params.id).order('created_at', { ascending: true }),
  ])

  const stages = resolveStages((project as any)?.payment_stages, (project as any)?.quote_total)

  return NextResponse.json({
    stages,
    requests: requests ?? [],
    quoteTotal: (project as any)?.quote_total ?? null,
    clientName: (project as any)?.client ?? null,
    portalToken: (project as any)?.client_portal_token ?? null,
  })
}

/**
 * Raise a request. Either from a quoted stage, or a one-off typed amount.
 *
 * The amount for a stage is recomputed HERE from the estimate rather than
 * trusted from the browser. A number the client is about to be asked for must
 * come from the quote they agreed, not from whatever the page last rendered -
 * the estimate total can change between the page loading and the button being
 * pressed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const a = await auth(request)
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = a

  const body = await request.json().catch(() => ({} as any))
  const stageIndex = Number.isInteger(body?.stage_index) ? Number(body.stage_index) : null

  let label: string
  let amount: number
  let dueHint: string | null = null

  if (stageIndex != null) {
    const { data: project } = await db.from('projects').select('payment_stages, quote_total').eq('id', params.id).single()
    const stages = resolveStages((project as any)?.payment_stages, (project as any)?.quote_total)
    const stage = stages.find(s => s.index === stageIndex)
    if (!stage) return NextResponse.json({ error: 'That payment stage is no longer on the estimate.' }, { status: 404 })
    if (!isRequestable(stage)) {
      return NextResponse.json({ error: 'That stage has no amount yet - set an estimate total, or type an amount instead.' }, { status: 400 })
    }
    label = stage.label
    amount = stage.amount!
    dueHint = stage.dueHint
  } else {
    label = String(body?.label ?? '').trim() || 'Deposit'
    amount = Number(String(body?.amount ?? '').toString().replace(/[^0-9.]/g, ''))
    dueHint = typeof body?.due_hint === 'string' ? body.due_hint.trim() || null : null
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })
    }
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db.from('client_payment_requests').insert({
    project_id: params.id,
    label,
    amount,
    due_hint: dueHint,
    stage_index: stageIndex,
    created_by: (profile as any)?.full_name ?? null,
  }).select().single()

  if (error) {
    // The partial unique index. Asking twice for the same stage is a
    // double-click, not an intention.
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'You have already asked for that stage and it is still outstanding.' }, { status: 409 })
    }
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  return NextResponse.json({ request: data })
}
