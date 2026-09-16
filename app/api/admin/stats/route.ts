import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The platform overview.
 *
 * WHAT CHANGED AND WHY. It used to answer four counts - companies, users,
 * projects, active projects - and the two project numbers were the ones nobody
 * could do anything with: a total across every company says nothing about
 * whether the product is being used, and the tab behind them was a flat list of
 * every project on the platform, which at any real size is unreadable and at
 * this size is noise.
 *
 * WHO HAS BEEN HERE is the question that was actually being asked. Signing in
 * is the one signal that means somebody came back, and it lives in auth.users,
 * which PostgREST cannot reach - so it comes through the Admin API, which
 * PAGES. The loop is load-bearing: without it you see the first 200 accounts
 * and somebody who has never signed in is indistinguishable from somebody on
 * page two. Same shape as `accountsByEmail` in the access-requests route, and
 * for the same reason.
 */
async function signIns(db: ReturnType<typeof admin>) {
  const rows: { id: string; email: string | null; last_sign_in_at: string | null }[] = []
  let complete = false
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return { rows, complete: false }
      const users = data?.users ?? []
      for (const u of users) {
        rows.push({ id: u.id, email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null })
      }
      if (users.length < 200) { complete = true; break }
    }
  } catch {
    return { rows, complete: false }
  }
  return { rows, complete }
}

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const count = (q: any) => q.then((r: any) => r.count ?? 0)
  const [companies, users, accounts, { data: profiles }] = await Promise.all([
    count(db.from('companies').select('id', { count: 'exact', head: true })),
    count(db.from('profiles').select('id', { count: 'exact', head: true })),
    signIns(db),
    db.from('profiles').select('id, full_name, email, role, companies:company_id(name)'),
  ])

  const byId = new Map<string, any>()
  for (const p of (profiles ?? []) as any[]) byId.set(p.id, p)

  const DAY = 24 * 60 * 60 * 1000
  const now = Date.now()
  const since = (d: string | null) => (d ? now - new Date(d).getTime() : Infinity)

  // Everyone who has ever signed in, most recent first. The name and company
  // come off `profiles`; an auth account with no profile row still appears,
  // because "somebody signed in and we cannot say who" is a fact worth seeing
  // rather than one to filter away.
  const active = accounts.rows
    .filter(a => a.last_sign_in_at)
    .sort((a, b) => String(b.last_sign_in_at).localeCompare(String(a.last_sign_in_at)))
    .map(a => {
      const p = byId.get(a.id)
      return {
        id: a.id,
        name: p?.full_name ?? null,
        email: a.email ?? p?.email ?? null,
        role: p?.role ?? null,
        company: p?.companies?.name ?? null,
        last_sign_in_at: a.last_sign_in_at,
      }
    })

  return NextResponse.json({
    companies,
    users,
    activeWeek: accounts.rows.filter(a => since(a.last_sign_in_at) <= 7 * DAY).length,
    activeMonth: accounts.rows.filter(a => since(a.last_sign_in_at) <= 30 * DAY).length,
    neverSignedIn: accounts.rows.filter(a => !a.last_sign_in_at).length,
    // The 25 most recent. The whole point of this change is not to hand back a
    // list nobody can read.
    active: active.slice(0, 25),
    // A partial page-through would undercount every number above it, and a
    // quietly-wrong count is worse than one that says it is unsure.
    signInsComplete: accounts.complete,
  })
}
