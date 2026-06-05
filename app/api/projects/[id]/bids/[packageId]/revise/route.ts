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

  const { bid_id, revision_note } = await request.json()
  if (!bid_id) return NextResponse.json({ error: 'bid_id is required' }, { status: 400 })

  const { data: bid, error: bidError } = await db
    .from('bids')
    .select('*, bid_packages(scope)')
    .eq('id', bid_id)
    .eq('bid_package_id', params.packageId)
    .single()

  if (bidError || !bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })

  await db.from('bids').update({ status: 'revision_requested', revision_note }).eq('id', bid_id)

  // Notify the sub
  const { data: subProfile } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', bid.company_id)
    .single()

  if (subProfile) {
    await db.from('notifications').insert({
      user_id: subProfile.id,
      type: 'bid_revision',
      message: `A revision has been requested for your ${bid.bid_packages?.scope} bid. Please review and resubmit.`,
      read: false,
    })
  }

  return NextResponse.json({ ok: true })
}
