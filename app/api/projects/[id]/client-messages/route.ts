import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { appOrigin } from '@/lib/app-url'
import { messageProblem, parseSubject, SUBJECTS, type ClientSubject } from '@/lib/client-thread'
import { postClientMessage, readClientThread, resolveSubject, THREAD_PROJECT_COLS, type ThreadProject } from '@/lib/client-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Params = { params: { id: string } }

/**
 * The GC's side of every client thread on a job.
 *
 * Asks THREE questions, in this order: the permission the SUBJECT names
 * (`selections` for a selection, `payments` for an invoice or a payment
 * request, `client-portal` for the job itself - billing questions must not
 * reach somebody denied Billing), whose job it is (`ownedProject` - an invited
 * sub holds `projects: view` too), and that the record is on this job.
 */
async function resolve(request: Request, { params }: Params, action: 'view' | 'edit', subject: unknown, id: unknown) {
  const what = parseSubject(subject, id)
  if (!what) return { denied: NextResponse.json({ error: 'Which item?' }, { status: 400 }) }
  const db = admin()
  const g = await requirePermission(db, request, SUBJECTS[what.subject].permission, action)
  if (denied(g)) return { denied: g.denied }
  const owned = await ownedProject<ThreadProject & Record<string, unknown>>(db, g.actor, params.id, THREAD_PROJECT_COLS)
  if ('denied' in owned) return { denied: owned.denied }
  const found = await resolveSubject(db, params.id, what.subject, what.id, false)
  if (!found) return { denied: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { db, actor: g.actor, project: owned.project as ThreadProject, subject: what.subject as ClientSubject, subjectId: what.id, label: found.label }
}

export async function GET(request: Request, ctx: Params) {
  const url = new URL(request.url)
  // `item`, NEVER `id`: this route sits under /projects/[id]/, and on Vercel a
  // query parameter named like a path segment is dropped (the platform carries
  // the segment through the query itself). `?id=` therefore never arrived, so
  // every GC thread read answered "Which item?" while the POST - id in the
  // body - and the client's route - no [id] in its path - worked.
  const r = await resolve(request, ctx, 'view', url.searchParams.get('subject'), url.searchParams.get('item'))
  if ('denied' in r) return r.denied
  const thread = await readClientThread(r.db, r.project.id, r.subject, r.subjectId)
  if ('error' in thread) return NextResponse.json({ error: thread.error }, { status: 500 })
  return NextResponse.json({ messages: thread.messages })
}

export async function POST(request: Request, ctx: Params) {
  const payload = await request.json().catch(() => ({} as any))
  const r = await resolve(request, ctx, 'edit', payload?.subject, payload?.id)
  if ('denied' in r) return r.denied
  const problem = messageProblem(payload?.body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const [{ data: me }, { data: company }] = await Promise.all([
    r.db.from('profiles').select('full_name').eq('id', r.actor.userId).maybeSingle(),
    r.db.from('companies').select('name').eq('id', r.actor.companyId).maybeSingle(),
  ])
  // "Dana at Fairview Builders" - the client knows the company better than the person.
  const name = [(me as any)?.full_name, (company as any)?.name].filter(Boolean).join(' at ') || null

  const out = await postClientMessage({
    db: r.db, project: r.project, subject: r.subject, subjectId: r.subjectId, label: r.label, side: 'gc',
    authorId: r.actor.userId, authorName: name, body: payload.body,
    origin: appOrigin(request.headers.get('origin')),
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message, emailed: out.emailed })
}
