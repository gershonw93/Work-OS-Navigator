import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

// ─────────────────────────────────────────────────────────────────────────────
// The client portal link: read it, create one, or replace one.
//
// THE HOLE. Every route in this family checked one thing - are you signed in -
// and nothing else. No permission, no company. So any account with a project id
// could read the link that shows that job's progress, selections and the
// invoices the GC has sent their client, and POST could MINT A NEW ONE, cutting
// off a client who was using the old link. A subcontractor invited to the job
// had exactly as much access to it as the GC.
//
// Two questions now, and they are different questions:
//
//   `client-portal`  the ability, remappable per company. `view` is read the
//                    link (seeing it IS the power - you can copy it), `create`
//                    is bring one into existence, `edit` is REGENERATE, which
//                    destroys the one in the client's hands.
//   ownedProject     whose job it is. `requirePermission` deliberately does not
//                    ask, because subs legitimately write to jobs they do not
//                    own - but not this. The permission map says `read_only`
//                    (the vendor role) gets nothing here; this is the half that
//                    survives a company remapping its defaults.
//
// AND MINTING IS NOT THE SAME ACT AS CREATING. This route used to overwrite
// whatever was there, unconditionally, so the only thing standing between a
// live client link and oblivion was a confirmation dialog in one of the two
// callers. A regenerate now has to say `regenerate: true` AND carry `edit`;
// without the flag, a job that already has a link gets its existing one back.
// ─────────────────────────────────────────────────────────────────────────────

function mint(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create the link, or - with `regenerate: true` - replace it.
 *
 * Replacing is destructive: every link already handed to a client stops
 * working. That is the whole point of having it, for a link that has gone
 * somewhere it should not have, which is why it is a separate permission and a
 * deliberate flag rather than a side effect of pressing the button twice.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()

  // `view` first, so somebody with no business here is told that before
  // anything else is worked out.
  const gate = await requirePermission(db, request, 'client-portal', 'view')
  if (denied(gate)) return gate.denied

  const owned = await ownedProject<{ client_portal_token: string | null }>(
    db, gate.actor, params.id, 'client_portal_token',
  )
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  const existing = owned.project.client_portal_token
  const wantsNew = !!(body as any)?.regenerate

  // There is already a link and nobody asked to replace it: hand back the one
  // that exists. A caller racing itself (two tabs, a double press) used to
  // destroy a live link here.
  if (existing && !wantsNew) {
    return NextResponse.json({
      token: existing,
      url: `${appOrigin(request.headers.get('origin'))}/portal/${existing}`,
      created: false,
    })
  }

  // Bringing one into existence and replacing one are different powers.
  const action = existing ? 'edit' : 'create'
  const second = await requirePermission(db, request, 'client-portal', action)
  if (denied(second)) return second.denied

  const portalToken = mint()
  const { error } = await db
    .from('projects')
    .update({ client_portal_token: portalToken })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    {
      token: portalToken,
      url: `${appOrigin(request.headers.get('origin'))}/portal/${portalToken}`,
      created: true,
      replaced: !!existing,
    },
    { status: 201 },
  )
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()

  const gate = await requirePermission(db, request, 'client-portal', 'view')
  if (denied(gate)) return gate.denied

  const owned = await ownedProject<{
    client_portal_token: string | null
    customer_id: string | null
    client: string | null
  }>(db, gate.actor, params.id, 'client_portal_token, customer_id, client')
  if ('denied' in owned) return owned.denied

  const project = owned.project

  // The client's address, so the Send box arrives pre-filled instead of asking
  // for something the app already knows. Best-effort - not knowing it just
  // means an empty field.
  let clientEmail: string | null = null
  if (project.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', project.customer_id).maybeSingle()
    clientEmail = (c as any)?.email ?? null
  }

  if (!project.client_portal_token) {
    return NextResponse.json({ url: null, clientEmail, clientName: project.client ?? null })
  }

  return NextResponse.json({
    token: project.client_portal_token,
    url: `${appOrigin(request.headers.get('origin'))}/portal/${project.client_portal_token}`,
    clientEmail,
    clientName: project.client ?? null,
  })
}
