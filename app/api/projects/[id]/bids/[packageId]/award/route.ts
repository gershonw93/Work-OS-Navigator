import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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

  const { data: bid, error: bidError } = await db
    .from('bids')
    .select('*, bid_packages(scope, trade)')
    .eq('id', bid_id)
    .eq('bid_package_id', params.packageId)
    .single()

  if (bidError || !bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })

  await Promise.all([
    db.from('bids').update({ status: 'awarded' }).eq('id', bid_id),
    db.from('bids').update({ status: 'rejected' }).eq('bid_package_id', params.packageId).neq('id', bid_id),
    db.from('bid_packages').update({ status: 'awarded' }).eq('id', params.packageId),
  ])

  // Create subcontract with schedule hint from bid
  const { data: subcontract, error: subError } = await db
    .from('subcontracts')
    .insert({
      project_id: params.id,
      bid_id: bid_id,
      company_id: bid.company_id,
      scope: bid.bid_packages?.scope ?? '',
      trade: bid.bid_packages?.trade ?? bid.bid_packages?.scope ?? '',
      contract_amount: bid.amount,
      status: 'active',
    })
    .select()
    .single()

  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 })

  // Auto-create payment schedule from bid's payment_terms if provided
  if (bid.payment_terms && subcontract) {
    const lines = bid.payment_terms.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const scheduleItems = lines.map((line: string, i: number) => {
      const percentMatch = line.match(/(\d+)%/)
      const percentage = percentMatch ? parseFloat(percentMatch[1]) : null
      return {
        subcontract_id: subcontract.id,
        label: line,
        type: percentage ? 'percent' : 'milestone',
        percentage,
        amount: percentage ? (bid.amount * percentage / 100) : null,
        status: 'pending',
        order_index: i,
      }
    })
    if (scheduleItems.length > 0) {
      await db.from('payment_schedule_items').insert(scheduleItems)
    }
  }

  // If bid included a schedule hint, create a schedule item
  if (bid.duration_days && bid.earliest_start_date && subcontract) {
    const start = new Date(bid.earliest_start_date)
    const end = new Date(start)
    end.setDate(end.getDate() + bid.duration_days)
    await db.from('schedule_items').insert({
      project_id: params.id,
      subcontract_id: subcontract.id,
      start_date: bid.earliest_start_date,
      end_date: end.toISOString().split('T')[0],
    })
  }

  // Send notification to awarded sub
  const { data: subProfile } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', bid.company_id)
    .single()

  if (subProfile) {
    await db.from('notifications').insert({
      user_id: subProfile.id,
      type: 'bid_awarded',
      message: `You have been awarded the ${bid.bid_packages?.scope} contract. Check your dashboard for next steps.`,
      read: false,
    })
  }

  return NextResponse.json({ subcontract, duration_days: bid.duration_days, payment_terms: bid.payment_terms })
}
