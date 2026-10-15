import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendEmail, portalLoginCodeEmail } from '@/lib/email'
import { CODE_TTL_MINUTES, codeRateProblem, maskEmail } from '@/lib/portal-login'
import { clientEmailFor, hashCode, makeCode } from '@/lib/portal-login-server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Send the job's client a six-digit sign-in code.
 *
 * ALWAYS to the address on the customer record, NEVER one from the body - the
 * whole point is proving the person reads that inbox, and an address taken
 * from the request would prove only that they can type one. Capped per address
 * per hour, and a cap that cannot be read REFUSES (an unread limit on a public
 * endpoint is no limit). Only the hash is stored, written BEFORE the send.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects').select('id, name, customer_id').eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const email = await clientEmailFor(db, (project as any).customer_id)
  if (!email) {
    return NextResponse.json({ error: 'There is no email address on file for you yet - ask your contractor to add it, then you can sign in here.' }, { status: 409 })
  }

  const { count, error: countErr } = await db.from('portal_login_codes')
    .select('id', { count: 'exact', head: true })
    .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if (countErr) {
    console.error('[portal-login] rate read failed', countErr)
    return NextResponse.json({ error: 'Could not send a code just now. Try again in a minute.' }, { status: 503 })
  }
  const tooMany = codeRateProblem(count ?? 0)
  if (tooMany) return NextResponse.json({ error: tooMany }, { status: 429 })

  const code = makeCode()
  const { error: insErr } = await db.from('portal_login_codes').insert({
    project_id: (project as any).id,
    email,
    code_hash: hashCode(code, (project as any).id, email),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
  })
  if (insErr) {
    console.error('[portal-login] code insert failed', insErr)
    return NextResponse.json({ error: 'Could not send a code. Try again.' }, { status: 500 })
  }

  const sent = await sendEmail({ to: email, ...portalLoginCodeEmail({ code, projectName: (project as any).name, minutes: CODE_TTL_MINUTES }) })
  if (!sent.sent) {
    console.error('[portal-login] code email not sent', { reason: sent.reason })
    return NextResponse.json({ error: 'We could not email your code. Try again, or ask your contractor.' }, { status: 502 })
  }
  return NextResponse.json({ sent: true, to: maskEmail(email) })
}
