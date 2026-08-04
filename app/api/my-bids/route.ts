import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ invitations: [] })

  const { data: invitations } = await db
    .from('bid_invitations')
    .select(`
      id, status, invited_at,
      bid_packages (
        id, scope, description, trade, due_date, status, requirements, specifications,
        projects ( id, name, address, type )
      )
    `)
    .eq('company_id', profile.company_id)
    .order('invited_at', { ascending: false })

  // For each package, check if this company already submitted a bid
  const packageIds = (invitations ?? []).map((i: any) => i.bid_packages?.id).filter(Boolean)
  const { data: myBids } = await db
    .from('bids')
    .select('id, bid_package_id, amount, status')
    .eq('company_id', profile.company_id)
    .in('bid_package_id', packageIds.length ? packageIds : ['none'])

  const bidMap = Object.fromEntries((myBids ?? []).map(b => [b.bid_package_id, b]))

  // Request Quotes invites live in a separate, newer set of tables (bid_invites
  // / bid_submissions) and used to be reachable only through the emailed link.
  // Surface them here too; the token page is still where the quote gets built.
  const { data: quoteInvites } = await db
    .from('bid_invites')
    .select(`
      id, token, status, invited_at,
      bid_requests ( id, title, trade, description, due_date, status,
        projects ( id, name, address, type ) ),
      bid_submissions ( id, amount, created_at )
    `)
    .eq('vendor_company_id', profile.company_id)
    .order('invited_at', { ascending: false })

  return NextResponse.json({
    invitations: (invitations ?? []).map((inv: any) => ({
      ...inv,
      my_bid: bidMap[inv.bid_packages?.id] ?? null,
    })),
    quote_requests: (quoteInvites ?? []).map((inv: any) => {
      // Newest submission wins - subs can revise.
      const latest = [...(inv.bid_submissions ?? [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
      return {
        id: inv.id,
        token: inv.token,
        status: inv.status,
        invited_at: inv.invited_at,
        request: inv.bid_requests,
        my_submission: latest,
      }
    }),
  })
}
