import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Record that the client portal link was handed over by COPYING it.
 *
 * Copying the link out of the share dialog is how most people share it - into
 * a text, into their own email. It is as much a share as pressing Send, and it
 * used to leave no trace at all, so the setup checklist could not tell a shared
 * portal from an untouched one.
 *
 * Why this is not inferred from `client_portal_token`: the dialog MINTS a token
 * when there is not one, on open. A token therefore proves somebody looked, not
 * that a client was given anything - "a default is a claim", one table over.
 * Only the code that actually hands the link over writes these columns: this
 * route for a copy, and the send route for a confirmed email.
 *
 * Gated the same way as the sibling portal-token routes - signed in. It writes
 * one timestamp about a link the caller can already read and re-mint from the
 * route next door, so a heavier gate here would guard nothing while leaving the
 * stronger door open. Tightening the whole portal-token family is its own job
 * and is in BACKLOG.md.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // There has to BE a link for one to have been copied. Without this a stray
  // call would mark a job shared that has nothing to share.
  const { data: project } = await db.from('projects')
    .select('client_portal_token').eq('id', params.id).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!(project as any).client_portal_token) {
    return NextResponse.json({ error: 'There is no share link on this job yet.' }, { status: 400 })
  }

  const { error } = await db.from('projects')
    .update({ portal_shared_at: new Date().toISOString(), portal_shared_how: 'copy' })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
