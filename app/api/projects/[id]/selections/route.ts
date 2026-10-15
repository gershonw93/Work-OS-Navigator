import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { friendlyDbError } from '@/lib/db-error'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { actorCan } from '@/lib/server-permissions'
import { createSelection } from '@/lib/writes/selection'
import { withLineFinished } from '@/lib/selection-installed-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Who may touch a job's selections board, asked once per handler.
 *
 * Every handler here used to ask only "is somebody signed in", so a sub
 * invited onto the job - or any account holding the id - could reseed the
 * board or read the client's portal token off the GET. `selections` is the
 * permission; the job has to be the caller's company's, because these are the
 * GC's client's decisions, not something a trade on the job owns.
 */
async function gate(request: Request, projectId: string, action: 'view' | 'create') {
  const db = admin()
  const g = await requirePermission(db, request, 'selections', action)
  if (denied(g)) return g
  const owned = await ownedProject(db, g.actor, projectId, 'id')
  if ('denied' in owned) return owned
  return { db, actor: g.actor }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const g = await gate(request, params.id, 'view')
  if ('denied' in g) return g.denied
  const { db, actor } = g

  const { data, error } = await db
    .from('project_selections')
    .select('*, selection_options(*)')
    .eq('project_id', params.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  // Pre-migration: say so plainly instead of a 500 the page can't explain.
  if (error && ((error as any).code === '42P01' || /does not exist/i.test(error.message))) {
    return NextResponse.json({ selections: [], budget_lines: [], portal_token: null, needs_migration: true })
  }
  if (error) {
    console.error('[selections] loading the board failed', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  // Budget lines to hang an allowance off, and the portal link so the board can
  // offer "send this to the client" without a second place to look it up.
  const [{ data: lines }, { data: project }, selections] = await Promise.all([
    db.from('budget_line_items').select('id, category, description, budgeted_amount').eq('project_id', params.id).order('sort_order'),
    db.from('projects').select('client_portal_token, client, start_date, type').eq('id', params.id).single(),
    withLineFinished(db, params.id, data ?? []),
  ])

  return NextResponse.json({
    selections,
    budget_lines: lines ?? [],
    // The portal link is its own permission (`client-portal: view` - seeing it
    // IS the power to hand it out). Withheld here rather than merely not shown.
    portal_token: actorCan(actor, 'client-portal', 'view') ? project?.client_portal_token ?? null : null,
    client_name: project?.client ?? null,
    project_start: project?.start_date ?? null,
    // Drives which categories arrive pre-ticked on the seed checklist.
    project_type: project?.type ?? null,
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await gate(request, params.id, 'create')
  if ('denied' in g) return g.denied
  const { db, actor } = g

  const body = await request.json()
  const result = await createSelection(db, { userId: actor.userId, companyId: actor.companyId, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}
