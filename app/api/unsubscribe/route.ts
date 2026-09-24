import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyUnsubscribe } from '@/lib/unsubscribe-token'
import { normaliseEmail } from '@/lib/campaign-audience'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The way out. PUBLIC ON PURPOSE - there is no session in an inbox.
//
// THE TOKEN IS THE AUTHORISATION, and it is bound to the address, so a
// forwarded email cannot take somebody else off the list. Without that check
// this is an endpoint that unsubscribes anybody whose address you can guess.
//
// IT IS ALSO WHAT GMAIL CALLS. `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
// means the mailbox provider POSTs here itself when somebody presses the button
// beside the sender name - with no cookies, no referer and a form body we do
// not read. So the answer must not depend on anything but the URL.
//
// IT STOPS BROADCASTS ONLY. Everything about somebody's own account - an
// invoice, a bid request, a password reset - still goes, because `sendEmail`
// never consults this table and must never start. The page says so in as many
// words, and so does the footer of every campaign: silencing "your trial ends
// tomorrow" because somebody opted out of a newsletter is how an account dies
// quietly.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const url = new URL(request.url)
  // Gmail posts to the URL from the header, so the parameters are on the query
  // string. A body is accepted too, for our own page.
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const email = normaliseEmail(String(body?.email ?? url.searchParams.get('e') ?? ''))
  const token = String(body?.token ?? url.searchParams.get('t') ?? '')

  if (!email || !verifyUnsubscribe(email, token)) {
    return NextResponse.json({ error: 'That link is not valid.' }, { status: 400 })
  }

  const { error } = await admin().from('email_suppressions').upsert({
    email,
    reason: 'unsubscribed',
    source: 'link',
  }, { onConflict: 'email' })

  if (error) {
    console.error('[unsubscribe] could not record it', error.message)
    // A FAILURE HERE IS NOT A "DONE". Telling somebody they are unsubscribed
    // and then mailing them again is worse than asking them to try once more.
    return NextResponse.json({ error: 'That did not save. Try again, or reply to the email.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** GET is the page's own check, so it can say the link is bad before the tap. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const email = normaliseEmail(url.searchParams.get('e') ?? '')
  const token = url.searchParams.get('t') ?? ''
  return NextResponse.json({ valid: !!email && verifyUnsubscribe(email, token), email })
}
