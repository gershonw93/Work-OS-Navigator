import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { canUseThread, messageProblem } from '@/lib/bid-thread'
import { postMessage, readThread } from '@/lib/bid-thread-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const INVITE_COLS = 'id, token, bid_request_id, vendor_company_id, vendor_email, vendor_name'

/**
 * The sub's side of the conversation about one quote request.
 *
 * The LINK is not enough here, unlike pricing. The link proves somebody was
 * sent it; a conversation needs a person to tell when the answer comes back.
 * So every call needs a signed-in account that belongs to the company the
 * invite went to, or is the address it went to (`canUseThread`). With no
 * session the answer is `needsAccount`, which is what the page turns into
 * "Create a free account".
 */
async function resolve(request: Request, token: string) {
  const db = admin()
  const { data: invite } = await db.from('bid_invites').select(INVITE_COLS).eq('token', token).maybeSingle()
  if (!invite) return { denied: NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 }) }

  const bearer = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!bearer) return { denied: NextResponse.json({ needsAccount: true }, { status: 401 }) }
  const { data: { user } } = await db.auth.getUser(bearer)
  if (!user) return { denied: NextResponse.json({ needsAccount: true }, { status: 401 }) }

  const { data: profile } = await db.from('profiles').select('company_id, full_name').eq('id', user.id).maybeSingle()
  if (!canUseThread(invite, { companyId: profile?.company_id ?? null, email: user.email ?? null })) {
    return {
      denied: NextResponse.json({
        wrongAccount: true,
        error: `You are signed in as ${user.email}, and this request was sent to ${invite.vendor_name || invite.vendor_email || 'somebody else'}. Sign in with the account it was sent to.`,
      }, { status: 403 }),
    }
  }
  return { db, invite, user, name: profile?.full_name || user.email || null }
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const r = await resolve(request, params.token)
  if ('denied' in r) return r.denied
  const thread = await readThread(r.db, r.invite.id)
  if ('error' in thread) return NextResponse.json({ error: thread.error }, { status: 500 })
  return NextResponse.json({ messages: thread.messages, me: r.name })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const r = await resolve(request, params.token)
  if ('denied' in r) return r.denied

  const { body } = await request.json().catch(() => ({} as any))
  const problem = messageProblem(body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const out = await postMessage({
    db: r.db, invite: r.invite, side: 'sub',
    authorId: r.user.id, authorName: r.name, body,
  })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 500 })
  return NextResponse.json({ message: out.message })
}
