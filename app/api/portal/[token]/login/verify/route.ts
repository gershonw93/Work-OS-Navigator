import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { codeProblem, normalizeCode } from '@/lib/portal-login'
import { clientEmailFor, codeMatches } from '@/lib/portal-login-server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Check the client's code and start their session.
 *
 * A right code is CLAIMED by one conditional update (`used_at IS NULL`) before
 * anything else, so two tabs cannot both spend it. A wrong one counts against
 * MAX_ATTEMPTS. Then: the login for that address exists (made here the first
 * time, `email_confirm` because the code just proved the inbox, marked
 * `portal_client` in app metadata the user cannot edit) and a one-use sign-in
 * token is handed back for the page to exchange for a session. No password,
 * no profile, no company: this login can approve on this page and nothing else
 * in SyteNav, because every app route asks for a profile it does not have.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects').select('id, customer_id').eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })
  const email = await clientEmailFor(db, (project as any).customer_id)
  if (!email) return NextResponse.json({ error: 'There is no email address on file for you.' }, { status: 409 })

  const body = await request.json().catch(() => ({} as any))
  const code = normalizeCode(body?.code)
  if (!code) return NextResponse.json({ error: 'Type the six digits from the email.' }, { status: 400 })

  const { data: row } = await db.from('portal_login_codes')
    .select('id, code_hash, expires_at, attempts, used_at')
    .eq('project_id', (project as any).id)
    .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()
  const problem = codeProblem(row as any, new Date())
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  if (!codeMatches(code, (project as any).id, email, (row as any).code_hash)) {
    await db.from('portal_login_codes').update({ attempts: (row as any).attempts + 1 }).eq('id', (row as any).id)
    return NextResponse.json({ error: 'That code is not right. Check the email and try again.' }, { status: 400 })
  }

  const { data: claimed } = await db.from('portal_login_codes').update({ used_at: new Date().toISOString() })
    .eq('id', (row as any).id).is('used_at', null).select('id').maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'That code has been used. Ask for a new one.' }, { status: 400 })

  // The login, made the first time. An address that already has one (the
  // client signed in before, or uses SyteNav for something else) keeps it.
  const { error: makeErr } = await db.auth.admin.createUser({
    email, email_confirm: true, app_metadata: { portal_client: true },
  })
  if (makeErr && !/already|registered|exists/i.test(makeErr.message)) {
    console.error('[portal-login] createUser failed', makeErr.message)
    return NextResponse.json({ error: 'Could not sign you in. Try again.' }, { status: 500 })
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = (link as any)?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    console.error('[portal-login] generateLink failed', linkErr?.message)
    return NextResponse.json({ error: 'Could not sign you in. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ tokenHash })
}
