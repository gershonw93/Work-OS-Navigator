import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

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
 * `view` and the company check, same as the rest of the family: you can only
 * have copied a link you were allowed to see, and only on a job that is yours.
 * (This route shipped matching its siblings' signed-in-only gate, on the
 * argument that a heavier gate on a timestamp guards nothing while the mint
 * next door stays open. The mint is gated now, so this is too.)
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()

  const gate = await requirePermission(db, request, 'client-portal', 'view')
  if (denied(gate)) return gate.denied

  // There has to BE a link for one to have been copied. Without this a stray
  // call would mark a job shared that has nothing to share.
  const owned = await ownedProject<{ client_portal_token: string | null }>(
    db, gate.actor, params.id, 'client_portal_token',
  )
  if ('denied' in owned) return owned.denied
  if (!owned.project.client_portal_token) {
    return NextResponse.json({ error: 'There is no share link on this job yet.' }, { status: 400 })
  }

  const { error } = await db.from('projects')
    .update({ portal_shared_at: new Date().toISOString(), portal_shared_how: 'copy' })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
