import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Everything this sub has been asked to price.
 *
 * ONE SOURCE NOW. This used to query both bidding systems and return them as
 * two separate lists - `invitations` from bid_invitations/bid_packages and
 * `quote_requests` from bid_invites/bid_requests - which is what papering over
 * the split looked like from the sub's side.
 *
 * Migration 081 moved the old rows into the new tables, so querying both would
 * now show every migrated invitation TWICE. The old half is gone from here.
 *
 * The response shape is unchanged on purpose. `invitations` still looks like
 * an invitation with a `bid_packages` object and a `my_bid`, because the page
 * is built around that shape and a data merge is not the moment to also
 * rewrite the sub-facing UI. The mapping is honest - an invite IS the old
 * invitation, a request IS the old package, a submission IS the old bid.
 */
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ invitations: [], quote_requests: [] })

  const { data: invites } = await db
    .from('bid_invites')
    .select(`
      id, token, status, invited_at,
      bid_requests ( id, title, trade, description, due_date, status,
        projects ( id, name, address, type ) ),
      bid_submissions ( id, amount, created_at )
    `)
    .eq('vendor_company_id', profile.company_id)
    .order('invited_at', { ascending: false })

  // Newest submission wins - subs can revise.
  const latestOf = (subs: any[]) =>
    [...(subs ?? [])].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null

  const rows = (invites ?? []).map((inv: any) => {
    const req = inv.bid_requests
    const latest = latestOf(inv.bid_submissions)
    return { inv, req, latest }
  })

  return NextResponse.json({
    // EMPTY ON PURPOSE, not an oversight.
    //
    // `invitations` fed a tabbed UI built on bids-table concepts - "revision
    // requested" and "awarded" were statuses on a table that no longer
    // receives writes. Returning the migrated rows here as well as below would
    // show every invitation twice, and inventing those statuses to keep the
    // tabs populated would be worse than an empty tab.
    //
    // The page already guards its empty state on BOTH lists being empty, so it
    // renders correctly. The now-unreachable tabbed section is logged in
    // BACKLOG.md for removal rather than deleted in a data migration.
    invitations: [],

    // Every invitation, old and new, through the one route that works for
    // somebody with no account: /bid/<token>.
    quote_requests: rows.map(({ inv, req, latest }) => ({
      id: inv.id,
      token: inv.token,
      status: inv.status,
      invited_at: inv.invited_at,
      request: req,
      my_submission: latest,
    })),
  })
}
