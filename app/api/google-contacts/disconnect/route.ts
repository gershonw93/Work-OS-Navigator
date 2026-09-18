import { NextResponse } from 'next/server'
import { admin } from '@/lib/google-contacts'

export const runtime = 'nodejs'

/**
 * Unlink the Google account.
 *
 * THE STAGING AREA IS LEFT ALONE. Disconnecting means "stop reading my phone
 * book", not "throw away the work I did labelling these" - and a destructive
 * side effect nobody asked for is how somebody loses an afternoon. Clearing
 * staged contacts is its own action on its own screen.
 */
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!['admin', 'manager'].includes((profile as any).role)) {
    return NextResponse.json({ error: 'Only an admin can disconnect Google Contacts.' }, { status: 403 })
  }

  const { error } = await db.from('google_connections')
    .delete().eq('company_id', profile.company_id)
  if (error) {
    console.error('[google-contacts/disconnect] failed:', error.message)
    return NextResponse.json({ error: 'Could not disconnect. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
