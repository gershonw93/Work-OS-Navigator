import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { clientAuthor, clientRateProblem, messageProblem } from '@/lib/selection-thread'
import { postSelectionMessage } from '@/lib/selection-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client asks a question about one selection, from their portal link.
 *
 * The TOKEN is the whole credential, exactly as for picking an option on the
 * same page - so the selection has to belong to the token's job, and the link
 * is capped per hour (`clientRateProblem`) because a forwarded link must not
 * become a way to fill the GC's inbox. The cap's read FAILS CLOSED: an unread
 * limit on a public endpoint is no limit.
 *
 * Reading the thread needs no route of its own: the portal's selections GET
 * carries each selection's messages.
 */
export async function POST(request: Request, { params }: { params: { token: string; selId: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects')
    .select('id, name, client, gc_company_id, customer_id, client_portal_token')
    .eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const { data: sel } = await db.from('project_selections')
    .select('id, item, location').eq('id', params.selId).eq('project_id', project.id).maybeSingle()
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  const payload = await request.json().catch(() => ({} as any))
  const problem = messageProblem(payload?.body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { count, error: countErr } = await db.from('selection_messages')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id).eq('side', 'client')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if (countErr) {
    console.error('[selection-thread] rate read failed', countErr)
    return NextResponse.json({ error: 'Could not send that just now. Try again in a minute.' }, { status: 503 })
  }
  const tooMany = clientRateProblem(count ?? 0)
  if (tooMany) return NextResponse.json({ error: tooMany }, { status: 429 })

  const out = await postSelectionMessage({
    db, project: project as any, selection: sel as any, side: 'client',
    authorId: null, authorName: clientAuthor(payload?.name, (project as any).client),
    body: payload.body, origin: appOrigin(request.headers.get('origin')),
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message })
}
