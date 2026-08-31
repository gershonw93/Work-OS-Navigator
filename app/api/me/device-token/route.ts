import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Where the phone says "this is me, here is my address".
//
// The token is written with the service key because `device_tokens` has RLS on
// with no policies - nothing client-side can read or write it. The address of
// somebody's lock screen is not a row the browser should be able to list.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function caller(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { db: null, user: null }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return { db, user }
}

export async function POST(request: Request) {
  const { db, user } = await caller(request)
  if (!db || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, platform } = await request.json().catch(() => ({}))
  const value = String(token ?? '').trim()
  if (!value) return NextResponse.json({ error: 'No token' }, { status: 400 })

  // Conflict on TOKEN, not on (user, token). A device token belongs to the
  // phone: hand a site tablet over and the next person signs in on the same
  // hardware, and Apple issues the same token again. Upserting on the token
  // MOVES the row to whoever is signed in now. Keyed any other way the tablet
  // would sit on two rows and the previous holder would keep receiving
  // notifications about jobs they can no longer open.
  const { error } = await db.from('device_tokens').upsert({
    token: value,
    user_id: user.id,
    platform: platform === 'android' ? 'android' : 'ios',
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'token' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// Signing out gives the phone back. Without this, the next person to use it
// would still be reachable at somebody else's address until they happened to
// sign in and the upsert above moved the row.
export async function DELETE(request: Request) {
  const { db, user } = await caller(request)
  if (!db || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await request.json().catch(() => ({}))
  const value = String(token ?? '').trim()
  if (!value) return NextResponse.json({ error: 'No token' }, { status: 400 })

  // Scoped to the caller: a token is only ever removable by the person it is
  // currently registered to.
  await db.from('device_tokens').delete().eq('token', value).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
