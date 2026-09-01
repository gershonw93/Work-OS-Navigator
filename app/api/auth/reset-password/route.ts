import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { emailConfig, isEmailAddress, passwordResetEmail, sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Matches the "minimum interval per user" Supabase's own mailer enforced. */
const THROTTLE_SECONDS = 60

/**
 * Email somebody a password reset link, through our SendGrid.
 *
 * WHY IT MOVED. Reset was one of the last two flows still asking Supabase Auth
 * to send, which needs custom SMTP configured in the Supabase dashboard - a
 * second mail setup, separate from SENDGRID_API_KEY, that nothing in this repo
 * can see or test. Team invites moved in #351 for the same reason. This is the
 * flow where a failure costs the most: an invite that does not arrive can be
 * re-sent by an admin, but somebody locked out of their account has no way in
 * at all, and no way to tell anybody.
 *
 * TWO THINGS THIS ENDPOINT MUST GET RIGHT, because it is unauthenticated and
 * it sends email:
 *
 * 1. IT NEVER SAYS WHETHER AN ACCOUNT EXISTS. Every path returns the same
 *    `{ ok: true }` - unknown address, throttled, SendGrid down, link refused.
 *    An endpoint that answers differently for a real address is a way to test
 *    whether somebody uses this product, one address at a time. That is why
 *    the reasons go to the server log and not into the response.
 *
 * 2. IT IS THROTTLED, per address. Supabase's mailer came with that; taking
 *    the flow over without replacing it would hand out a way to mail-bomb any
 *    address somebody can guess, on our SendGrid quota. The claim is written
 *    BEFORE the send, so two requests arriving together cannot both pass the
 *    check and both send - the same check-then-act problem the QuickBooks push
 *    hit in #317.
 */
export async function POST(request: Request) {
  // One answer, always. Constructed here so no branch below can accidentally
  // return something more specific.
  const answer = () => NextResponse.json({ ok: true })

  let email = ''
  try {
    const body = await request.json()
    email = String(body?.email ?? '').trim().toLowerCase()
  } catch {
    return answer()
  }
  if (!isEmailAddress(email)) return answer()

  const db = admin()

  const origin = (() => { try { return new URL(request.url).origin } catch { return null } })()
  // The APP host. A reset link pointing at the marketing site cannot complete.
  const redirectTo = `${appOrigin(origin)}/reset-password`

  /**
   * Hand the send back to Supabase, whose mailer carries its own per-user
   * limit. Used when we cannot throttle ourselves, and when there is no
   * SendGrid configured at all.
   */
  const supabaseSends = async (why: string) => {
    console.error(`[reset-password] falling back to Supabase: ${why}`)
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) console.error('[reset-password] supabase fallback failed:', error.message)
    return answer()
  }

  const { data: prior, error: throttleError } = await db
    .from('password_reset_throttle')
    .select('last_sent_at')
    .eq('email', email)
    .maybeSingle()

  // No throttle table means migration 093 has not been applied. Sending anyway
  // would be an unauthenticated, unlimited mailer pointed at any address
  // somebody can guess - so this does NOT quietly carry on. Supabase's mailer
  // is rate-limited, so the flow keeps working while being someone else's
  // problem to throttle.
  if (throttleError) return supabaseSends(`throttle unavailable (${throttleError.message})`)

  if (prior?.last_sent_at) {
    const since = Date.now() - new Date(prior.last_sent_at).getTime()
    if (since < THROTTLE_SECONDS * 1000) return answer()
  }

  // Claim first. A send that fails still holds the address for a minute, which
  // is the correct trade: the alternative is that a broken send becomes an
  // unlimited one.
  const { error: claimError } = await db
    .from('password_reset_throttle')
    .upsert({ email, last_sent_at: new Date().toISOString() }, { onConflict: 'email' })
  if (claimError) return supabaseSends(`could not record the throttle (${claimError.message})`)

  if (!emailConfig().configured) return supabaseSends('SENDGRID_API_KEY is not set')

  // generateLink returns the link and sends nothing, which is exactly the half
  // we want - the sending is ours.
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  const link = (data as any)?.properties?.action_link
  if (error || !link) {
    // Expected for an address with no account. Logged, never answered - see (1).
    console.error('[reset-password] could not mint a link:', error?.message ?? 'no action_link')
    return answer()
  }

  const { subject, text, html } = passwordResetEmail({ resetUrl: link })
  const result = await sendEmail({ to: email, subject, text, html })
  if (!result.sent) {
    // SendGrid's own words, in the server log where an operator can read them.
    // This is the diagnosis that was missing while invites were failing.
    console.error('[reset-password] send failed:', result.reason, result.detail ?? '')
  }

  return answer()
}
