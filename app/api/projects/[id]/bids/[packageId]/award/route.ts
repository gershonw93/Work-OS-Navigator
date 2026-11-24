import { logActivity } from '@/lib/log-activity'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { vendorProfileIds } from '@/lib/sub-companies'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { notify } from '@/lib/notify'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(
  request: Request,
  { params }: { params: { id: string; packageId: string } }
) {
  // The old Bids tab (folded into Request Quotes by 081). It answered any
  // login; it now asks `bids` and that the caller's company owns the job.
  const gate = await requirePermission(admin(), request, 'bids', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(admin(), gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bid_id } = await request.json()
  if (!bid_id) return NextResponse.json({ error: 'bid_id is required' }, { status: 400 })

  // THE PACKAGE HAS TO BE ON THIS JOB. The ownership check above is about the
  // project in the URL; the package id beside it was never compared with it,
  // so a GC naming their own job and somebody else's package awarded that
  // package's bid, REJECTED every other bidder on it, and opened a subcontract
  // for the winner on the wrong job. Asked before anything is written.
  const { data: pkg } = await db
    .from('bid_packages').select('id').eq('id', params.packageId).eq('project_id', params.id).maybeSingle()
  if (!pkg) return NextResponse.json({ error: 'Bid package not found' }, { status: 404 })

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

  // Notify everyone at the awarded sub. Not .single() - that errors unless the
  // company has exactly one user, which silently dropped the notification for
  // any sub with a second account.
  // And across the Directory link (lib/sub-companies.ts).
  const subProfiles = await vendorProfileIds(db, bid.company_id)

  if (subProfiles.length) {
    await notify({
      db, userIds: subProfiles, type: 'bid_awarded', title: 'Bid awarded',
      message: `You have been awarded the ${bid.bid_packages?.scope} contract. Check your dashboard for next steps.`,
      link: `/my-bids`,
    })
  }

  // Fetch GC actor name
  const { data: gcProfile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const actorName = (gcProfile as any)?.full_name ?? 'Someone'

  // Fetch company name for the awarded bid
  const { data: awardedCompany } = await db.from('companies').select('name').eq('id', bid.company_id).single()
  const companyName = (awardedCompany as any)?.name ?? 'a sub'

  await logActivity(db, params.id, actorName, 'bid_awarded',
    `Awarded "${bid.bid_packages?.scope}" to ${companyName} for $${Number(bid.amount).toLocaleString()}`,
    { bid_id: bid_id, package_id: params.packageId, company_id: bid.company_id, amount: bid.amount }
  )

  return NextResponse.json({ subcontract, duration_days: bid.duration_days, payment_terms: bid.payment_terms })
}
