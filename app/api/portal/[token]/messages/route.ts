import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { clientAuthor, clientRateProblem, messageProblem, parseSubject } from '@/lib/client-thread'
import { postClientMessage, readClientThread, resolveSubject, THREAD_PROJECT_COLS } from '@/lib/client-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client's side of every question they ask from their portal link -
 * a selection, an invoice, a payment request, or the job itself.
 *
 * The TOKEN is the whole credential, exactly as for everything else on the
 * link. So the record has to be on the token's job AND be one the link shows
 * them (`resolveSubject(..., forClient)` - no draft invoice, no unsent request),
 * and posting is capped per hour, because a forwarded link must not become a
 * way to fill the GC's inbox. The cap's read FAILS CLOSED: an unread limit on a
 * public endpoint is no limit.
 */
async function projectFor(db: ReturnType<typeof admin>, token: string) {
  const { data } = await db.from('projects').select(THREAD_PROJECT_COLS).eq('client_portal_token', token).maybeSingle()
  return data as any
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const project = await projectFor(db, params.token)
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })
  const url = new URL(request.url)
  const what = parseSubject(url.searchParams.get('subject'), url.searchParams.get('id'))
  if (!what) return NextResponse.json({ error: 'Which item?' }, { status: 400 })
  if (!(await resolveSubject(db, project.id, what.subject, what.id, true))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const thread = await readClientThread(db, project.id, what.subject, what.id)
  if ('error' in thread) return NextResponse.json({ error: thread.error }, { status: 500 })
  return NextResponse.json({ messages: thread.messages })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const project = await projectFor(db, params.token)
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const payload = await request.json().catch(() => ({} as any))
  const what = parseSubject(payload?.subject, payload?.id)
  if (!what) return NextResponse.json({ error: 'Which item?' }, { status: 400 })
  const problem = messageProblem(payload?.body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const subject = await resolveSubject(db, project.id, what.subject, what.id, true)
  if (!subject) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count, error: countErr } = await db.from('client_messages')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id).eq('side', 'client')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if (countErr) {
    console.error('[client-thread] rate read failed', countErr)
    return NextResponse.json({ error: 'Could not send that just now. Try again in a minute.' }, { status: 503 })
  }
  const tooMany = clientRateProblem(count ?? 0)
  if (tooMany) return NextResponse.json({ error: tooMany }, { status: 429 })

  const out = await postClientMessage({
    db, project, subject: what.subject, subjectId: what.id, label: subject.label, side: 'client',
    authorId: null, authorName: clientAuthor(payload?.name, project.client),
    body: payload.body, origin: appOrigin(request.headers.get('origin')),
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message })
}
