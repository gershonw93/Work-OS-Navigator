import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { apnsConfig, pushTestMessage } from '@/lib/push'
import { fcmConfig } from '@/lib/fcm'
import { pushToPhones } from '@/lib/notify'

// ─────────────────────────────────────────────────────────────────────────────
// "Does my phone actually get notifications?"
//
// IT ONLY EVER REACHES THE CALLER'S OWN PHONES. There is no user id and no
// device token in the request - the route sends to whatever is registered to
// whoever is holding the session. That is what makes it safe to give every
// user rather than hiding it behind an admin gate, and it means the worst
// somebody can do by pressing it repeatedly is annoy themselves.
//
// The alternative considered was a secret URL, like the demo seeder's. This is
// better: nothing to configure, nothing to remember to switch off afterwards,
// and no way for a leaked string to send notifications to somebody else.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'

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

/** How many phones are registered to me, and when did one last check in? */
async function devices(db: any, userId: string): Promise<{ count: number; lastSeen: string | null; platforms: string[] }> {
  try {
    const { data } = await db.from('device_tokens')
      .select('last_seen_at, platform').eq('user_id', userId).order('last_seen_at', { ascending: false })
    const rows = data ?? []
    return {
      count: rows.length,
      lastSeen: rows[0]?.last_seen_at ?? null,
      platforms: rows.map((r: any) => r.platform === 'android' ? 'android' : 'ios'),
    }
  } catch {
    // The table not existing is "no phones", not an error. A database that
    // has not had migration 090 yet is a normal state, not a fault.
    return { count: 0, lastSeen: null, platforms: [] }
  }
}

/**
 * Is push switched on FOR THE PHONES THIS PERSON HAS?
 *
 * Apple keys and a Google key are two separate settings, and each only reaches
 * its own platform. "Configured" used to mean "the Apple keys are set", which
 * would tell somebody holding an Android phone that everything was ready while
 * nothing could ever reach them. With no phone yet, either service counts -
 * the next thing to say is "register a phone", not "not switched on".
 */
function configuredFor(platforms: string[]): boolean {
  const apple = !!apnsConfig()
  const google = !!fcmConfig()
  if (!platforms.length) return apple || google
  return platforms.some(p => p === 'android' ? google : apple)
}

export async function GET(request: Request) {
  const { db, user } = await caller(request)
  if (!db || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count, lastSeen, platforms } = await devices(db, user.id)
  return NextResponse.json({
    configured: configuredFor(platforms),
    devices: count,
    // The real diagnostic. A phone that registered three weeks ago and not
    // since is the answer to most "it stopped working" questions, and it is
    // not something the person could otherwise find out.
    lastSeen,
  })
}

export async function POST(request: Request) {
  const { db, user } = await caller(request)
  if (!db || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count, platforms } = await devices(db, user.id)
  const configured = configuredFor(platforms)

  // Both of these are normal states, not failures, and neither is worth a
  // network call. Reported as 200 with an explanation rather than an error
  // status, because nothing has gone wrong - see pushTestMessage.
  if (!configured || !count) {
    return NextResponse.json({
      ...pushTestMessage({ configured, devices: count, sent: 0, dead: 0 }),
      configured, devices: count, sent: 0,
    })
  }

  const before = count
  // The SAME function every real notification goes through, deliberately -
  // dead-token cleanup included. A test that took its own path could pass
  // while the real thing fails, which is worse than having no test.
  const push = await pushToPhones(db, [user.id], {
    title: 'SyteNav',
    body: 'Notifications are working. This is a test you sent yourself.',
    link: '/settings',
    type: 'invoice_pending',
  })

  // pushToPhones deletes what Apple calls dead, so a shrunk count IS the
  // answer to "why did nothing arrive".
  const after = await devices(db, user.id)
  const dead = Math.max(0, before - after.count)

  return NextResponse.json({
    // `error` is the whole point of the button. It carries Apple's own words -
    // "403 InvalidProviderToken" - and used to be dropped two layers down, so
    // every refusal reached this line as "no reason why".
    ...pushTestMessage({ configured, devices: before, sent: push.sent, dead, error: push.error }),
    configured, devices: before, sent: push.sent, dead,
  })
}
