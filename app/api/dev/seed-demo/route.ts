import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runSeed } from '@/lib/seed-demo'

export const runtime = 'nodejs'
// Seeding does hundreds of inserts; give it room (needs a Vercel plan that
// allows a longer function duration).
export const maxDuration = 300

/**
 * One-time demo seeder you can trigger from a browser instead of a terminal.
 *
 *   https://app.sytenav.com/api/dev/seed-demo?secret=YOUR_SECRET
 *
 * Set DEMO_SEED_SECRET in the Vercel environment first; the route 404s until
 * it is set, and 403s unless ?secret= matches. Uses the server's existing
 * SUPABASE_SERVICE_ROLE_KEY, so no keys are handled in the browser.
 */
async function handle(request: Request) {
  const secret = process.env.DEMO_SEED_SECRET
  if (!secret) return NextResponse.json({ error: 'Seeding is disabled. Set DEMO_SEED_SECRET to enable.' }, { status: 404 })

  const provided = new URL(request.url).searchParams.get('secret')
  if (provided !== secret) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const password = new URL(request.url).searchParams.get('password') || process.env.DEMO_PASSWORD || undefined

  try {
    const result = await runSeed(db, { password })
    return NextResponse.json({
      ok: true,
      message: `Seeded ${result.projects} demo projects. Log in and click through every tab.`,
      login: { email: result.email, password: result.password },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) { return handle(request) }
export async function POST(request: Request) { return handle(request) }
