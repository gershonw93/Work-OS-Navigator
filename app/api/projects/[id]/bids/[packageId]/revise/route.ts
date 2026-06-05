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

  // Fetch bid separately from related data to avoid join issues
  const { data: bid, error: bidError } = await db
    .from('bids')
    .select('id, company_id, bid_package_id, amount')
    .eq('id', bid_id)
    .eq('bid_package_id', params.packageId)
    .single()

  if (bidError || !bid) {
    return NextResponse.json({ error: 'Bid not found', detail: bidError?.message }, { status: 404 })
  }

  const { error: updateError } = await db
    .from('bids')
    .update({ status: 'revision_requested', revision_note })
    .eq('id', bid_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Fetch supporting data for notification + activity log
  const [{ data: pkg }, { data: gcProfile }, { data: company }, { data: subProfile }] = await Promise.all([
    db.from('bid_packages').select('scope').eq('id', params.packageId).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
    db.from('companies').select('name').eq('id', bid.company_id).single(),
    db.from('profiles').select('id').eq('company_id', bid.company_id).single(),
  ])

  if (subProfile) {
    await db.from('notifications').insert({
      user_id: subProfile.id,
      type: 'bid_revision',
      message: `A revision has been requested for your ${pkg?.scope ?? ''} bid. Please review and resubmit.`,
      read: false,
    })
  }

  const actorName = (gcProfile as any)?.full_name ?? 'Someone'
  const subName = (company as any)?.name ?? 'a sub'
  const scope = pkg?.scope ?? 'unknown'

  await logActivity(db, params.id, actorName, 'revision_requested',
    `Requested revision from ${subName} on "${scope}" bid`,
    { bid_id, package_id: params.packageId, revision_note }
  )

  return NextResponse.json({ ok: true })
}
