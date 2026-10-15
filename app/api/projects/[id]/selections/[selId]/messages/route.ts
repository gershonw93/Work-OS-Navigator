import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { appOrigin } from '@/lib/app-url'
import { messageProblem } from '@/lib/selection-thread'
import { postSelectionMessage, readSelectionThread } from '@/lib/selection-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Params = { params: { id: string; selId: string } }

/**
 * The GC's side of a client's selection thread.
 *
 * Asks BOTH questions: the permission (`selections`), and whose job it is
 * (`ownedProject`) - these are the GC's client's words, and an invited sub on
 * the job holds `projects: view` too. And the selection has to be on this job,
 * or the path is a way to reach any thread by id.
 */
async function resolve(request: Request, { params }: Params, action: 'view' | 'edit') {
  const db = admin()
  const g = await requirePermission(db, request, 'selections', action)
  if (denied(g)) return { denied: g.denied }
  const owned = await ownedProject<{ id: string; name: string | null; client: string | null; gc_company_id: string | null; customer_id: string | null; client_portal_token: string | null }>(
    db, g.actor, params.id, 'id, name, client, gc_company_id, customer_id, client_portal_token')
  if ('denied' in owned) return { denied: owned.denied }
  const { data: sel } = await db.from('project_selections')
    .select('id, item, location').eq('id', params.selId).eq('project_id', params.id).maybeSingle()
  if (!sel) return { denied: NextResponse.json({ error: 'Selection not found' }, { status: 404 }) }
  return { db, actor: g.actor, project: owned.project, sel }
}

export async function GET(request: Request, ctx: Params) {
  const r = await resolve(request, ctx, 'view')
  if ('denied' in r) return r.denied
  const thread = await readSelectionThread(r.db, r.sel.id)
  if ('error' in thread) return NextResponse.json({ error: thread.error }, { status: 500 })
  return NextResponse.json({ messages: thread.messages })
}

export async function POST(request: Request, ctx: Params) {
  const r = await resolve(request, ctx, 'edit')
  if ('denied' in r) return r.denied

  const { body } = await request.json().catch(() => ({} as any))
  const problem = messageProblem(body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const [{ data: me }, { data: company }] = await Promise.all([
    r.db.from('profiles').select('full_name').eq('id', r.actor.userId).maybeSingle(),
    r.db.from('companies').select('name').eq('id', r.actor.companyId).maybeSingle(),
  ])
  // "Dana at Fairview Builders" - the client knows the company better than the person.
  const name = [(me as any)?.full_name, (company as any)?.name].filter(Boolean).join(' at ') || null

  const out = await postSelectionMessage({
    db: r.db, project: r.project as any, selection: r.sel as any, side: 'gc',
    authorId: r.actor.userId, authorName: name, body,
    origin: appOrigin(request.headers.get('origin')),
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message, emailed: out.emailed })
}
