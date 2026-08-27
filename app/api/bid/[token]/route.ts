import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { coerceLines, coercePricedLines, pricedCount, pricedTotal } from '@/lib/item-list'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Public: anyone with the link can view the request and submit a quote (no account).
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: invite } = await db.from('bid_invites').select('*').eq('token', params.token).single()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  // Mark viewed (first time)
  if (invite.status === 'invited') {
    await db.from('bid_invites').update({ status: 'viewed', viewed_at: new Date().toISOString() }).eq('id', invite.id)
  }

  const SCOPE_COLS = 'package_type, material_by, included, excluded, ask_for, item_list, '
  const CORE = 'id, title, trade, description, due_date, status, project_id, projects(name, address), bid_request_attachments(file_url, file_name)'
  let req: any = (await db.from('bid_requests').select(SCOPE_COLS + CORE).eq('id', invite.bid_request_id).single()).data
  // Pre-migration fallback: scope columns may not exist yet - the bid link
  // must keep working either way.
  if (!req) {
    req = (await db.from('bid_requests').select(CORE).eq('id', invite.bid_request_id).single()).data
  }
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: mySubmission } = await db.from('bid_submissions').select('*').eq('bid_invite_id', invite.id).order('created_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({
    request: {
      title: req.title, trade: req.trade, description: req.description, due_date: req.due_date,
      status: req.status, project_name: (req as any).projects?.name, project_address: (req as any).projects?.address,
      attachments: (req as any).bid_request_attachments ?? [],
      package_type: (req as any).package_type ?? null,
      material_by: (req as any).material_by ?? null,
      included: (req as any).included ?? [],
      excluded: (req as any).excluded ?? [],
      ask_for: (req as any).ask_for ?? [],
      item_list: coerceLines((req as any).item_list),
    },
    invite: { vendor_name: invite.vendor_name, status: invite.status },
    submission: mySubmission ?? null,
  })
}

/**
 * Tell the GC that something happened on one of their quote requests.
 *
 * This route is how a sub actually answers - it needs no account, so it is the
 * ONLY path most quotes arrive by - and until now it contained no notify() at
 * all. A sub could price a job, submit it, and the GC found out by remembering
 * to go and look. The "Bid received" switch in Notification Preferences was
 * reading a type nothing emitted.
 *
 * Same contract as everything else here: never throws, never blocks the sub.
 * Their quote is saved before this runs, and a failure to notify must not turn
 * a delivered quote into an error page.
 */
async function tellTheGC(db: any, bidRequestId: string, build: (ctx: {
  requestTitle: string
  projectName: string | null
  projectId: string | null
}) => { type: string; title: string; message: string }) {
  try {
    const { data: req } = await db
      .from('bid_requests')
      .select('title, trade, project_id, projects ( name, gc_company_id )')
      .eq('id', bidRequestId)
      .single()
    if (!req) return

    const gcCompanyId = (req as any).projects?.gc_company_id
    if (!gcCompanyId) return

    const { data: profiles } = await db.from('profiles').select('id').eq('company_id', gcCompanyId)
    if (!profiles?.length) return

    const { type, title, message } = build({
      requestTitle: (req as any).title || (req as any).trade || 'a package',
      projectName: (req as any).projects?.name ?? null,
      projectId: (req as any).project_id ?? null,
    })

    await notify({
      db,
      userIds: profiles.map((p: any) => p.id),
      type,
      title,
      message,
      link: (req as any).project_id ? `/projects/${(req as any).project_id}/quotes` : null,
    })
  } catch {
    // See the doc comment: the quote is already saved.
  }
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: invite } = await db.from('bid_invites').select('*').eq('token', params.token).single()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  const form = await request.formData()
  const action = form.get('action') as string
  if (action === 'decline') {
    await db.from('bid_invites').update({ status: 'declined' }).eq('id', invite.id)
    // A "no bid" is information. Without this the GC waits on a quote that is
    // never coming, which is the expensive half of not being told.
    const who = invite.vendor_name || 'A sub'
    await tellTheGC(db, invite.bid_request_id, ({ requestTitle, projectName }) => ({
      type: 'new_bid',
      title: 'Declined to quote',
      message: `${who} declined to quote ${requestTitle}${projectName ? ` on ${projectName}` : ''}.`,
    }))
    return NextResponse.json({ ok: true, status: 'declined' })
  }

  const amountRaw = form.get('amount') as string | null
  let amount = amountRaw ? Number(String(amountRaw).replace(/[^0-9.\-]/g, '')) : null
  const notes = (form.get('notes') as string) || null

  // Line pricing, when the GC sent an item list. The total is computed here,
  // not trusted from the browser - it has to match the lines the GC compares.
  let priced_items: ReturnType<typeof coercePricedLines> = []
  const pricedRaw = form.get('priced_items') as string | null
  if (pricedRaw) {
    try { priced_items = coercePricedLines(JSON.parse(pricedRaw)) } catch { priced_items = [] }
  }
  if (pricedCount(priced_items) > 0) amount = pricedTotal(priced_items)
  const submitted_by_name = (form.get('name') as string) || invite.vendor_name || null
  const file = form.get('file') as File | null

  let file_url: string | null = null
  let file_name: string | null = null
  if (file && file.size > 0) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `bid-submissions/${invite.bid_request_id}/${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    file_url = signed?.signedUrl ?? null
    file_name = file.name
  }

  if (amount == null && !file_url) return NextResponse.json({ error: 'Attach your quote or enter an amount.' }, { status: 400 })

  // A revised quote replaces the sub's previous one, so the GC (and the AI
  // comparison) only ever see the current quote, never the original plus its
  // revision.
  await db.from('bid_submissions').delete().eq('bid_invite_id', invite.id)

  const base = {
    bid_request_id: invite.bid_request_id,
    bid_invite_id: invite.id,
    amount, notes, file_url, file_name, submitted_by_name,
  }
  let { error } = await db.from('bid_submissions').insert({ ...base, priced_items })
  // Pre-migration fallback: priced_items may not exist yet. A sub's quote must
  // never bounce because the GC hasn't run a migration.
  if (error && (error as any).code === '42703') {
    error = (await db.from('bid_submissions').insert(base)).error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('bid_invites').update({ status: 'submitted' }).eq('id', invite.id)

  const who = submitted_by_name || invite.vendor_name || 'A sub'
  const money = amount != null
    ? ` at ${amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`
    : ''
  await tellTheGC(db, invite.bid_request_id, ({ requestTitle, projectName }) => ({
    type: 'new_bid',
    title: 'Quote received',
    message: `${who} sent a quote for ${requestTitle}${projectName ? ` on ${projectName}` : ''}${money}.`,
  }))

  return NextResponse.json({ ok: true })
}
