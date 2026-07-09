import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const { data: req } = await db.from('bid_requests')
    .select('id, title, trade, description, due_date, status, project_id, projects(name, address), bid_request_attachments(file_url, file_name)')
    .eq('id', invite.bid_request_id).single()
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: mySubmission } = await db.from('bid_submissions').select('*').eq('bid_invite_id', invite.id).order('created_at', { ascending: false }).limit(1).maybeSingle()

  return NextResponse.json({
    request: {
      title: req.title, trade: req.trade, description: req.description, due_date: req.due_date,
      status: req.status, project_name: (req as any).projects?.name, project_address: (req as any).projects?.address,
      attachments: (req as any).bid_request_attachments ?? [],
    },
    invite: { vendor_name: invite.vendor_name, status: invite.status },
    submission: mySubmission ?? null,
  })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: invite } = await db.from('bid_invites').select('*').eq('token', params.token).single()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  const form = await request.formData()
  const action = form.get('action') as string
  if (action === 'decline') {
    await db.from('bid_invites').update({ status: 'declined' }).eq('id', invite.id)
    return NextResponse.json({ ok: true, status: 'declined' })
  }

  const amountRaw = form.get('amount') as string | null
  const amount = amountRaw ? Number(String(amountRaw).replace(/[^0-9.\-]/g, '')) : null
  const notes = (form.get('notes') as string) || null
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

  const { error } = await db.from('bid_submissions').insert({
    bid_request_id: invite.bid_request_id,
    bid_invite_id: invite.id,
    amount, notes, file_url, file_name, submitted_by_name,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('bid_invites').update({ status: 'submitted' }).eq('id', invite.id)
  return NextResponse.json({ ok: true })
}
