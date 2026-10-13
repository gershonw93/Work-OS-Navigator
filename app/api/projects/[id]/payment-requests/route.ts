import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveStages } from '@/lib/payment-stages'
import { createPaymentRequest } from '@/lib/writes/payment-request'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

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
  // ASKING THE CLIENT FOR MONEY IS `payments: edit`, AND IT IS THE GC'S JOB.
  // This checked only "are you signed in", so any account holding a project
  // id - a field worker, an invited sub - could raise a request against a
  // job's client. `requirePermission` brings the billing lock with it, and
  // `ownedProject` keeps a sub on the job out: the client is the GC's.
  const db = admin()
  const gate = await requirePermission(db, request, 'payments', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const user = { id: gate.actor.userId }

  const body = await request.json().catch(() => ({} as any))

  // Everything after the sign-in check is `createPaymentRequest`, which Claude's MCP server calls too.
  const result = await createPaymentRequest(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}
