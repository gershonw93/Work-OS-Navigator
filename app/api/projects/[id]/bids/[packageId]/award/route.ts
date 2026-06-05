import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST - award a bid (creates subcontract, marks package as awarded)
export async function POST(
  request: Request,
  { params }: { params: { id: string; packageId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bid_id } = await request.json()
  if (!bid_id) return NextResponse.json({ error: 'bid_id is required' }, { status: 400 })

  // Fetch the bid
  const { data: bid, error: bidError } = await db
    .from('bids')
    .select('*, bid_packages(scope)')
    .eq('id', bid_id)
    .eq('bid_package_id', params.packageId)
    .single()

  if (bidError || !bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })

  // Mark bid as awarded, others as rejected
  await Promise.all([
    db.from('bids').update({ status: 'awarded' }).eq('id', bid_id),
    db.from('bids').update({ status: 'rejected' })
      .eq('bid_package_id', params.packageId)
      .neq('id', bid_id),
    db.from('bid_packages').update({ status: 'awarded' }).eq('id', params.packageId),
  ])

  // Create subcontract
  const { data: subcontract, error: subError } = await db
    .from('subcontracts')
    .insert({
      project_id: params.id,
      bid_id: bid_id,
      company_id: bid.company_id,
      scope: bid.bid_packages?.scope ?? '',
      trade: bid.bid_packages?.scope ?? '',
      contract_amount: bid.amount,
      status: 'active',
    })
    .select()
    .single()

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })

  return NextResponse.json({ subcontract })
}
