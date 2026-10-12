import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rfis, error } = await db
    .from('rfis')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rfis: rfis ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    subject,
    description,
    is_change_order,
    change_order_description,
    change_order_items,
    change_order_amount,
    submitted_by_name,
    company_name,
    company_id,
    attachments,
  } = body

  // Same rule as the form, on the route - the sub's job page posts here too.
  if (typeof subject !== 'string' || !subject.trim()) {
    return NextResponse.json({ error: 'Give the RFI a subject.' }, { status: 400 })
  }

  // Who asked. A sub's job page sends its company; the GC's own RFI page sends
  // nothing, so the name comes off the signed-in profile - never "Someone".
  let askedBy = submitted_by_name ?? null
  if (!askedBy && !company_name) {
    const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    askedBy = me?.full_name ?? null
  }

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
      company_name: company_name ?? null,
      company_id: company_id ?? null,
      attachments: attachments ?? null,
      status: 'open',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
