import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { messageProblem } from '@/lib/bid-thread'
import { postMessage, readThread } from '@/lib/bid-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Params = { params: { id: string; reqId: string; inviteId: string } }

/**
 * The GC's side of one quote conversation.
 *
 * Asks BOTH questions. The permission, because a quote request is buyout work
 * (`request-quotes`), and the ownership, because a sub invited onto this job
 * holds `projects: view` too and must not read the GC's conversations with the
 * other subs pricing against them. And the invite has to belong to this
 * request on this job, or the path is a way to reach any thread by id.
 */
async function resolve(request: Request, { params }: Params, action: 'view' | 'edit') {
  const db = admin()
  const gate = await requirePermission(db, request, 'request-quotes', action)
  if (denied(gate)) return { denied: gate.denied }
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return { denied: owned.denied }

  const { data: invite } = await db
    .from('bid_invites')
    .select('id, token, bid_request_id, vendor_company_id, vendor_email, vendor_name, bid_requests!inner ( project_id )')
    .eq('id', params.inviteId)
    .eq('bid_request_id', params.reqId)
    .maybeSingle()
  if (!invite || (invite as any).bid_requests?.project_id !== params.id) {
    return { denied: NextResponse.json({ error: 'That invite no longer exists.' }, { status: 404 }) }
  }
  return { db, actor: gate.actor, invite }
}

export async function GET(request: Request, ctx: Params) {
  const r = await resolve(request, ctx, 'view')
  if ('denied' in r) return r.denied
  const thread = await readThread(r.db, r.invite.id)
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
  // "Dana at Fairview Builders" - the sub is talking to a company, and the
  // company is the part they recognise.
  const name = [(me as any)?.full_name, (company as any)?.name].filter(Boolean).join(' at ') || null

  const out = await postMessage({
    db: r.db, invite: r.invite as any, side: 'gc',
    authorId: r.actor.userId, authorName: name, body,
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message })
}
