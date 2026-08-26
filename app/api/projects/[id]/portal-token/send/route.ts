import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { clientPortalEmail, isEmailAddress, sendEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Email the client their portal link.
 *
 * Uses the token that already exists and REFUSES if there is not one, rather
 * than minting a fresh one on the way out. That distinction matters: minting
 * here would invalidate a link the client may already be using, from the very
 * action whose whole purpose is to give them a working one.
 *
 * Sending is best-effort in the same sense as everywhere else - it reports
 * what happened instead of throwing - but unlike a notification, a failure
 * here is worth telling the user about, because the link is the entire point
 * and copying it by hand is the fallback.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const to = String(body?.to ?? '').trim()
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (!isEmailAddress(to)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }

  const [{ data: project }, { data: me }] = await Promise.all([
    db.from('projects')
      .select('name, client, customer_id, client_portal_token, gc_company_id')
      .eq('id', params.id).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
  ])

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project.client_portal_token) {
    return NextResponse.json({ error: 'No share link yet - close and reopen this dialog.' }, { status: 400 })
  }

  const { data: company } = project.gc_company_id
    ? await db.from('companies').select('name').eq('id', project.gc_company_id).maybeSingle()
    : { data: null }

  const { subject, text, html } = clientPortalEmail({
    clientName: project.client,
    projectName: project.name,
    senderName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    portalUrl: `${appOrigin(request.headers.get('origin'))}/portal/${project.client_portal_token}`,
    note,
  })

  const result = await sendEmail({ to, subject, text, html })
  if (!result.sent) {
    return NextResponse.json({
      sent: false,
      reason: result.reason,
      error: result.reason === 'not_configured'
        ? 'Email sending is not set up yet. Copy the link and send it yourself.'
        : 'Could not send that email. Copy the link and send it yourself.',
    }, { status: 200 })
  }

  return NextResponse.json({ sent: true, to })
}
