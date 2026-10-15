import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { maskEmail } from '@/lib/portal-login'
import { clientEmailFor, signedInClient } from '@/lib/portal-login-server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Is the person on this page signed in as the job's client? The page asks
 * before it offers Approve, so the answer is a sign-in box rather than a
 * refusal after the press. Only a MASKED address goes back: the link holder
 * learns enough to recognise their inbox, not to harvest it.
 */
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects').select('id, customer_id').eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })
  const onFile = await clientEmailFor(db, (project as any).customer_id)
  const who = await signedInClient(db, request, onFile)
  return NextResponse.json({
    signedIn: who.ok,
    reason: who.ok ? null : who.reason,
    emailOnFile: onFile ? maskEmail(onFile) : null,
  })
}
