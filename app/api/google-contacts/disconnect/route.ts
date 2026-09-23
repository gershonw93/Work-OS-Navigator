import { NextResponse } from 'next/server'
import { contactsActor } from '@/lib/google-contacts-actor'

export const runtime = 'nodejs'

/**
 * Unlink YOUR Google account. Only ever your own - the row is keyed on who is
 * asking, so nobody can disconnect a colleague's phone book.
 *
 * THE STAGING AREA IS LEFT ALONE. Disconnecting means "stop reading my phone
 * book", not "throw away the work I did labelling these" - and a destructive
 * side effect nobody asked for is how somebody loses an afternoon. Clearing
 * staged contacts is its own action on its own screen.
 */
export async function POST(request: Request) {
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied

  const { error } = await ctx.db.from('google_connections')
    .delete().eq('profile_id', ctx.userId)
  if (error) {
    console.error('[google-contacts/disconnect] failed:', error.message)
    return NextResponse.json({ error: 'Could not disconnect. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
