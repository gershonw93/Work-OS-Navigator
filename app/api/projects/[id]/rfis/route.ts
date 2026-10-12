import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { rfiSide } from '@/lib/rfi-access'
import { actorCan } from '@/lib/server-permissions'
import { billingLock } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // Was: any signed-in account could list any job's RFIs. See lib/rfi-access.ts.
  const who = await rfiSide(db, request, params.id)
  if ('denied' in who) return who.denied
  if (who.side === 'gc' && !actorCan(who.actor, 'rfis', 'view')) {
    return NextResponse.json({ error: 'You do not have permission to view RFIs.' }, { status: 403 })
  }

  let q = db.from('rfis').select('*').eq('project_id', params.id)
  // A sub reads the questions its own company asked, not every trade's.
  if (who.side === 'sub') q = q.eq('company_id', who.actor.companyId)
  const { data: rfis, error } = await q.order('created_at', { ascending: false })

  if (error) {
    console.error('[rfis] list failed', { project: params.id, error: error.message })
    return NextResponse.json({ error: 'Could not load the RFIs. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ rfis: rfis ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const who = await rfiSide(db, request, params.id)
  if ('denied' in who) return who.denied
  // The GC's own staff need the permission to create one; a sub on the job may
  // always ask - asking is what a sub is on the job to be able to do, and the
  // vendor role only carries `rfis: view`.
  if (who.side === 'gc' && !actorCan(who.actor, 'rfis', 'create')) {
    return NextResponse.json({ error: 'You do not have permission to create RFIs.' }, { status: 403 })
  }
  const locked = await billingLock(db, who.actor.companyId)
  if (locked) return locked
  const user = { id: who.actor.userId }

  const body = await request.json().catch(() => ({}))
  const {
    subject,
    description,
    is_change_order,
    change_order_description,
    change_order_items,
    change_order_amount,
    attachments,
  } = body

  // Same rule as the form, on the route - the sub's job page posts here too.
  if (typeof subject !== 'string' || !subject.trim()) {
    return NextResponse.json({ error: 'Give the RFI a subject.' }, { status: 400 })
  }

  // WHO ASKED IS READ HERE, NEVER TAKEN FROM THE BODY. `company_id`,
  // `company_name` and `submitted_by_name` used to come off the request, so an
  // RFI - and the change order riding on it - could be filed under any company.
  // A sub's RFI carries the sub's company; the GC's own carries none.
  const company_id = who.side === 'sub' ? who.actor.companyId : null
  const company_name = who.side === 'sub' ? who.companyName : null
  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const askedBy: string | null = me?.full_name ?? null

  // Auto-assign rfi_number by counting existing RFIs for this project
  const { count } = await db
    .from('rfis')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const rfi_number = (count ?? 0) + 1

  const { data: rfi, error } = await db
    .from('rfis')
    .insert({
      project_id: params.id,
      rfi_number,
      subject,
      description: description ?? null,
      is_change_order: is_change_order ?? false,
      change_order_description: change_order_description ?? null,
      change_order_items: change_order_items ?? null,
      change_order_amount: change_order_amount ?? null,
      change_order_status: is_change_order ? 'pending' : null,
      submitted_by_name: askedBy,
      company_name,
      company_id,
      attachments: attachments ?? null,
      status: 'open',
    })
    .select()
    .single()

  if (error) {
    console.error('[rfis] insert failed', { project: params.id, error: error.message })
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  const actorName = company_name ?? askedBy ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'rfi_submitted',
    `RFI #${rfi_number}: ${subject}`,
    { rfi_id: rfi.id, rfi_number, subject, company_name, is_change_order },
  )

  // Notify GC team members about the new RFI
  const { data: project } = await db
    .from('projects')
    .select('name, gc_company_id')
    .eq('id', params.id)
    .single()
  if (project?.gc_company_id) {
    // Was EVERY profile at the GC company - the labourer, the read-only
    // bookkeeper, everyone. An RFI needs answering by whoever the company
    // decided answers RFIs, and telling the rest is how the bell stops being
    // read. Defaults to whoever can edit RFIs, which is close to who was
    // meaningfully being reached before.
    const audience = await audienceFor({
      db, companyId: project.gc_company_id, type: 'rfi_submitted', exclude: user.id,
    })
    if (audience.length) {
      await notify({
        db,
        userIds: audience,
        type: 'rfi',
        title: `New RFI #${rfi_number}`,
        message: `${actorName} submitted RFI: ${subject}`,
        link: `/projects/${params.id}/rfis`,
      })
    }
  }

  return NextResponse.json({ rfi }, { status: 201 })
}
