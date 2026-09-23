import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { authorizeUrl, googleConfigured, redirectUri } from '@/lib/google-contacts'
import { contactsActor } from '@/lib/google-contacts-actor'

export const runtime = 'nodejs'

// Start the handshake: mint a state row (CSRF + WHO is connecting) and hand
// back the Google authorize URL for the browser to open.
//
// ANYONE WHO CAN SEE THE DIRECTORY MAY CONNECT THEIR OWN ADDRESS BOOK. It used
// to be admin-only because the connection was the company's; now it is the
// person's (migration 117), and what they read stays private to them until
// they file it.
export async function GET(request: Request) {
  if (!googleConfigured()) {
    // A NORMAL STATE, not a crash: the server has no Google credentials yet.
    // Said plainly, because the person reading it can do something about it.
    return NextResponse.json(
      { error: 'Google is not set up on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and redeploy.' },
      { status: 503 },
    )
  }
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied

  const state = randomUUID()
  await ctx.db.from('google_oauth_states').insert({
    state, company_id: ctx.companyId, created_by: ctx.userId,
  })

  return NextResponse.json({ url: authorizeUrl(state, request), redirectUri: redirectUri(request) })
}
