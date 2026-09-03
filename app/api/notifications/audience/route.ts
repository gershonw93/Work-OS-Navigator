import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { isRoutable } from '@/lib/notification-routing'

export const runtime = 'nodejs'
// The answer depends entirely on who is asking - their company, their routing.
// Without this Next prerenders it at build time, building the service-role
// client with no environment, and the whole build fails.
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Who would hear about this event at my company, right now.
 *
 * WHY THIS EXISTS. Requesting an inspection with nobody assigned created it and
 * told nobody, with no warning - the exact thing the settings screen refuses to
 * let an admin configure, arriving through a different door. Fixing the routing
 * is half of it; the other half is that the person filling in the form should
 * be able to see who will hear before they press the button.
 *
 * NOT gated on `settings_company`. A field supervisor requesting an inspection
 * will not have it, and they are the person who most needs the answer. What
 * comes back is ids of their own colleagues, which they can already list
 * through /api/settings/teammates - so nothing is widened, only made legible.
 *
 * Returns ids only. The caller already has the names, and sending them twice is
 * how two lists start disagreeing about somebody's surname.
 */
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const type = new URL(request.url).searchParams.get('type') ?? ''
  // A 'direct' type has no company-side audience to preview, and answering with
  // an empty list would read as "nobody is told", which is the opposite of true.
  if (!isRoutable(type)) {
    return NextResponse.json({ error: 'That event has no company audience.' }, { status: 400 })
  }

  const { data: profile } = await db
    .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
  const companyId = (profile as any)?.company_id
  if (!companyId) return NextResponse.json({ error: 'No company on this account.' }, { status: 409 })

  // `exclude` is deliberately NOT set to the caller here. This says who is
  // routed to hear the event; whether the person triggering it is dropped is
  // the sending path's business, and the form applies the same rule through the
  // same withStructural() the routes use.
  const userIds = await audienceFor({ db, companyId, type })

  return NextResponse.json({ type, userIds })
}
