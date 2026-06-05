import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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

  const [{ data: bid }, { data: gcProfile }] = await Promise.all([
    db.from('bids').select('*, bid_packages(scope), companies(name)').eq('id', bid_id).eq('bid_package_id', params.packageId).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })

  const actorName = (gcProfile as any)?.full_name ?? 'Someone'
  const subName = (bid.companies as any)?.name ?? 'a sub'
  const scope = (bid.bid_packages as any)?.scope ?? 'unknown'

  await db.from('bids').update({ status: 'revision_requested', revision_note }).eq('id', bid_id)

  const { data: subProfile } = await db.from('profiles').select('id').eq('company_id', bid.company_id).single()
  if (subProfile) {
    await db.from('notifications').insert({
      user_id: subProfile.id,
      type: 'bid_revision',
      message: `A revision has been requested for your ${scope} bid. Please review and resubmit.`,
      read: false,
    })
  }

  await logActivity(db, params.id, actorName, 'revision_requested',
    `Requested revision from ${subName} on "${scope}" bid`,
    { bid_id, package_id: params.packageId, revision_note }
  )

  return NextResponse.json({ ok: true })
}
