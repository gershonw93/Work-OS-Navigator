import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A sign-up link for a pending invite, to hand over by any means you like.
 *
 * WHY THIS EXISTS. Team invites are sent by Supabase Auth, not by lib/email.ts,
 * and `inviteUserByEmail` REFUSES an address that already has an auth user -
 * which every previously-invited address does, because the first invite created
 * one. So "Resend" could never work for the case people actually use it for:
 * the invite that did not arrive the first time. It reported success anyway
 * until #348, and honestly reports doing nothing now.
 *
 * A link you can copy sidesteps all of it. Paste it into your own email, a
 * text, or a chat - the same escape hatch the client portal has had since
 * share-portal-button, for the same reason: delivery is the least reliable part
 * of any flow that depends on it, and the product should not be stuck when it
 * fails.
 *
 * TYPE MATTERS. `invite` is refused for an existing user, so this falls back to
 * `magiclink`, which is not refused. Both land on /auth/callback and both sign
 * the person in - the difference is only which one Supabase will mint today.
 *
 * THIS LINK SIGNS SOMEBODY IN. It is a credential, not a reference. Hence:
 * admin only, same company as the invite, and the response is never cached.
 */
export async function POST(
  request: Request,
  { params }: { params: { inviteId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin of the same company as the invite - the identical check the DELETE
  // beside this one makes. Anything less and any signed-in user could mint a
  // sign-in link for anybody who happens to have a pending invite.
  const { data: profile } = await db
    .from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: invite } = await db
    .from('company_invites')
    .select('company_id, email')
    .eq('id', params.inviteId)
    .single()

  if (!invite || invite.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // APP url, not SITE url - the marketing domain cannot finish a sign-in.
  const origin = (() => { try { return new URL(request.url).origin } catch { return null } })()
  const redirectTo = `${appOrigin(origin)}/auth/callback`

  const mint = (type: 'invite' | 'magiclink') =>
    db.auth.admin.generateLink({
      type,
      email: invite.email,
      options: { redirectTo },
    })

  // Try invite first: it is the right type for somebody who has never signed
  // in, and it carries the invite semantics. If that address already has a
  // user - the usual case here, and the whole reason this route exists - fall
  // back to a magic link, which is not refused.
  let { data, error } = await mint('invite')
  if (error) {
    const retry = await mint('magiclink')
    data = retry.data
    error = retry.error
  }

  const link = (data as any)?.properties?.action_link
  if (error || !link) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create a link for this invite.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { link, email: invite.email },
    // A sign-in link has no business in a shared cache.
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
