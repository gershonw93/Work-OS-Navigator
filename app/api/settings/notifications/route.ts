import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  NOTIFICATION_TYPES, effectivePrefs, notificationType, type Channel,
} from '@/lib/notifications'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function me(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

/**
 * Notification preferences, in their own route.
 *
 * Not another branch in /api/settings: that handler is already 280 lines
 * covering profile, company, logo and delete-protection, and this returns the
 * whole catalog alongside the answer.
 */
export async function GET(request: Request) {
  const user = await me(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await admin()
    .from('notification_preferences')
    .select('type, in_app, email')
    .eq('user_id', user.id)

  // The catalog goes with it, so the settings screen renders from the same
  // source the send path validates against and the two cannot drift.
  return NextResponse.json({
    types: NOTIFICATION_TYPES,
    prefs: effectivePrefs(data),
  })
}

/**
 * PATCH { type, channel: 'inApp' | 'email', value: boolean }
 *
 * Upserts one decision. Absence of a row means "use the default", so the first
 * change on a type writes a row carrying BOTH channels - otherwise the untouched
 * channel would silently fall to the column default rather than the catalog's,
 * and turning email on could quietly turn the bell off.
 */
export async function PATCH(request: Request) {
  const user = await me(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const type = String(body?.type ?? '')
  const channel = body?.channel as Channel
  const value = !!body?.value

  const def = notificationType(type)
  if (!def) return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  if (channel !== 'inApp' && channel !== 'email') {
    return NextResponse.json({ error: 'channel must be inApp or email' }, { status: 400 })
  }
  if (def.status !== 'live') {
    return NextResponse.json({ error: 'That notification is not available yet.' }, { status: 400 })
  }

  const db = admin()
  const { data: existing } = await db
    .from('notification_preferences')
    .select('in_app, email')
    .eq('user_id', user.id).eq('type', def.key)
    .maybeSingle()

  const current = existing
    ? { inApp: !!existing.in_app, email: !!existing.email }
    : { ...def.defaults }
  const next = { ...current, [channel]: value }

  const { error } = await db.from('notification_preferences').upsert({
    user_id: user.id,
    type: def.key,
    in_app: next.inApp,
    email: next.email,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,type' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, type: def.key, prefs: next })
}
