import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { notify } from '@/lib/notify'
import { appOrigin } from '@/lib/app-url'
import { bidInviteEmail, bidScopeLine } from '@/lib/bid-invite-email'
import { isEmailAddress, sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// Invite subs to price a scope of work - and actually tell them.
//
// THE BUG. This route sent NO EMAIL, on any path. It inserted rows and fired an
// in-app bell, and only to invitees who already had a SyteNav account - so a
// directory sub with a login got a notification (which looked like it worked)
// and everybody else got nothing at all. The first thing a typed-in sub ever
// received was whatever the GC sent afterwards from the Send panel, and because
// the row was born at status 'invited' that arrived reading "Still need your
// price" - a chase for a request they had never been given.
//
// Pressing + Invite is the act of inviting somebody. It sends.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invitees } = await request.json() as { invitees: { company_id?: string | null; name?: string; email?: string }[] }
  if (!invitees?.length) return NextResponse.json({ error: 'No invitees' }, { status: 400 })

  const wanted = invitees.filter(v => (v.name || v.email))
  if (!wanted.length) return NextResponse.json({ error: 'Each invitee needs a name or email' }, { status: 400 })

  // ── Already on this request? ────────────────────────────────────────────
  //
  // The database refuses a duplicate now (098), but a constraint violation is a
  // 500 and "already invited" is not an error the user made - it is an answer.
  // Asked first so the reply can name who was skipped.
  const { data: existing } = await db
    .from('bid_invites')
    .select('vendor_email, vendor_company_id')
    .eq('bid_request_id', params.reqId)
  const seenEmails = new Set((existing ?? []).map(e => (e.vendor_email ?? '').trim().toLowerCase()).filter(Boolean))
  const seenCompanies = new Set((existing ?? []).map(e => e.vendor_company_id).filter(Boolean) as string[])

  const skipped: string[] = []
  const fresh = wanted.filter(v => {
    const em = (v.email ?? '').trim().toLowerCase()
    if (em && seenEmails.has(em)) { skipped.push(v.name || v.email!); return false }
    if (v.company_id && seenCompanies.has(v.company_id)) { skipped.push(v.name || v.email!); return false }
    // A repeat inside one request body counts too.
    if (em) seenEmails.add(em)
    if (v.company_id) seenCompanies.add(v.company_id)
    return true
  })

  if (!fresh.length) {
    return NextResponse.json({
      invites: [],
      skipped,
      error: skipped.length === 1
        ? `${skipped[0]} is already on this request. Use Send reminder to chase them.`
        : `${skipped.length} of those are already on this request.`,
    }, { status: 409 })
  }

  const rows = fresh.map(v => ({
    bid_request_id: params.reqId,
    token: randomUUID().replace(/-/g, ''),
    vendor_company_id: v.company_id || null,
    vendor_name: v.name || null,
    vendor_email: v.email || null,
    // NOBODY HAS BEEN TOLD YET. The column used to default to 'invited', which
    // is what made the row claim otherwise and turned the first email into a
    // reminder. Only a confirmed send below moves it on.
    status: 'pending',
  }))

  const { data, error } = await db.from('bid_invites').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Tell them ───────────────────────────────────────────────────────────
  const [{ data: req }, { data: me }] = await Promise.all([
    db.from('bid_requests').select('title, trade, due_date, projects(name)').eq('id', params.reqId).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
  ])
  const { data: company } = (me as any)?.company_id
    ? await db.from('companies').select('name').eq('id', (me as any).company_id).maybeSingle()
    : { data: null }

  const scope = bidScopeLine((req as any)?.title, (req as any)?.trade)
  const origin = appOrigin(request.headers.get('origin'))

  // One at a time, and never throwing: a send that fails must come back as a
  // result the row can show next to Copy link, not a 500 that loses the invite
  // that was just created. Same contract deliverLink holds for the Send panel.
  const results = await Promise.all((data ?? []).map(async (inv: any) => {
    if (!isEmailAddress(inv.vendor_email)) {
      return { id: inv.id, name: inv.vendor_name, sent: false, reason: 'no_email' as const }
    }
    const email = bidInviteEmail({
      isReminder: false,
      scope,
      dueDate: (req as any)?.due_date ?? null,
      gcName: (company as any)?.name ?? null,
      fromName: (me as any)?.full_name ?? null,
      vendorName: inv.vendor_name,
      url: `${origin}/bid/${inv.token}`,
    })
    const result = await sendEmail({ to: inv.vendor_email, ...email })
    if (result.sent) {
      // Stamped only on a confirmed send - "invited" written over an email that
      // never left is the one outcome worse than a visible failure.
      await db.from('bid_invites').update({ status: 'invited' }).eq('id', inv.id)
    }
    return {
      id: inv.id,
      name: inv.vendor_name,
      email: inv.vendor_email,
      sent: result.sent,
      reason: result.sent ? undefined : result.reason,
      detail: result.sent ? undefined : result.detail,
    }
  }))

  // Invitees who already have an account get the bell too, not just the emailed
  // link - same as the older Bids tab path does.
  const companyIds = Array.from(new Set(rows.map(r => r.vendor_company_id).filter(Boolean) as string[]))
  if (companyIds.length) {
    const { data: profiles } = await db.from('profiles').select('id').in('company_id', companyIds)
    if (profiles?.length) {
      const projectName = (req as any)?.projects?.name
      await notify({
        db,
        userIds: profiles.map(p => p.id),
        type: 'bid_invited',
        title: 'Invited to quote',
        message: `You have been invited to quote ${scope}${projectName ? ` for ${projectName}` : ''}.`,
        link: `/my-bids`,
      })
    }
  }

  return NextResponse.json({ invites: data, results, skipped })
}

export async function DELETE(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inviteId = new URL(request.url).searchParams.get('inviteId')
  if (!inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })
  const { error } = await db.from('bid_invites').delete().eq('id', inviteId).eq('bid_request_id', params.reqId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
